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

  // Skip telemetry in browser environments (vscode.dev, github.dev)
  // PostHog Node.js client requires Node APIs that aren't available in browsers
  if (vscode.env.uiKind === vscode.UIKind.Web) {
    return
  }

  const userId = await getOrCreateUserId(context)
  const extensionVersion =
    vscode.extensions.getExtension("FastAPILabs.fastapi-vscode")?.packageJSON
      ?.version ?? "unknown"

  await client.init({
    userId,
    clientInfo: getClientInfo(),
    extensionVersion,
    isEnabled: isTelemetryEnabled,
  })
}

/**
 * Fetch package versions using the Python interpreter.
 * Runs all version checks in parallel for better performance.
 */
async function fetchPackageVersions(
  pythonPath: string,
  packages: readonly string[],
): Promise<{ [key: string]: string | undefined }> {
  const { promisify } = await import("util")
  const { execFile } = await import("child_process")
  const execFileAsync = promisify(execFile)

  // Fetch all package versions in parallel
  const results = await Promise.allSettled(
    packages.map(async (pkg) => {
      const importName = pkg.replace(/-/g, "_")
      const { stdout } = await execFileAsync(
        pythonPath,
        ["-c", `import ${importName}; print(${importName}.__version__)`],
        { timeout: 5000 },
      )
      return { key: `${importName}_version`, version: stdout.trim() }
    }),
  )

  // Collect results into a single object
  const versions: { [key: string]: string | undefined } = {}
  results.forEach((result, index) => {
    const importName = packages[index].replace(/-/g, "_")
    const key = `${importName}_version`
    versions[key] =
      result.status === "fulfilled" ? result.value.version : undefined
  })

  return versions
}

/**
 * Get actual Python and package versions installed in the current workspace.
 * This requires the Python extension to be installed and activated.
 * @returns An object with python_version and package versions (e.g., fastapi_version, pydantic_version).
 */
export async function getInstalledVersions(
  packages: readonly string[] = [],
): Promise<{ python_version?: string; [key: string]: string | undefined }> {
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
    const python_version = environment.version.micro
      ? `${environment.version.major}.${environment.version.minor}.${environment.version.micro}`
      : `${environment.version.major}.${environment.version.minor}`

    // Try to fetch package versions if we have an executable path
    if (!environment.executable?.uri) {
      return { python_version }
    }

    const pythonPath = environment.executable.uri.fsPath
    const packageVersions = await fetchPackageVersions(
      pythonPath,
      packages,
    ).catch(() => ({}))

    return { python_version, ...packageVersions }
  } catch {
    // If Python extension is not available or any error occurs, return empty
    return {}
  }
}
