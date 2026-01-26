import { PostHog } from "posthog-node"
import type { TelemetryConfig } from "./types"

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || ""
const POSTHOG_HOST = "https://eu.i.posthog.com"

/** Flush after this many events are queued */
const FLUSH_AT = 10
/** Flush after this many milliseconds (30 seconds) */
const FLUSH_INTERVAL_MS = 30000

/** Python packages to track versions for */
export const TRACKED_PACKAGES = [
  "fastapi",
  "fastapi-cli",
  "fastapi-cloud-cli",
  "typer",
  "starlette",
  "pydantic",
] as const

export class TelemetryClient {
  private posthog: PostHog | null = null
  private userId: string | null = null
  private config: TelemetryConfig | null = null
  private initialized = false
  private packageVersions: Record<string, string | undefined> = {}
  private sessionId: string | null = null
  private sessionStartTime: number | null = null

  init(config: TelemetryConfig): void {
    if (this.initialized || !config.isEnabled() || !POSTHOG_API_KEY) return

    this.config = config
    this.userId = config.userId
    this.sessionId = crypto.randomUUID()
    this.sessionStartTime = Date.now()

    this.posthog = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      disableGeoip: true,
      flushAt: FLUSH_AT,
      flushInterval: FLUSH_INTERVAL_MS,
    })

    // Identify user with static properties available at init time.
    // Python/FastAPI versions are added later via setVersions() and included in events,
    // since they require async detection and can change during the session.
    this.posthog.identify({
      distinctId: this.userId,
      properties: {
        client: config.clientInfo.client,
        app_name: config.clientInfo.app_name,
        app_host: config.clientInfo.app_host,
        is_remote: config.clientInfo.is_remote,
        remote_name: config.clientInfo.remote_name,
        extension_version: config.extensionVersion,
      },
    })

    this.initialized = true
  }

  /**
   * Set package versions to include in all events.
   * Call this after detecting versions from the Python extension.
   */
  setVersions(versions: Record<string, string | undefined>): void {
    this.packageVersions = versions
  }

  getSessionDuration(): number | null {
    if (!this.sessionStartTime) return null
    return Date.now() - this.sessionStartTime
  }

  async shutdown(): Promise<void> {
    if (this.posthog) {
      await this.posthog.shutdown()
      this.posthog = null
    }
    this.initialized = false
    this.userId = null
    this.config = null
    this.packageVersions = {}
    this.sessionId = null
    this.sessionStartTime = null
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    if (!this.posthog || !this.userId || !this.config?.isEnabled()) return

    try {
      this.posthog.capture({
        distinctId: this.userId,
        event,
        properties: {
          ...properties,
          client: this.config.clientInfo.client,
          platform: this.config.clientInfo.platform,
          arch: this.config.clientInfo.arch,
          extension_version: this.config.extensionVersion,
          ...this.packageVersions,
          $session_id: this.sessionId,
        },
      })
    } catch (error) {
      // TODO: Log to Logfire when available
      // Telemetry should never break the extension, so we silently catch errors
    }
  }
}

export const client = new TelemetryClient()
