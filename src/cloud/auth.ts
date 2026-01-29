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

const CLIENT_ID = "fastapi-vscode"
const NAME = "FastAPI Cloud"
const AUTH_POLL_INTERVAL_MS = 3000

interface AuthConfig {
  access_token: string
}

interface UserInfo {
  email: string
  full_name: string
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".")

    // Token is malformed, consider it expired
    if (parts.length !== 3) return true

    const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString())

    if (decoded.exp === undefined) return false
    return Date.now() >= decoded.exp * 1000
  } catch {
    return true
  }
}

export class CloudAuthenticationProvider
  implements AuthenticationProvider, Disposable
{
  private authUri: Uri | null = null
  private lastAuthState = false
  private cachedLabel: string | null = null

  private pollingInterval?: ReturnType<typeof setInterval>

  private _onDidChangeSessions =
    new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>()
  private _disposable: Disposable

  constructor(private readonly context: ExtensionContext) {
    this._disposable = Disposable.from(
      authentication.registerAuthenticationProvider(CLIENT_ID, NAME, this, {
        supportsMultipleAccounts: false,
      }),
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
    const loggedIn = await this.isLoggedIn()
    if (loggedIn !== this.lastAuthState) {
      // Track sign in when transitioning from logged out to logged in
      if (loggedIn && !this.lastAuthState) {
        trackCloudSignIn()
      }
      this.lastAuthState = loggedIn
      this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] })
    }
  }
  private getAuthUri(): Uri | null {
    if (this.authUri) return this.authUri
    // In browser (vscode.dev), we can't access local filesystem auth
    if (env.uiKind === UIKind.Web) {
      return null
    }

    // Get home directory from environment
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

    this.authUri = Uri.file(authPath)
    return this.authUri
  }

  get onDidChangeSessions() {
    return this._onDidChangeSessions.event
  }

  private async fetchUserInfo(token: string): Promise<UserInfo | null> {
    try {
      const response = await fetch(`${ApiService.BASE_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
      if (!response.ok) return null
      const data = (await response.json()) as UserInfo
      return data
    } catch {
      return null
    }
  }

  public async getSessions(): Promise<AuthenticationSession[]> {
    const authUri = this.getAuthUri()

    try {
      let token: string | undefined

      if (env.uiKind === UIKind.Web) {
        // In browser, use SecretStorage
        const secretStorage: SecretStorage = this.context.secrets
        token = await secretStorage.get("fastapi-cloud-access-token")
      } else {
        if (!authUri) return []
        const content = await workspace.fs.readFile(authUri)
        const authConfig: AuthConfig = JSON.parse(
          Buffer.from(content).toString("utf8"),
        )
        token = authConfig.access_token
      }

      if (!token || isTokenExpired(token)) {
        return []
      }

      // Fetch user info for account label (use cached value if available)
      let label = this.cachedLabel
      if (!label) {
        const userInfo = await this.fetchUserInfo(token)
        label = userInfo?.email ?? NAME
        this.cachedLabel = label
      }

      return [
        {
          id: "fastapi-cloud-session",
          accessToken: token,
          account: {
            id: "fastapi-cloud-account",
            label,
          },
          scopes: [],
        },
      ]
    } catch {
      return []
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const token = await this.getSessions().then(
      (sessions) => sessions[0]?.accessToken,
    )
    if (!token) {
      return false
    }
    return !isTokenExpired(token)
  }

  async saveToken(token: string): Promise<void> {
    if (env.uiKind === UIKind.Web) {
      // In browser, use SecretStorage
      const secretStorage: SecretStorage = this.context.secrets
      await secretStorage.store("fastapi-cloud-access-token", token)
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
    if (await this.isLoggedIn()) {
      const sessions = await this.getSessions()
      return sessions[0]
    }

    let deviceCodeResponse: Awaited<
      ReturnType<typeof ApiService.requestDeviceCode>
    >
    try {
      deviceCodeResponse = await ApiService.requestDeviceCode(CLIENT_ID)
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
          CLIENT_ID,
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
    try {
      const sessions = await this.getSessions()
      const session = sessions.find((s) => s.id === sessionId)
      if (session) {
        this._onDidChangeSessions.fire({
          added: [],
          removed: [session],
          changed: [],
        })
      }
      // In browsers envs like vscode.dev, we use SecretStorage instead of filesystem
      if (env.uiKind === UIKind.Web) {
        const secretStorage: SecretStorage = this.context.secrets
        await secretStorage.delete("fastapi-cloud-access-token")
        // Otherwise, we need to delete the auth file from filesystem if it exists
      } else if (authUri) {
        await workspace.fs.delete(authUri)
      }
    } catch {
      /* file doesn't exist */
    }
  }

  async signOut(): Promise<void> {
    this.cachedLabel = null
    const sessions = await this.getSessions()
    for (const session of sessions) {
      await this.removeSession(session.id)
    }
  }

  public async dispose() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
    }
    this._disposable.dispose()
  }
}
