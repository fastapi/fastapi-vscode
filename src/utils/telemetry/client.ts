import { PostHog } from "posthog-node"
import { log } from "../logger"
import type { TelemetryConfig } from "./types"

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || ""
const POSTHOG_HOST = "https://eu.i.posthog.com"

/** Flush after this many events are queued */
const FLUSH_AT = 10
/** Flush after this many milliseconds (30 seconds) */
const FLUSH_INTERVAL_MS = 30000

export class TelemetryClient {
  private posthog: PostHog | null = null
  private userId: string | null = null
  private config: TelemetryConfig | null = null
  private initialized = false

  init(config: TelemetryConfig): void {
    if (this.initialized || !config.isEnabled() || !POSTHOG_API_KEY) return

    this.config = config
    this.userId = config.userId

    this.posthog = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      disableGeoip: true,
      flushAt: FLUSH_AT,
      flushInterval: FLUSH_INTERVAL_MS,
    })

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

  async shutdown(): Promise<void> {
    if (this.posthog) {
      await this.posthog.shutdown()
      this.posthog = null
    }
    this.initialized = false
    this.userId = null
    this.config = null
  }

  capture(event: string, properties?: Record<string, unknown>): void {
    log(`Telemetry: ${event} ${JSON.stringify(properties ?? {})}`)

    if (!this.posthog || !this.userId || !this.config?.isEnabled()) return

    this.posthog.capture({
      distinctId: this.userId,
      event,
      properties: {
        ...properties,
        client: this.config.clientInfo.client,
        extension_version: this.config.extensionVersion,
      },
    })
  }
}

export const client = new TelemetryClient()
