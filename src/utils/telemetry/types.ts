export interface TelemetryConfig {
  userId: string
  clientInfo: ClientInfo
  extensionVersion: string
  isEnabled: () => boolean
}

export interface ClientInfo {
  client: string // 'vscode-desktop' | 'cursor' | 'vscodium' | etc.
  app_name: string // Human-readable editor name (e.g., "Visual Studio Code", "Cursor")
  app_host: string // Host environment (e.g., "desktop", "codespaces", "web")
  is_remote: boolean // Whether workspace is opened via remote connection
  remote_name: string | undefined // Remote type if applicable (e.g., "ssh-remote", "dev-container", "wsl")
  platform: string // OS platform: 'win32' | 'darwin' | 'linux'
  arch: string // CPU architecture: 'x64' | 'arm64'
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
