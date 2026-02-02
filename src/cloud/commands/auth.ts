import * as vscode from "vscode"
import { trackCloudSignOut } from "../../utils/telemetry"
import { AUTH_PROVIDER_ID } from "../auth"
import { Auth, Button } from "../constants"
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
      Auth.MSG_SIGN_OUT_CONFIRM,
      { modal: true },
      Button.SIGN_OUT,
    )

    if (confirm === Button.SIGN_OUT) {
      await this.authProvider.signOut()
      trackCloudSignOut()
      this.onStateChanged()
      return true
    }

    return false
  }
}
