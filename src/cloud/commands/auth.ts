import * as vscode from "vscode"
import { trackCloudSignOut } from "../../utils/telemetry"
import type { AuthProvider } from "../types"

export async function signOut(authProvider: AuthProvider): Promise<boolean> {
  const confirm = await vscode.window.showWarningMessage(
    "Sign out of FastAPI Cloud?",
    { modal: true },
    "Sign Out",
  )

  if (confirm === "Sign Out") {
    await authProvider.signOut()
    trackCloudSignOut()
    return true
  }

  return false
}
