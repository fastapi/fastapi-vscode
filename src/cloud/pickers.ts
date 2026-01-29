import * as vscode from "vscode"
import type { ApiService } from "./api"
import type { App, Team } from "./types"

export interface AppSelection {
  app: App
  team: Team
}

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
        ? "Please sign in to FastAPI Cloud first."
        : "Failed to fetch teams. Please check your connection."
    vscode.window.showErrorMessage(message)
    return null
  }

  if (teams.length === 0) {
    vscode.window.showErrorMessage(
      "No teams found. Please create a team on FastAPI Cloud first.",
    )
    return null
  }

  if (teams.length === 1) {
    return teams[0]
  }

  const teamItems = teams.map((t) => ({ label: t.name, team: t }))
  const picked = await vscode.window.showQuickPick(teamItems, {
    placeHolder: "Select a team",
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
    vscode.window.showErrorMessage("Failed to fetch apps.")
    return null
  }

  if (apps.length === 0) {
    vscode.window.showErrorMessage(
      "No apps found for this team. Create an app on FastAPI Cloud first.",
    )
    return null
  }

  const appItems = apps.map((a) => ({
    label: a.slug,
    description: a.url,
    app: a,
  }))
  const picked = await vscode.window.showQuickPick(appItems, {
    placeHolder: "Select an app",
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
    prompt: "Enter app name",
    value: defaultName,
    validateInput: (value) => {
      if (!value || value.length < 2)
        return "Name must be at least 2 characters"
      if (!/^[a-z0-9-]+$/.test(value))
        return "Name can only contain lowercase letters, numbers, and hyphens"
      return null
    },
  })

  if (!appName) return null

  try {
    const app = await apiService.createApp(team.id, appName)
    vscode.window.showInformationMessage(`Created app: ${app.slug}`)
    return app
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create app: ${error instanceof Error ? error.message : "Unknown error"}`,
    )
    return null
  }
}

/**
 * Full flow to select or create an app.
 * Returns the selected/created app and team, or null if cancelled.
 */
export async function pickOrCreateApp(
  apiService: ApiService,
  defaultAppName: string,
): Promise<AppSelection | null> {
  const team = await pickTeam(apiService)
  if (!team) return null

  const choice = await vscode.window.showQuickPick(
    [
      { label: "Create new app", id: "new" },
      { label: "Use existing app", id: "existing" },
    ],
    {
      placeHolder: "Create a new app or use an existing one?",
    },
  )

  if (!choice) return null

  let app: App | null
  if (choice.id === "existing") {
    app = await pickExistingApp(apiService, team)
  } else {
    app = await createNewApp(apiService, team, defaultAppName)
  }

  if (!app) return null

  return { app, team }
}
