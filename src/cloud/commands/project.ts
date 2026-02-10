import * as vscode from "vscode"
import {
  trackCloudProjectLinked,
  trackCloudProjectUnlinked,
} from "../../utils/telemetry"
import type { ApiService } from "../api"
import type { ConfigService } from "../config"
import type { WorkspaceState } from "../types"
import {
  createNewApp,
  pickExistingApp,
  pickTeam,
  pickWorkspaceFolder,
} from "../ui/pickers"

export async function linkProject(
  apiService: ApiService,
  configService: ConfigService,
  workspaceRoot?: vscode.Uri,
): Promise<vscode.Uri | null> {
  const targetFolder =
    workspaceRoot ??
    (await pickWorkspaceFolder("Select workspace folder to link"))
  if (!targetFolder) return null

  const team = await pickTeam(apiService)
  if (!team) return null

  const app = await pickExistingApp(apiService, team)
  if (!app) return null

  await configService.writeConfig(targetFolder, {
    app_id: app.id,
    team_id: team.id,
  })
  trackCloudProjectLinked(app.slug)
  vscode.window.showInformationMessage(`Linked to ${app.slug}`)
  return targetFolder
}

export async function createAndLinkProject(
  apiService: ApiService,
  configService: ConfigService,
  workspaceRoot?: vscode.Uri,
): Promise<vscode.Uri | null> {
  const targetFolder =
    workspaceRoot ??
    (await pickWorkspaceFolder("Select workspace folder to link"))
  if (!targetFolder) return null

  const team = await pickTeam(apiService)
  if (!team) return null

  const folderName = targetFolder.path.split("/").pop() || "my-app"
  const app = await createNewApp(apiService, team, folderName)
  if (!app) return null

  await configService.writeConfig(targetFolder, {
    app_id: app.id,
    team_id: team.id,
  })
  trackCloudProjectLinked(app.slug)
  vscode.window.showInformationMessage(`Linked to ${app.slug}`)
  return targetFolder
}

export async function unlinkProject(
  configService: ConfigService,
  getState: (uri: vscode.Uri) => WorkspaceState,
  workspaceRoot?: vscode.Uri,
): Promise<vscode.Uri | null> {
  const targetFolder =
    workspaceRoot ??
    (await pickWorkspaceFolder("Select workspace folder to unlink", (uri) => {
      const state = getState(uri)
      return state.status !== "not_configured"
    }))
  if (!targetFolder) return null

  const state = getState(targetFolder)
  const label = state.status === "linked" ? state.app.slug : "this app"

  const confirm = await vscode.window.showWarningMessage(
    `Unlink "${label}" from this project?`,
    { modal: true },
    "Unlink",
  )

  if (confirm === "Unlink") {
    await configService.deleteConfig(targetFolder)
    trackCloudProjectUnlinked(label)
    return targetFolder
  }

  return null
}
