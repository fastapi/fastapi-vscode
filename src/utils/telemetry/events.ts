import { client } from "./client"
import type {
  ActivationEventProps,
  EntrypointDetectedEventProps,
} from "./types"

export function createTimer(): () => number {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}

export const Events = {
  ACTIVATED: "extension_activated",
  ACTIVATION_FAILED: "extension_activation_failed",
  DEACTIVATED: "extension_deactivated",
  ENTRYPOINT_DETECTED: "extension_entrypoint_detected",
  CODELENS_PROVIDED: "extension_codelens_provided",
  CODELENS_CLICKED: "extension_codelens_clicked",
  TREE_VIEW_VISIBLE: "extension_tree_view_visible",
  SEARCH_EXECUTED: "extension_search_executed",
  ROUTE_NAVIGATED: "extension_route_navigated",
  ROUTE_COPIED: "extension_route_copied",
  // Cloud events (deployment events are tracked server-side)
  CLOUD_SIGN_IN: "extension_cloud_sign_in",
  CLOUD_SIGN_OUT: "extension_cloud_sign_out",
  CLOUD_PROJECT_LINKED: "extension_cloud_project_linked",
  CLOUD_PROJECT_UNLINKED: "extension_cloud_project_unlinked",
  CLOUD_DASHBOARD_OPENED: "extension_cloud_dashboard_opened",
  CLOUD_APP_OPENED: "extension_cloud_app_opened",
} as const

// Session counters for aggregated tracking
// Track both session total and last flushed count to send deltas
const sessionCounters = {
  routes_navigated: 0,
  routes_copied: 0,
  codelens_clicks: 0,
}

const lastFlushedCounters = {
  routes_navigated: 0,
  routes_copied: 0,
  codelens_clicks: 0,
}

export function incrementRouteNavigated(): void {
  sessionCounters.routes_navigated++
}

export function incrementRouteCopied(): void {
  sessionCounters.routes_copied++
}

export function incrementCodeLensClicked(): void {
  sessionCounters.codelens_clicks++
}

export function flushSessionSummary(): void {
  // Send incremental changes since last flush.
  // Events are batched with a count property - sum counts in PostHog to get totals.
  const routesNavigatedDelta =
    sessionCounters.routes_navigated - lastFlushedCounters.routes_navigated
  const routesCopiedDelta =
    sessionCounters.routes_copied - lastFlushedCounters.routes_copied
  const codelensClicksDelta =
    sessionCounters.codelens_clicks - lastFlushedCounters.codelens_clicks

  if (routesNavigatedDelta > 0) {
    client.capture(Events.ROUTE_NAVIGATED, {
      count: routesNavigatedDelta,
    })
    lastFlushedCounters.routes_navigated = sessionCounters.routes_navigated
  }
  if (routesCopiedDelta > 0) {
    client.capture(Events.ROUTE_COPIED, {
      count: routesCopiedDelta,
    })
    lastFlushedCounters.routes_copied = sessionCounters.routes_copied
  }
  if (codelensClicksDelta > 0) {
    client.capture(Events.CODELENS_CLICKED, {
      count: codelensClicksDelta,
    })
    lastFlushedCounters.codelens_clicks = sessionCounters.codelens_clicks
  }
}

export function sanitizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown_error"
  }

  // Check Node.js error code if available (e.g., ENOENT, EACCES)
  const code = (error as NodeJS.ErrnoException).code
  if (code) {
    return code.toLowerCase()
  }

  // Check error constructor name for built-in error types
  const errorType = error.constructor.name
  if (errorType !== "Error") {
    return errorType
      .replace(/Error$/, "")
      .replace(/([A-Z])/g, "_$1")
      .toLowerCase()
      .slice(1)
  }

  return "unknown_error"
}

/* c8 ignore start -- thin telemetry wrappers, no branching logic worth testing */
export function trackActivation(props: ActivationEventProps): void {
  client.capture(Events.ACTIVATED, { ...props })
}

export function trackActivationFailed(
  error: unknown,
  stage: "parser_init" | "discovery",
): void {
  client.capture(Events.ACTIVATION_FAILED, {
    error_message: sanitizeError(error),
    stage,
  })
}

export function trackEntrypointDetected(
  props: EntrypointDetectedEventProps,
): void {
  client.capture(Events.ENTRYPOINT_DETECTED, { ...props })
}

export function trackTreeViewVisible(): void {
  client.capture(Events.TREE_VIEW_VISIBLE)
}

export function trackSearchExecuted(
  resultsCount: number,
  selected: boolean,
): void {
  client.capture(Events.SEARCH_EXECUTED, {
    results_count: resultsCount,
    selected,
  })
}

export function trackCodeLensProvided(
  testCallsCount: number,
  matchedCount: number,
): void {
  client.capture(Events.CODELENS_PROVIDED, {
    test_calls_count: testCallsCount,
    matched_count: matchedCount,
    match_rate: testCallsCount > 0 ? matchedCount / testCallsCount : 0,
  })
}

export function trackDeactivation(): void {
  const duration = client.getSessionDuration()
  if (duration !== null) {
    client.capture(Events.DEACTIVATED, {
      session_duration_ms: duration,
    })
  }
}

// Cloud telemetry functions

export function trackCloudSignIn(): void {
  client.capture(Events.CLOUD_SIGN_IN)
}

export function trackCloudSignOut(): void {
  client.capture(Events.CLOUD_SIGN_OUT)
}

export function trackCloudProjectLinked(appName: string): void {
  client.capture(Events.CLOUD_PROJECT_LINKED, { app_name: appName })
}

export function trackCloudProjectUnlinked(appName: string): void {
  client.capture(Events.CLOUD_PROJECT_UNLINKED, { app_name: appName })
}

export function trackCloudDashboardOpened(appName: string): void {
  client.capture(Events.CLOUD_DASHBOARD_OPENED, { app_name: appName })
}

export function trackCloudAppOpened(appName: string): void {
  client.capture(Events.CLOUD_APP_OPENED, { app_name: appName })
}
/* c8 ignore stop */
