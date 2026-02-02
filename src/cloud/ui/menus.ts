import * as vscode from "vscode"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
} from "../../utils/telemetry"
import { ApiService } from "../api"
import { AUTH_PROVIDER_ID } from "../auth"
import type { AuthCommands } from "../commands/auth"
import type { LinkCommands } from "../commands/project"
import type { WorkspaceState } from "../types"

export class MenuHandler {
  constructor(
    private authCommands: AuthCommands,
    private linkCommands: LinkCommands,
    private getState: (uri: vscode.Uri) => WorkspaceState,
    private getActiveWorkspaceFolder: () => vscode.Uri | null,
  ) {}

  async showMenu(): Promise<void> {
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

    const activeFolder = this.getActiveWorkspaceFolder()
    if (!activeFolder) {
      vscode.window.showErrorMessage("No workspace folder open")
      return
    }

    const state = this.getState(activeFolder)

    switch (state.status) {
      case "not_configured":
      case "refreshing":
        await this.showSetupMenu(activeFolder)
        break
      case "not_found":
      case "error":
        await this.showBrokenLinkMenu(activeFolder)
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

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Set up FastAPI Cloud",
    })

    if (selected?.id === "link") {
      await this.linkCommands.linkProject(workspaceRoot)
    } else if (selected?.id === "create") {
      await this.linkCommands.createAndLinkProject(workspaceRoot)
    }
  }

  private async showBrokenLinkMenu(workspaceRoot: vscode.Uri): Promise<void> {
    const selected = await vscode.window.showWarningMessage(
      "This project is linked to a FastAPI Cloud app that could not be found. Unlink it, then link to the correct app.",
      "Unlink",
    )

    if (selected === "Unlink") {
      await this.linkCommands.unlinkProject(workspaceRoot, this.getState)
    }
  }

  private async showAppMenu(workspaceRoot: vscode.Uri): Promise<void> {
    const state = this.getState(workspaceRoot)
    if (state.status !== "linked") return

    const { app, team } = state
    const dashboardUrl = ApiService.getDashboardUrl(team.slug, app.slug)
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
          if (app?.url) {
            vscode.env.openExternal(vscode.Uri.parse(app.url))
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

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "More options",
    })

    switch (selected?.id) {
      case "unlink":
        await this.linkCommands.unlinkProject(workspaceRoot, this.getState)
        break
      case "signout":
        await this.authCommands.signOut()
        break
    }
  }
}
