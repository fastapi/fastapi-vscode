import * as vscode from "vscode"
import { trackCloudSignOut } from "../../utils/telemetry"
import { AUTH_PROVIDER_ID } from "../auth"
import type { AuthProvider } from "../types"

// Message constants
const MSG_SIGN_OUT_CONFIRM = "Sign out of FastAPI Cloud?"
const BTN_SIGN_OUT = "Sign Out"

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
      MSG_SIGN_OUT_CONFIRM,
      { modal: true },
      BTN_SIGN_OUT,
    )

    if (confirm === BTN_SIGN_OUT) {
      await this.authProvider.signOut()
      trackCloudSignOut()
      this.onStateChanged()
      return true
    }

    return false
  }
}
