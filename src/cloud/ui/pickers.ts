import * as vscode from "vscode"
import type { ApiService } from "../api"
import { Picker } from "../constants"
import type { App, Team } from "../types"

/**
 * Shows a quick pick to select a team. Auto-selects if only one team.
 */
export async function pickTeam(apiService: ApiService): Promise<Team | null> {
  let teams: Team[]
  try {
    teams = await apiService.getTeams()
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Not authenticated"
        ? Picker.ERR_NOT_AUTHENTICATED
        : Picker.ERR_FETCH_TEAMS
    vscode.window.showErrorMessage(message)
    return null
  }

  if (teams.length === 0) {
    vscode.window.showErrorMessage(Picker.ERR_NO_TEAMS)
    return null
  }

  if (teams.length === 1) {
    return teams[0]
  }

  const teamItems = teams.map((t) => ({ label: t.name, team: t }))
  const picked = await vscode.window.showQuickPick(teamItems, {
    placeHolder: Picker.SELECT_TEAM,
  })

  return picked?.team ?? null
}

/**
 * Shows a quick pick to select an existing app from a team.
 */
export async function pickExistingApp(
  apiService: ApiService,
  team: Team,
): Promise<App | null> {
  let apps: App[]
  try {
    apps = await apiService.getApps(team.id)
  } catch {
    vscode.window.showErrorMessage(Picker.ERR_FETCH_APPS)
    return null
  }

  if (apps.length === 0) {
    vscode.window.showErrorMessage(Picker.ERR_NO_APPS)
    return null
  }

  const appItems = apps.map((a) => ({
    label: a.slug,
    description: a.url,
    app: a,
  }))
  const picked = await vscode.window.showQuickPick(appItems, {
    placeHolder: Picker.SELECT_APP,
  })

  return picked?.app ?? null
}

/**
 * Shows input box to create a new app.
 */
export async function createNewApp(
  apiService: ApiService,
  team: Team,
  defaultName: string,
): Promise<App | null> {
  const appName = await vscode.window.showInputBox({
    prompt: Picker.PROMPT_ENTER_APP_NAME,
    value: defaultName,
    validateInput: (value) => {
      if (!value || value.length < 2) return Picker.ERR_NAME_TOO_SHORT
      if (!/^[a-z0-9-]+$/.test(value)) return Picker.ERR_NAME_INVALID
      return null
    },
  })

  if (!appName) return null

  try {
    const app = await apiService.createApp(team.id, appName)
    vscode.window.showInformationMessage(Picker.MSG_APP_CREATED(app.slug))
    return app
  } catch (error) {
    vscode.window.showErrorMessage(
      Picker.ERR_CREATE_APP(
        error instanceof Error ? error.message : "Unknown error",
      ),
    )
    return null
  }
}
