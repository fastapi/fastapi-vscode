/**
 * VS Code-specific telemetry helpers.
 * This file contains all vscode imports to keep the rest of telemetry editor-agnostic.
 */

import * as vscode from "vscode"
import { client } from "./client"
import type { ClientInfo } from "./types"

const USER_ID_KEY = "fastapi.telemetry.userId"

export function getClientInfo(): ClientInfo {
  const appName = vscode.env.appName
  const appHost = vscode.env.appHost
  const uiKind = vscode.env.uiKind
  const remoteName = vscode.env.remoteName

  let clientType = "unknown"
  const appNameLower = appName.toLowerCase()

  if (appNameLower.includes("cursor")) {
    clientType = "cursor"
  } else if (appNameLower.includes("windsurf")) {
    clientType = "windsurf"
  } else if (appNameLower.includes("vscodium")) {
    clientType = "vscodium"
  } else if (appNameLower.includes("gitpod")) {
    clientType = "gitpod"
  } else if (appHost === "codespaces" || remoteName === "codespaces") {
    clientType = "codespaces"
  } else if (uiKind === vscode.UIKind.Web) {
    clientType = "vscode-web"
  } else if (appNameLower.includes("visual studio code")) {
    clientType = "vscode-desktop"
  }

  return {
    client: clientType,
    app_name: appName,
    app_host: appHost,
    is_remote: remoteName !== undefined,
    remote_name: remoteName,
    platform: process.platform,
    arch: process.arch,
  }
}

/** Check if telemetry is enabled based on both VS Code and extension settings. */
export function isTelemetryEnabled(): boolean {
  const vscodeTelemetryEnabled = vscode.env.isTelemetryEnabled
  const config = vscode.workspace.getConfiguration("fastapi")
  const extensionTelemetryEnabled = config.get<boolean>(
    "telemetry.enabled",
    true,
  )
  // Telemetry is enabled only if both VS Code and extension settings allow it
  return vscodeTelemetryEnabled && extensionTelemetryEnabled
}

export async function getOrCreateUserId(
  context: vscode.ExtensionContext,
): Promise<string> {
  let userId = context.globalState.get<string>(USER_ID_KEY)
  if (!userId) {
    userId = crypto.randomUUID()
    await context.globalState.update(USER_ID_KEY, userId)
  }
  return userId
}

/**
 * Initialize telemetry for VS Code environment.
 * Call this once during extension activation.
 */
export async function initVSCodeTelemetry(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Skip telemetry entirely in development mode
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    return
  }

  const userId = await getOrCreateUserId(context)
  const extensionVersion =
    vscode.extensions.getExtension("FastAPILabs.fastapi-vscode")?.packageJSON
      ?.version ?? "unknown"

  client.init({
    userId,
    clientInfo: getClientInfo(),
    extensionVersion,
    isEnabled: isTelemetryEnabled,
  })
}

/**
 * Get actual Python and FastAPI versions from the active interpreter.
 * Uses the Python extension API if available and already active.
 * If not active, events will not have version info.
 */
export async function getInstalledVersions(): Promise<{
  pythonVersion?: string
  fastapiVersion?: string
}> {
  try {
    // Get Python extension API
    const pythonExtension = vscode.extensions.getExtension("ms-python.python")

    // Don't activate the extension just for telemetry - only use it if already active
    if (!pythonExtension || !pythonExtension.isActive) {
      return {}
    }

    const pythonApi = pythonExtension.exports

    // Get active interpreter details
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      return {}
    }

    const environment = await pythonApi.environments.resolveEnvironment(
      await pythonApi.environments.getActiveEnvironmentPath(
        workspaceFolder.uri,
      ),
    )

    if (!environment?.version?.major) {
      return {}
    }

    // Extract Python version including patch version (e.g., "3.11.5")
    const pythonVersion = environment.version.micro
      ? `${environment.version.major}.${environment.version.minor}.${environment.version.micro}`
      : `${environment.version.major}.${environment.version.minor}`

    // Get FastAPI version
    let fastapiVersion: string | undefined
    if (environment.executable?.uri) {
      try {
        const pythonPath = environment.executable.uri.fsPath
        const { promisify } = await import("util")
        const { execFile } = await import("child_process")
        const execFileAsync = promisify(execFile)

        const { stdout } = await execFileAsync(
          pythonPath,
          ["-c", "import fastapi; print(fastapi.__version__)"],
          { timeout: 5000 },
        )

        fastapiVersion = stdout.trim() || undefined
      } catch {
        // FastAPI not installed or execution failed
      }
    }

    return { pythonVersion, fastapiVersion }
  } catch {
    // Python extension not available or error
    return {}
  }
}
