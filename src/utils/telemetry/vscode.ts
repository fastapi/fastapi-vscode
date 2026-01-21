/**
 * VS Code-specific telemetry helpers.
 * This file contains all vscode imports to keep the rest of telemetry editor-agnostic.
 */

import * as vscode from "vscode"
import { client } from "./client"
import type { ClientInfo, TelemetryConfig } from "./types"

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
  }
}

export function isTelemetryEnabled(): boolean {
  const vscodeTelemetryEnabled = vscode.env.isTelemetryEnabled
  const config = vscode.workspace.getConfiguration("fastapi")
  const extensionTelemetryEnabled = config.get<boolean>(
    "telemetry.enabled",
    true,
  )
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
