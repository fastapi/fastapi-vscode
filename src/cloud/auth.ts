import {
  type AuthenticationProvider,
  type AuthenticationProviderAuthenticationSessionsChangeEvent,
  type AuthenticationSession,
  authentication,
  Disposable,
  EventEmitter,
  type ExtensionContext,
  env,
  ProgressLocation,
  type SecretStorage,
  UIKind,
  Uri,
  window,
  workspace,
} from "vscode"
import { trackCloudSignIn } from "../utils/telemetry"
import { ApiService } from "./api"

export const AUTH_PROVIDER_ID = "fastapi-vscode"
export const NAME = "FastAPI Cloud"
const AUTH_POLL_INTERVAL_MS = 3000
const SECRET_STORAGE_KEY = "fastapi-cloud-access-token"
export const SESSION_ID = "fastapi-cloud-session"
export const ACCOUNT_ID = "fastapi-cloud-account"

interface AuthConfig {
  access_token: string
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".")

    // Token is malformed, consider it expired
    if (parts.length !== 3) return true

    // Use atob instead of Buffer.from("base64url") for web worker compatibility
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const decoded = JSON.parse(atob(base64))

    if (decoded.exp === undefined) return false
    return Date.now() >= decoded.exp * 1000
  } catch {
    return true
  }
}

