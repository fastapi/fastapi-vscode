// Re-export everything for clean imports
export { client, TRACKED_PACKAGES } from "./client"
export {
  countRouters,
  countRoutes,
  createTimer,
  Events,
  flushSessionSummary,
  incrementCodeLensClicked,
  incrementRouteCopied,
  incrementRouteNavigated,
  sanitizeError,
  trackActivation,
  trackActivationFailed,
  trackCodeLensProvided,
  trackDeactivation,
  trackEntrypointDetected,
  trackSearchExecuted,
  trackTreeViewVisible,
} from "./events"
export type {
  ActivationEventProps,
  ClientInfo,
  EntrypointDetectedEventProps,
  TelemetryConfig,
} from "./types"
export {
  getClientInfo,
  getInstalledVersions,
  getOrCreateUserId,
  initVSCodeTelemetry,
  isTelemetryEnabled,
} from "./vscode"
