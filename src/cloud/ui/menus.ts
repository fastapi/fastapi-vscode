import * as vscode from "vscode"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
} from "../../utils/telemetry"
import { ApiService } from "../api"
import { AUTH_PROVIDER_ID } from "../auth"
import type { AuthCommands } from "../commands/auth"
import type { LinkCommands } from "../commands/project"
import {
  BTN_UNLINK,
  MENU_CREATE_NEW,
  MENU_CREATE_NEW_DESC,
  MENU_DASHBOARD,
  MENU_LINK_EXISTING,
  MENU_LINK_EXISTING_DESC,
  MENU_MORE,
  MENU_OPEN_APP,
  MENU_PLACEHOLDER_MORE,
  MENU_PLACEHOLDER_SETUP,
  MENU_SIGN_OUT,
  MENU_SIGN_OUT_DESC,
  MENU_UNLINK_PROJECT,
  MENU_UNLINK_PROJECT_DESC,
  MSG_APP_NOT_FOUND,
  MSG_NO_WORKSPACE,
} from "../constants"
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
      void vscode.authentication.getSession(AUTH_PROVIDER_ID, [], {
        createIfNone: true,
      })
      return
    }

    const activeFolder = this.getActiveWorkspaceFolder()
    if (!activeFolder) {
      vscode.window.showErrorMessage(MSG_NO_WORKSPACE)
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
        label: MENU_LINK_EXISTING,
        description: MENU_LINK_EXISTING_DESC,
        id: "link",
      },
      {
        label: MENU_CREATE_NEW,
        description: MENU_CREATE_NEW_DESC,
        id: "create",
      },
    ]

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: MENU_PLACEHOLDER_SETUP,
    })

    if (selected?.id === "link") {
      await this.linkCommands.linkProject(workspaceRoot)
    } else if (selected?.id === "create") {
      await this.linkCommands.createAndLinkProject(workspaceRoot)
    }
  }

  private async showBrokenLinkMenu(workspaceRoot: vscode.Uri): Promise<void> {
    const selected = await vscode.window.showWarningMessage(
      MSG_APP_NOT_FOUND,
      BTN_UNLINK,
    )

    if (selected === BTN_UNLINK) {
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
        label: MENU_OPEN_APP,
        description: app.url,
        id: "open",
      },
      {
        label: MENU_DASHBOARD,
        description: dashboardUrl,
        id: "dashboard",
      },
      { label: MENU_MORE, id: "more" },
    ]

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: app.slug,
    })

    if (selected) {
      switch (selected.id) {
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
        label: MENU_UNLINK_PROJECT,
        description: MENU_UNLINK_PROJECT_DESC,
        id: "unlink",
      },
      {
        label: MENU_SIGN_OUT,
        description: MENU_SIGN_OUT_DESC,
        id: "signout",
      },
    ]

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: MENU_PLACEHOLDER_MORE,
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