export class CloudAuthenticationProvider
  implements AuthenticationProvider, Disposable
{
  private lastAuthState = false
  private cachedLabel: string | null = null

  private pollingInterval?: ReturnType<typeof setInterval>

  private _onDidChangeSessions =
    new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>()
  private _disposable: Disposable

  constructor(private readonly context: ExtensionContext) {
    this._disposable = Disposable.from(
      authentication.registerAuthenticationProvider(
        AUTH_PROVIDER_ID,
        NAME,
        this,
        {
          supportsMultipleAccounts: false,
        },
      ),
    )
  }

  startWatching() {
    // Poll for auth changes since we can't use fs.watch in browser
    // and VS Code's file watcher doesn't work for files outside workspace
    this.pollingInterval = setInterval(
      () => this.checkAndFireAuthState(),
      AUTH_POLL_INTERVAL_MS,
    )
  }

  private async checkAndFireAuthState() {
    const loggedIn = await this.hasValidToken()
    if (loggedIn !== this.lastAuthState) {
      if (loggedIn && !this.lastAuthState) {
        trackCloudSignIn()
      }
      this.lastAuthState = loggedIn
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] })
    }
  }

  private getAuthUri(): Uri | null {
    // In browser (vscode.dev), we can't access local filesystem auth
    if (env.uiKind === UIKind.Web) {
      return null
    }

    const home = process.env.HOME || process.env.USERPROFILE
    if (!home) return null

    const platform = process.platform
    let authPath: string

    if (platform === "darwin") {
      authPath = `${home}/Library/Application Support/fastapi-cli/auth.json`
    } else if (platform === "win32") {
      const appData = process.env.APPDATA || `${home}/AppData/Roaming`
      authPath = `${appData}/fastapi-cli/auth.json`
    } else {
      const xdgData = process.env.XDG_DATA_HOME || `${home}/.local/share`
      authPath = `${xdgData}/fastapi-cli/auth.json`
    }

    return Uri.file(authPath)
  }

  get onDidChangeSessions() {
    return this._onDidChangeSessions.event
  }

  private async getToken(): Promise<string | undefined> {
    if (env.uiKind === UIKind.Web) {
      return this.context.secrets.get(SECRET_STORAGE_KEY)
    }
    const authUri = this.getAuthUri()
    if (!authUri) return undefined
    const content = await workspace.fs.readFile(authUri)
    const authConfig: AuthConfig = JSON.parse(
      Buffer.from(content).toString("utf8"),
    )
    return authConfig.access_token
  }

  public async getSessions(): Promise<AuthenticationSession[]> {
    try {
      const token = await this.getToken()

      if (!token || isTokenExpired(token)) {
        return []
      }

      if (!this.cachedLabel) {
        const info = await ApiService.getUser(token)
        if (info?.email) {
          this.cachedLabel = info.email
        }
      }
      const label = this.cachedLabel ?? NAME

      return [
        {
          id: SESSION_ID,
          accessToken: token,
          account: {
            id: ACCOUNT_ID,
            label,
          },
          scopes: [],
        },
      ]
    } catch {
      return []
    }
  }

  private async hasValidToken(): Promise<boolean> {
    try {
      const token = await this.getToken()
      return !!token && !isTokenExpired(token)
    } catch {
      return false
    }
  }

  async saveToken(token: string): Promise<void> {
    if (env.uiKind === UIKind.Web) {
      // In browser, use SecretStorage
      const secretStorage: SecretStorage = this.context.secrets
      await secretStorage.store(SECRET_STORAGE_KEY, token)
      return
    }

    const authUri = this.getAuthUri()
    if (!authUri) return
    // Otherwise, save to filesystem so that we can share with fastapi-cloud-cli
    const parentUri = Uri.joinPath(authUri, "..")
    await workspace.fs.createDirectory(parentUri)
    await workspace.fs.writeFile(
      authUri,
      Buffer.from(JSON.stringify({ access_token: token }), "utf8"),
    )
  }

  public async createSession(): Promise<AuthenticationSession> {
    // Return existing session if already logged in (e.g. via CLI)
    if (await this.hasValidToken()) {
      const sessions = await this.getSessions()
      return sessions[0]
    }

    let deviceCodeResponse: Awaited<
      ReturnType<typeof ApiService.requestDeviceCode>
    >
    try {
      deviceCodeResponse = await ApiService.requestDeviceCode(AUTH_PROVIDER_ID)
    } catch (error) {
      if (
        error instanceof TypeError &&
        (error.message === "Failed to fetch" ||
          error.message === "fetch failed")
      ) {
        throw new Error(
          "Unable to connect to FastAPI Cloud. Please check your network connection and try again.",
        )
      }
      throw error
    }
    const verificationUri =
      deviceCodeResponse.verification_uri_complete ||
      `${deviceCodeResponse.verification_uri}?user_code=${deviceCodeResponse.user_code}`
    env.openExternal(Uri.parse(verificationUri))

    const intervalMs = (deviceCodeResponse.interval ?? 5) * 1000

    const token = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Signing in to FastAPI Cloud...",
        cancellable: true,
      },
      async (_progress, cancellationToken) => {
        const abortController = new AbortController()
        cancellationToken.onCancellationRequested(() => abortController.abort())

        return await ApiService.pollDeviceToken(
          AUTH_PROVIDER_ID,
          deviceCodeResponse.device_code,
          intervalMs,
          abortController.signal,
        )
      },
    )

    await this.saveToken(token)

    const sessions = await this.getSessions()
    const session = sessions[0]
    this._onDidChangeSessions.fire({
      added: [session],
      removed: [],
      changed: [],
    })
    return session
  }

  public async removeSession(sessionId: string): Promise<void> {
    const authUri = this.getAuthUri()

    const sessions = await this.getSessions()
    const session = sessions.find((s) => s.id === sessionId)
    try {
      // In browsers envs like vscode.dev, we use SecretStorage instead of filesystem
      if (env.uiKind === UIKind.Web) {
        const secretStorage: SecretStorage = this.context.secrets
        await secretStorage.delete(SECRET_STORAGE_KEY)
        // Otherwise, we need to delete the auth file from filesystem if it exists
      } else if (authUri) {
        await workspace.fs.delete(authUri)
      }

      if (session) {
        this._onDidChangeSessions.fire({
          added: [],
          removed: [session],
          changed: [],
        })
      }
    } catch {
      /* file doesn't exist */
    }
  }

  async signOut(): Promise<void> {
    await this.removeSession(SESSION_ID)
    this.cachedLabel = null
  }

  public async dispose() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
    }
    this._disposable.dispose()
  }
}
