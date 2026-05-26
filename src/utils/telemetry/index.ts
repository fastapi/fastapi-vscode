// Re-export everything for clean imports
export { client, TRACKED_PACKAGES } from "./client"
export {
  createTimer,
  Events,
  flushSessionSummary,
  incrementCodeLensClicked,
  incrementRouteCopied,
  incrementRouteNavigated,
  sanitizeError,
  trackActivation,
  trackActivationFailed,
  trackCloudAppOpened,
  trackCloudDashboardOpened,
  trackCloudLogsOpened,
  trackCloudProjectLinked,
  trackCloudProjectUnlinked,
  trackCloudSignIn,
  trackCloudSignOut,
  trackDeactivation,
  trackSearchExecuted,
  trackTreeViewVisible,
} from "./events"
export type {
  ActivationEventProps,
  ClientInfo,
  TelemetryConfig,
} from "./types"
export {
  getClientInfo,
  getInstalledVersions,
  getOrCreateUserId,
  initVSCodeTelemetry,
  isTelemetryEnabled,
} from "./vscode"
