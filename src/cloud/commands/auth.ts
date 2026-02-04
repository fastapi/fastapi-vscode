import * as vscode from "vscode"
import { trackCloudSignOut } from "../../utils/telemetry"
import { AUTH_PROVIDER_ID } from "../auth"
import type { AuthProvider } from "../types"

export class AuthCommands {
  constructor(
    private authProvider: AuthProvider,
    private onStateChanged: () => void,
  ) {}

  async signIn(): Promise<void> {
    await vscode.authentication.getSession(AUTH_PROVIDER_ID, [], {
      createIfNone: true,
    })
  }

  async signOut(): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
      "Sign out of FastAPI Cloud?",
      { modal: true },
      "Sign Out",
    )

    if (confirm === "Sign Out") {
      await this.authProvider.signOut()
      trackCloudSignOut()
      this.onStateChanged()
      return true
    }

    return false
  }
}
