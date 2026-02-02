import * as vscode from "vscode"
import {
  trackCloudProjectLinked,
  trackCloudProjectUnlinked,
} from "../../utils/telemetry"
import type { ApiService } from "../api"
import type { ConfigService } from "../config"
import { Button, Picker, Project } from "../constants"
import type { WorkspaceState } from "../types"
import { createNewApp, pickExistingApp, pickTeam } from "../ui/pickers"

async function pickWorkspaceFolder(
  placeHolder: string,
  filter?: (uri: vscode.Uri) => boolean,
): Promise<vscode.Uri | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders

  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage(Project.MSG_NO_WORKSPACE)
    return null
  }

  // Apply filter if provided
  const filteredFolders = filter
    ? workspaceFolders.filter((folder) => filter(folder.uri))
    : workspaceFolders

  if (filteredFolders.length === 0) {
    return null
  }

  if (filteredFolders.length === 1) {
    return filteredFolders[0].uri
  }

  // Multiple folders: let user choose
  const items = filteredFolders.map((folder) => ({
    label: folder.name,
    description: folder.uri.fsPath,
    uri: folder.uri,
  }))

  const selected = await vscode.window.showQuickPick(items, { placeHolder })
  return selected?.uri ?? null
}

export class LinkCommands {
  constructor(
    private apiService: ApiService,
    private configService: ConfigService,
    private onProjectLinked: (uri: vscode.Uri) => Promise<void>,
    private onProjectUnlinked: (uri: vscode.Uri) => Promise<void>,
  ) {}

  async linkProject(workspaceRoot?: vscode.Uri): Promise<void> {
    const targetFolder =
      workspaceRoot ?? (await pickWorkspaceFolder(Picker.SELECT_WORKSPACE_LINK))
    if (!targetFolder) return

    const team = await pickTeam(this.apiService)
    if (!team) return

    const app = await pickExistingApp(this.apiService, team)
    if (!app) return

    await this.configService.writeConfig(targetFolder, {
      app_id: app.id,
      team_id: team.id,
    })
    trackCloudProjectLinked(app.slug)
    vscode.window.showInformationMessage(Project.MSG_LINKED(app.slug))
    await this.onProjectLinked(targetFolder)
  }

  async createAndLinkProject(workspaceRoot?: vscode.Uri): Promise<void> {
    const targetFolder =
      workspaceRoot ?? (await pickWorkspaceFolder(Picker.SELECT_WORKSPACE_LINK))
    if (!targetFolder) return

    const team = await pickTeam(this.apiService)
    if (!team) return

    const folderName = targetFolder.path.split("/").pop() || "my-app"
    const app = await createNewApp(this.apiService, team, folderName)
    if (!app) return

    await this.configService.writeConfig(targetFolder, {
      app_id: app.id,
      team_id: team.id,
    })
    trackCloudProjectLinked(app.slug)
    vscode.window.showInformationMessage(Project.MSG_LINKED(app.slug))
    await this.onProjectLinked(targetFolder)
  }

  async unlinkProject(
    workspaceRoot: vscode.Uri | undefined,
    getState: (uri: vscode.Uri) => WorkspaceState,
  ): Promise<void> {
    const targetFolder =
      workspaceRoot ??
      (await pickWorkspaceFolder(Picker.SELECT_WORKSPACE_UNLINK, (uri) => {
        const state = getState(uri)
        // Only show folders that have a config (any state except not_configured)
        return state.status !== "not_configured"
      }))
    if (!targetFolder) return

    const state = getState(targetFolder)

    const label = state.status === "linked" ? state.app.slug : "this app"
    const confirm = await vscode.window.showWarningMessage(
      Project.MSG_UNLINK_CONFIRM(label),
      { modal: true },
      Button.UNLINK,
    )

    if (confirm === Button.UNLINK) {
      await this.configService.deleteConfig(targetFolder)
      trackCloudProjectUnlinked(label)
      await this.onProjectUnlinked(targetFolder)
    }
  }
}
