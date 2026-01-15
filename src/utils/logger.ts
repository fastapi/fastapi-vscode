/**
 * Output channel logger for the FastAPI extension.
 * Provides visibility into extension activity for troubleshooting.
 *
 * Uses LogOutputChannel for colored log levels and automatic timestamps.
 */

import * as vscode from "vscode"

let outputChannel: vscode.LogOutputChannel | null = null

function getOutputChannel(): vscode.LogOutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("FastAPI", { log: true })
  }
  return outputChannel
}

export function log(message: string): void {
  getOutputChannel().info(message)
}

export function logError(message: string, error?: unknown): void {
  if (error instanceof Error) {
    getOutputChannel().error(`${message}: ${error.message}`)
  } else if (error !== undefined) {
    getOutputChannel().error(`${message}: ${String(error)}`)
  } else {
    getOutputChannel().error(message)
  }
}

export function disposeLogger(): void {
  outputChannel?.dispose()
  outputChannel = null
}
