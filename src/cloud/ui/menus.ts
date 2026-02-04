import * as vscode from "vscode"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
} from "../../utils/telemetry"
import { ApiService } from "../api"
import { AUTH_PROVIDER_ID } from "../auth"
import type { WorkspaceState } from "../types"
import { ui } from "./dialogs"

export interface MenuActions {
  signOut: () => Promise<void>
  linkProject: (uri: vscode.Uri) => Promise<void>
  createAndLinkProject: (uri: vscode.Uri) => Promise<void>
  unlinkProject: (uri: vscode.Uri) => Promise<void>
  deploy: (uri: vscode.Uri) => Promise<void>
}

/**
 * MenuHandler shows interactive menus for FastAPI Cloud actions in the status bar.
 * It adapts the menu options based on the current workspace state.
 */
export class MenuHandler {
  constructor(
    private getState: (uri: vscode.Uri) => WorkspaceState,
    private getActiveWorkspaceFolder: () => vscode.Uri | null,
    private actions: MenuActions,
  ) {}

  async showMenu(): Promise<void> {
    const session = await vscode.authentication.getSession(
      AUTH_PROVIDER_ID,
      [],
      { silent: true },
    )
    if (!session) {
      void vscode.authentication.getSession(AUTH_PROVIDER_ID, [], {
        createIfNone: true,
      })
      return
    }

    const activeFolder = this.getActiveWorkspaceFolder()
    if (!activeFolder) {
      ui.showErrorMessage("No workspace folder open")
      return
    }

    const state = this.getState(activeFolder)

    switch (state.status) {
      case "not_configured":
      case "refreshing":
      case "not_found":
      case "error":
        await this.showSetupMenu(activeFolder)
        break
      case "linked":
        await this.showAppMenu(activeFolder)
        break
    }
  }

  private async showSetupMenu(workspaceRoot: vscode.Uri): Promise<void> {
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

    const selected = await ui.showQuickPick(items, {
      placeHolder: "Set up FastAPI Cloud",
    })

    if (selected?.id === "link") {
      await this.actions.linkProject(workspaceRoot)
    } else if (selected?.id === "create") {
      await this.actions.createAndLinkProject(workspaceRoot)
    }
  }

  private async showAppMenu(workspaceRoot: vscode.Uri): Promise<void> {
    const state = this.getState(workspaceRoot)
    if (state.status !== "linked") return

    const { app, team } = state
    const dashboardUrl = ApiService.getDashboardUrl(team.slug, app.slug)
    const items = [
      {
        label: "$(rocket) Deploy App",
        description: "Deploy your FastAPI app",
        id: "deploy",
      },
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

    const selected = await ui.showQuickPick(items, {
      placeHolder: app.slug,
    })

    if (selected) {
      switch (selected.id) {
        case "deploy":
          await this.actions.deploy(workspaceRoot)
          break
        case "open":
          vscode.env.openExternal(vscode.Uri.parse(app.url))
          trackCloudAppOpened(app.slug)
          break
        case "dashboard":
          if (dashboardUrl) {
            vscode.env.openExternal(vscode.Uri.parse(dashboardUrl))
            trackCloudDashboardOpened(app.slug)
          }
          break
        case "more":
          await this.showMoreMenu(workspaceRoot)
          break
      }
    }
  }

  private async showMoreMenu(workspaceRoot: vscode.Uri): Promise<void> {
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

    const selected = await ui.showQuickPick(items, {
      placeHolder: "More options",
    })

    switch (selected?.id) {
      case "unlink":
        await this.actions.unlinkProject(workspaceRoot)
        break
      case "signout":
        await this.actions.signOut()
        break
    }
  }
}
