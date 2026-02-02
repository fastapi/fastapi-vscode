import * as vscode from "vscode"
import { log } from "../utils/logger"
import type { ApiService } from "./api"
import { AUTH_PROVIDER_ID } from "./auth"
import { AuthCommands } from "./commands/auth"
import { LinkCommands } from "./commands/project"
import type { ConfigService } from "./config"
import { Button, Project } from "./constants"
import type { AuthProvider, WorkspaceState } from "./types"
import { MenuHandler } from "./ui/menus"
import { StatusBarManager } from "./ui/statusBar"

export class CloudController {
  private workspaceStates = new Map<string, WorkspaceState>()
  private statusBarManager: StatusBarManager
  private menuHandler: MenuHandler
  private authCommands: AuthCommands
  private linkCommands: LinkCommands
  private sessionListener?: vscode.Disposable
  private refreshPromises = new Map<string, Promise<void>>()

  constructor(
    authProvider: AuthProvider,
    private configService: ConfigService,
    private apiService: ApiService,
    statusBarItem: vscode.StatusBarItem,
  ) {
    this.authCommands = new AuthCommands(authProvider, () => {
      this.workspaceStates.clear()
      this.statusBarManager.update()
    })

    this.linkCommands = new LinkCommands(
      apiService,
      configService,
      async (uri) => {
        await this.refresh(uri)
        await this.statusBarManager.update()
      },
      async (uri) => {
        await this.refresh(uri)
        await this.statusBarManager.update()
      },
    )

    this.statusBarManager = new StatusBarManager(
      statusBarItem,
      (uri) => this.getState(uri),
      () => this.getActiveWorkspaceFolder(),
    )

    this.menuHandler = new MenuHandler(
      this.authCommands,
      this.linkCommands,
      (uri) => this.getState(uri),
      () => this.getActiveWorkspaceFolder(),
    )
  }

  private getState(uri: vscode.Uri): WorkspaceState {
    const key = uri.toString()
    return this.workspaceStates.get(key) ?? { status: "not_configured" }
  }

  private setState(uri: vscode.Uri, state: WorkspaceState): void {
    this.workspaceStates.set(uri.toString(), state)
  }

  private deleteState(uri: vscode.Uri): void {
    this.workspaceStates.delete(uri.toString())
  }

