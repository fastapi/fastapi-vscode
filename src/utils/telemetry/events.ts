import type { AppDefinition, RouterDefinition } from "../../core/types"
import { client } from "./client"
import type {
  ActivationEventProps,
  EntrypointDetectedEventProps,
} from "./types"

/** Creates a timer that returns elapsed milliseconds when called. */
export function createTimer(): () => number {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}

// Event name constants
export const Events = {
  ACTIVATED: "extension_activated",
  ACTIVATION_FAILED: "extension_activation_failed",
  ENTRYPOINT_DETECTED: "extension_entrypoint_detected",
  CODELENS_PROVIDED: "extension_codelens_provided",
  CODELENS_CLICKED: "extension_codelens_clicked",
  TREE_VIEW_VISIBLE: "extension_tree_view_visible",
  SEARCH_EXECUTED: "extension_search_executed",
  ROUTE_NAVIGATED: "extension_route_navigated",
  ROUTE_COPIED: "extension_route_copied",
} as const

// Session counters for aggregated tracking
const sessionCounters = {
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
  // Cumulative counts - don't reset, so each flush shows running total
  // In PostHog, take max(count) per session to get final total
  if (sessionCounters.routes_navigated > 0) {
    client.capture(Events.ROUTE_NAVIGATED, {
      count: sessionCounters.routes_navigated,
    })
  }
  if (sessionCounters.routes_copied > 0) {
    client.capture(Events.ROUTE_COPIED, {
      count: sessionCounters.routes_copied,
    })
  }
  if (sessionCounters.codelens_clicks > 0) {
    client.capture(Events.CODELENS_CLICKED, {
      count: sessionCounters.codelens_clicks,
    })
  }
}

export function countRoutes(apps: AppDefinition[]): number {
  const countInRouter = (router: RouterDefinition): number =>
    router.routes.length +
    router.children.reduce((sum, child) => sum + countInRouter(child), 0)

  return apps.reduce(
    (sum, app) =>
      sum +
      app.routes.length +
      app.routers.reduce((sum, router) => sum + countInRouter(router), 0),
    0,
  )
}

export function countRouters(apps: AppDefinition[]): number {
  const countInRouter = (router: RouterDefinition): number =>
    1 + router.children.reduce((sum, child) => sum + countInRouter(child), 0)

  return apps.reduce(
    (sum, app) =>
      sum + app.routers.reduce((s, router) => s + countInRouter(router), 0),
    0,
  )
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("enoent")) return "file_not_found"
    if (msg.includes("wasm")) return "wasm_load_error"
    if (msg.includes("parse")) return "parse_error"
    if (msg.includes("timeout")) return "timeout_error"
    if (msg.includes("permission")) return "permission_error"
    return "unknown_error"
  }
  return "unknown_error"
}

// Typed event tracking functions

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
