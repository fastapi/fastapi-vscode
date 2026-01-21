// Re-export everything for clean imports
export { client } from "./client"
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
  getOrCreateUserId,
  initVSCodeTelemetry,
  isTelemetryEnabled,
} from "./vscode"