  private getActiveWorkspaceFolder(): vscode.Uri | null {
    const activeEditor = vscode.window.activeTextEditor
    if (activeEditor) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        activeEditor.document.uri,
      )
      if (workspaceFolder) {
        return workspaceFolder.uri
      }
    }

    // Fallback to first workspace folder
    return vscode.workspace.workspaceFolders?.[0]?.uri ?? null
  }

  showStatusBar(): void {
    this.statusBarManager.show()

    if (!this.sessionListener) {
      this.sessionListener = vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id === AUTH_PROVIDER_ID) this.refreshAll()
      })
    }
  }

  async initialize(): Promise<void> {
    this.configService.onConfigStateChanged(() => this.refreshAll())

    // Initialize all workspace folders in parallel
    const workspaceFolders = vscode.workspace.workspaceFolders ?? []
    await Promise.all(
      workspaceFolders.map((folder) => {
        this.configService.startWatching(folder.uri)
        return this.refresh(folder.uri)
      }),
    )

    // Fire-and-forget status bar update (UI-only, doesn't affect logic)
    this.statusBarManager.update()
  }

  async addWorkspaceFolder(uri: vscode.Uri): Promise<void> {
    this.configService.startWatching(uri)
    await this.refresh(uri)
    // Fire-and-forget status bar update (UI-only, doesn't affect logic)
    this.statusBarManager.update()
  }

  removeWorkspaceFolder(uri: vscode.Uri): void {
    this.deleteState(uri)
    // Fire-and-forget status bar update (UI-only, doesn't affect logic)
    this.statusBarManager.update()
  }

  async refreshAll(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? []
    for (const folder of workspaceFolders) {
      await this.refresh(folder.uri)
    }
    // Fire-and-forget status bar update (UI-only, doesn't affect logic)
    this.statusBarManager.update()
  }

  async refresh(workspaceRoot: vscode.Uri): Promise<void> {
    const key = workspaceRoot.toString()

    // If a refresh is already in progress, wait for it to complete
    const existing = this.refreshPromises.get(key)
    if (existing) {
      await existing
      return
    }

    // Start a new refresh and track the promise
    const refreshPromise = this.doRefresh(workspaceRoot)
    this.refreshPromises.set(key, refreshPromise)

    try {
      await refreshPromise
    } finally {
      this.refreshPromises.delete(key)
    }
  }

  private async doRefresh(workspaceRoot: vscode.Uri): Promise<void> {
    const currentState = this.getState(workspaceRoot)
    this.setState(workspaceRoot, { status: "refreshing" })

    try {
      let session: vscode.AuthenticationSession | undefined
      try {
        session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, [], {
          silent: true,
        })
      } catch (err) {
        // Auth provider may not be ready yet or session request was canceled
        log(`Failed to get session: ${err}`)
        this.setState(workspaceRoot, { status: "not_configured" })
        return
      }

      if (!session) {
        this.setState(workspaceRoot, { status: "not_configured" })
        return
      }

      const config = await this.configService.getConfig(workspaceRoot)

      if (!config) {
        log(`No config found at ${workspaceRoot.toString()}`)
        this.setState(workspaceRoot, { status: "not_configured" })
        return
      }

      try {
        const [app, team] = await Promise.all([
          this.apiService.getApp(config.app_id),
          this.apiService.getTeam(config.team_id),
        ])
        this.setState(workspaceRoot, { status: "linked", app, team })
      } catch (err) {
        log(`Failed to fetch app/team: ${err}`)
        const is404 =
          err instanceof Error && err.message.includes("returned 404")

        if (is404) {
          const shouldShowWarning =
            currentState.status !== "not_found" || !currentState.warningShown
          this.setState(workspaceRoot, {
            status: "not_found",
            warningShown:
              currentState.status === "not_found" && currentState.warningShown,
          })

          if (shouldShowWarning) {
            vscode.window
              .showWarningMessage(Project.MSG_APP_NOT_FOUND, Button.UNLINK)
              .then((selected) => {
                if (selected === Button.UNLINK) {
                  // Fire-and-forget - user action triggered from warning
                  void this.unlinkProject(workspaceRoot)
                }
                // Mark warning as shown after user dismisses it
                const state = this.getState(workspaceRoot)
                if (state.status === "not_found") {
                  this.setState(workspaceRoot, {
                    status: "not_found",
                    warningShown: true,
                  })
                }
              })
          }
        } else {
          // Transient error (network, 500, etc.)
          this.setState(workspaceRoot, { status: "error" })
        }
      }
    } catch (err) {
      log(`Unexpected error in refresh: ${err}`)
      this.setState(workspaceRoot, { status: "error" })
    }
  }

  async showMenu(): Promise<void> {
    await this.menuHandler.showMenu()
  }

  async createAndLinkProject(workspaceRoot?: vscode.Uri): Promise<void> {
    await this.linkCommands.createAndLinkProject(workspaceRoot)
  }

  async linkProject(workspaceRoot?: vscode.Uri): Promise<void> {
    await this.linkCommands.linkProject(workspaceRoot)
  }

  async signOut(): Promise<void> {
    await this.authCommands.signOut()
  }

  async unlinkProject(workspaceRoot?: vscode.Uri): Promise<void> {
    await this.linkCommands.unlinkProject(workspaceRoot, (uri) =>
      this.getState(uri),
    )
  }

  dispose(): void {
    this.sessionListener?.dispose()
    this.statusBarManager.dispose()
  }
}
