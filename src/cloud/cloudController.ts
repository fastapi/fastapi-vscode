import * as vscode from "vscode"
import { log } from "../utils/logger"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
  trackCloudProjectLinked,
  trackCloudProjectUnlinked,
  trackCloudSignOut,
} from "../utils/telemetry"
import { ApiService } from "./api"
import { AUTH_PROVIDER_ID } from "./auth"
import type { ConfigService } from "./config"
import { createNewApp, pickExistingApp, pickTeam } from "./pickers"
import type { App, Team } from "./types"

interface AuthProvider {
  signOut(): Promise<void>
}

export class CloudController {
  private statusBarItem: vscode.StatusBarItem
  private currentApp: App | null = null
  private currentTeam: Team | null = null
  private hasConfig = false
  private workspaceRoot: vscode.Uri | null = null
  private refreshing = false
  private appNotFoundWarningShown = false
  private sessionListener: vscode.Disposable | null = null

  constructor(
    private authProvider: AuthProvider,
    private configService: ConfigService,
    private apiService: ApiService,
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    )

    this.statusBarItem.command = "fastapi-vscode.cloudMenu"
  }

  showStatusBar() {
    this.statusBarItem.text = "$(cloud) FastAPI Cloud"
    this.statusBarItem.show()
    if (!this.sessionListener) {
      this.sessionListener = vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id === AUTH_PROVIDER_ID) this.refresh()
      })
    }
  }

  async initialize(workspaceRoot: vscode.Uri) {
    this.workspaceRoot = workspaceRoot
    this.configService.onConfigStateChanged(() => this.refresh())
    this.configService.startWatching(workspaceRoot)

    this.showStatusBar()
    await this.refresh()
  }

  async refresh() {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const session = await vscode.authentication.getSession(
        AUTH_PROVIDER_ID,
        [],
        { silent: true },
      )
      if (!session) {
        this.statusBarItem.text = "$(cloud) Sign into FastAPI Cloud"
        return
      }

      if (!this.workspaceRoot) {
        this.statusBarItem.text = "$(cloud) Set up FastAPI Cloud"
        return
      }

      const config = await this.configService.getConfig(this.workspaceRoot)

      if (!config) {
        log(`No config found at ${this.workspaceRoot.toString()}`)
        this.hasConfig = false
        this.currentApp = null
        this.currentTeam = null
        this.statusBarItem.text = "$(cloud) Set up FastAPI Cloud"
        return
      }

      this.hasConfig = true

      try {
        this.currentApp = await this.apiService.getApp(config.app_id)
        this.currentTeam = await this.apiService.getTeam(config.team_id)

        if (this.currentApp) {
          this.statusBarItem.text = `$(cloud) ${this.currentApp.slug}`
        }
      } catch (err) {
        log(`Failed to fetch app/team: ${err}`)
        this.currentApp = null
        this.currentTeam = null

        const is404 =
          err instanceof Error && err.message.includes("returned 404")

        if (is404) {
          this.statusBarItem.text = "$(warning) FastAPI Cloud"
          if (!this.appNotFoundWarningShown) {
            this.appNotFoundWarningShown = true
            vscode.window
              .showWarningMessage(
                "This project is linked to a FastAPI Cloud app that could not be found. You may need to unlink and relink it.",
                "Unlink",
              )
              .then((selected) => {
                if (selected === "Unlink") this.unlinkProject()
              })
          }
        } else {
          // Transient error (network, 500, etc.) — don't bother the user,
          // next refresh will retry automatically
          this.statusBarItem.text = "$(cloud) Set up FastAPI Cloud"
        }
      }
    } finally {
      this.refreshing = false
    }
  }

  async showMenu() {
    const session = await vscode.authentication.getSession(
      AUTH_PROVIDER_ID,
      [],
      { silent: true },
    )
    if (!session) {
      vscode.authentication.getSession(AUTH_PROVIDER_ID, [], {
        createIfNone: true,
      })
      return
    }

    if (!this.currentApp && !this.hasConfig) {
      await this.showSetupMenu()
    } else if (!this.currentApp && this.hasConfig) {
      await this.showBrokenLinkMenu()
    } else {
      await this.showAppMenu()
    }
  }

  private async showSetupMenu() {
    const items = [
      {
        label: "$(link) Link Existing App",
        description: "Connect to an app on FastAPI Cloud",
        id: "link",
      },
      {
        label: "$(add) Create New App",
        description: "Create a new app and link it",
        id: "create",
      },
    ]

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Set up FastAPI Cloud",
    })

    if (selected?.id === "link") {
      vscode.commands.executeCommand("fastapi-vscode.linkApp")
    } else if (selected?.id === "create") {
      await this.createAndLinkProject()
    }
  }

  private async showBrokenLinkMenu() {
    const selected = await vscode.window.showWarningMessage(
      "This project is linked to a FastAPI Cloud app that could not be found. Unlink it, then link to the correct app.",
      "Unlink",
    )

    if (selected === "Unlink") {
      await this.unlinkProject()
    }
  }

  private async showAppMenu() {
    if (!this.currentApp) return
    const app = this.currentApp
    const dashboardUrl = this.currentTeam
      ? ApiService.getDashboardUrl(this.currentTeam.slug, app.slug)
      : undefined
    const items = [
      {
        label: "$(globe) Open App",
        description: app.url,
        id: "open",
      },
      {
        label: "$(link-external) Dashboard",
        description: dashboardUrl,
        id: "dashboard",
      },
      { label: "$(ellipsis) More", id: "more" },
    ]

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: app.slug,
    })

    if (selected) {
      switch (selected.id) {
        case "open":
          if (this.currentApp?.url) {
            vscode.env.openExternal(vscode.Uri.parse(this.currentApp.url))
            trackCloudAppOpened(app.slug)
          }
          break
        case "dashboard":
          if (dashboardUrl) {
            vscode.env.openExternal(vscode.Uri.parse(dashboardUrl))
            trackCloudDashboardOpened(app.slug)
          }
          break
        case "more":
          await this.showMoreMenu()
          break
      }
    }
  }

  private async saveLink(app: App, team: Team) {
    await this.configService.writeConfig(this.workspaceRoot!, {
      app_id: app.id,
      team_id: team.id,
    })
    trackCloudProjectLinked(app.slug)
    vscode.window.showInformationMessage(`Linked to ${app.slug}`)
    await this.refresh()
  }

  async createAndLinkProject() {
    if (!this.workspaceRoot) {
      vscode.window.showErrorMessage("No workspace folder open")
      return
    }

    const team = await pickTeam(this.apiService)
    if (!team) return

    const folderName = this.workspaceRoot.path.split("/").pop() || "my-app"
    const app = await createNewApp(this.apiService, team, folderName)
    if (!app) return

    await this.saveLink(app, team)
  }

  async linkProject() {
    if (!this.workspaceRoot) {
      vscode.window.showErrorMessage("No workspace folder open")
      return
    }

    const team = await pickTeam(this.apiService)
    if (!team) return

    const app = await pickExistingApp(this.apiService, team)
    if (!app) return

    await this.saveLink(app, team)
  }

  private async showMoreMenu() {
    const items = [
      {
        label: "$(trash) Unlink Project",
        description: "Disconnect from FastAPI Cloud app",
        id: "unlink",
      },
      {
        label: "$(sign-out) Sign Out",
        description: "Sign out of FastAPI Cloud",
        id: "signout",
      },
    ]

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "More options",
    })

    switch (selected?.id) {
      case "unlink":
        await this.unlinkProject()
        break
      case "signout":
        await this.signOut()
        break
    }
  }

  async signOut() {
    const confirm = await vscode.window.showWarningMessage(
      "Sign out of FastAPI Cloud?",
      { modal: true },
      "Sign Out",
    )

    if (confirm === "Sign Out") {
      await this.authProvider.signOut()
      trackCloudSignOut()
      this.currentApp = null
      this.currentTeam = null
      await this.refresh()
    }
  }

  async unlinkProject() {
    if (!this.workspaceRoot || !this.hasConfig) {
      return
    }

    const label = this.currentApp?.slug ?? "this app"
    const confirm = await vscode.window.showWarningMessage(
      `Unlink "${label}" from this project?`,
      { modal: true },
      "Unlink",
    )

    if (confirm === "Unlink") {
      await this.configService.deleteConfig(this.workspaceRoot)
      trackCloudProjectUnlinked(label)
      this.currentApp = null
      this.currentTeam = null
      this.hasConfig = false
      this.appNotFoundWarningShown = false
      await this.refresh()
    }
  }

  dispose() {
    this.sessionListener?.dispose()
    this.statusBarItem.dispose()
  }
}
