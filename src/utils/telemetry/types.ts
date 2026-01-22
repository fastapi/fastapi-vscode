export interface TelemetryConfig {
  userId: string
  clientInfo: ClientInfo
  extensionVersion: string
  isEnabled: () => boolean
}

export interface ClientInfo {
  client: string // 'vscode-desktop' | 'cursor' | 'vscodium' | etc.
  app_name: string
  app_host: string
  is_remote: boolean
  remote_name: string | undefined
}

// Event property types
export interface ActivationEventProps {
  duration_ms: number
  success: boolean
  routes_count: number
  routers_count: number
  apps_count: number
  workspace_folder_count: number
}

export interface EntrypointDetectedEventProps {
  duration_ms: number
  method: "config" | "pyproject" | "heuristic"
  success: boolean
  routes_count: number
  routers_count: number
}
