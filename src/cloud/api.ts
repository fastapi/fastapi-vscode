import * as vscode from "vscode"
import { DEFAULT_BASE_URL, DEFAULT_DASHBOARD_URL } from "../env"
import { getExtensionVersion } from "../extension"
import { log } from "../utils/logger"
import { AUTH_PROVIDER_ID } from "./auth"
import type {
  App,
  Deployment,
  ListResponse,
  Team,
  UploadInfo,
  User,
} from "./types"

function getUserAgentHeaders(): Record<string, string> {
  if (vscode.env.uiKind === vscode.UIKind.Web) return {}
  return { "User-Agent": `fastapi-vscode/${getExtensionVersion()}` }
}

export interface AppLogEntry {
  timestamp: string
  message: string
  level: string
}

export class StreamLogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StreamLogError"
  }
}

export class ApiService {
  constructor(
    public readonly baseUrl: string = DEFAULT_BASE_URL,
    public readonly dashboardUrl: string = DEFAULT_DASHBOARD_URL,
  ) {}

  getDashboardUrl(teamSlug: string, appSlug: string): string {
    return `${this.dashboardUrl}/${teamSlug}/apps/${appSlug}/general`
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const session = await vscode.authentication.getSession(
      AUTH_PROVIDER_ID,
      [],
      { silent: true },
    )
    if (!session) {
      throw new Error("Not authenticated")
    }
    const token = session.accessToken

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...getUserAgentHeaders(),
        ...options.headers,
      },
    })

    if (!response.ok) {
      let detail = ""
      try {
        const body = await response.json()
        detail = typeof body.detail === "string" ? body.detail : ""
      } catch {}

      throw new Error(
        detail ||
          `API request failed: ${options.method || "GET"} ${endpoint} returned ${response.status}`,
      )
    }

    return (await response.json()) as T
  }

  async getUser(token: string): Promise<User | null> {
    try {
      const response = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...getUserAgentHeaders(),
        },
      })
      if (!response.ok) return null
      return (await response.json()) as User
    } catch {
      return null
    }
  }

  async getTeams(): Promise<Team[]> {
    const data = await this.request<ListResponse<Team>>("/teams")
    return data.data
  }

  async getTeam(teamId: string): Promise<Team> {
    return this.request<Team>(`/teams/${teamId}/`)
  }

  async getApps(teamId: string): Promise<App[]> {
    const data = await this.request<ListResponse<App>>(
      `/apps/?team_id=${teamId}`,
    )
    return data.data
  }

  async getApp(appId: string): Promise<App> {
    return this.request<App>(`/apps/${appId}`)
  }

  async createApp(teamId: string, name: string): Promise<App> {
    return this.request<App>("/apps/", {
      method: "POST",
      body: JSON.stringify({ team_id: teamId, name }),
    })
  }

  async createDeployment(appId: string): Promise<Deployment> {
    return this.request<Deployment>(`/apps/${appId}/deployments/`, {
      method: "POST",
    })
  }

  async getUploadUrl(deploymentId: string): Promise<UploadInfo> {
    return this.request<UploadInfo>(`/deployments/${deploymentId}/upload`, {
      method: "POST",
    })
  }

  async completeUpload(deploymentId: string): Promise<void> {
    await this.request<void>(`/deployments/${deploymentId}/upload-complete`, {
      method: "POST",
    })
  }

  async getDeployment(
    appId: string,
    deploymentId: string,
  ): Promise<Deployment> {
    return this.request<Deployment>(
      `/apps/${appId}/deployments/${deploymentId}/`,
    )
  }

  async *streamAppLogs(options: {
    appId: string
    tail: number
    since: string
    follow: boolean
    signal?: AbortSignal
  }): AsyncGenerator<AppLogEntry> {
    const { appId, tail, since, follow, signal } = options
    const session = await vscode.authentication.getSession(
      AUTH_PROVIDER_ID,
      [],
      { silent: true },
    )
    if (!session) {
      throw new Error("Not authenticated")
    }

    const params = new URLSearchParams({
      tail: String(tail),
      since,
      follow: String(follow),
    })
    const response = await fetch(
      `${this.baseUrl}/apps/${appId}/logs/stream?${params}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          ...getUserAgentHeaders(),
        },
        signal,
      },
    )

    if (!response.ok || !response.body) {
      let detail = ""
      try {
        const body = await response.json()
        detail = typeof body.detail === "string" ? body.detail : ""
      } catch {}

      throw new Error(
        detail ||
          `Failed to stream logs: ${response.status} ${response.statusText}`,
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        if (signal?.aborted) return
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()! // last element may be incomplete

        for (const line of lines) {
          if (!line.trim()) continue

          let data: Record<string, unknown>
          try {
            data = JSON.parse(line)
          } catch {
            log(`Failed to parse log line: ${line}`)
            continue
          }

          if (data.type === "heartbeat") continue

          if (data.type === "error") {
            throw new StreamLogError(
              (data.message as string) ?? "Unknown error",
            )
          }
          if (data.timestamp && data.message && data.level) {
            yield data as unknown as AppLogEntry
          } else {
            log(`Unexpected log entry format: ${line}`)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async requestDeviceCode(clientId: string): Promise<{
    device_code: string
    user_code: string
    verification_uri: string
    verification_uri_complete?: string
    expires_in?: number
    interval?: number
  }> {
    const response = await fetch(`${this.baseUrl}/login/device/authorization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...getUserAgentHeaders(),
      },
      body: new URLSearchParams({ client_id: clientId }).toString(),
    })

    if (!response.ok) {
      throw new Error(
        `Device code request failed: ${response.status} ${response.statusText}`,
      )
    }

    const data = (await response.json()) as {
      device_code?: string
      user_code?: string
      verification_uri?: string
      verification_uri_complete?: string
      expires_in?: number
      interval?: number
    }

    if (!data.device_code || !data.user_code || !data.verification_uri) {
      throw new Error("Invalid response from device code endpoint")
    }
    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      verification_uri_complete: data.verification_uri_complete ?? "",
      expires_in: data.expires_in,
      interval: data.interval,
    }
  }

  async pollDeviceToken(
    clientId: string,
    deviceCode: string,
    intervalMs = 5000,
    signal?: AbortSignal,
  ): Promise<string> {
    while (true) {
      if (signal?.aborted) {
        throw new Error("Sign-in cancelled")
      }

      const response = await fetch(`${this.baseUrl}/login/device/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...getUserAgentHeaders(),
        },
        body: new URLSearchParams({
          client_id: clientId,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }).toString(),
        signal,
      })

      const data = (await response.json()) as {
        access_token?: string
        error?: string
      }

      if (response.ok && data.access_token) {
        return data.access_token
      }
      if (data.error === "authorization_pending") {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      } else if (data.error === "expired_token") {
        throw new Error("Device code has expired")
      } else {
        throw new Error(
          `Device token request failed: ${data.error || response.statusText}`,
        )
      }
    }
  }
}
