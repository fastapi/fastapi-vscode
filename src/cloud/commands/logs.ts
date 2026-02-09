import * as vscode from "vscode"
import { log } from "../../utils/logger"
import { type ApiService, StreamLogError } from "../api"
import type { ConfigService } from "../config"
import { formatLogEntry, getWebviewHtml } from "./logsHtml"

const DEFAULT_TAIL = 100
export const LOGS_VIEW_ID = "fastapi-cloud-logs"

export class LogsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private activeAbortController: AbortController | undefined

  constructor(
    private configService: ConfigService,
    private apiService: ApiService,
    private getActiveWorkspaceFolder: () => vscode.Uri | null,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = getWebviewHtml()

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "startStream") {
        const since = typeof msg.since === "string" ? msg.since : "5m"
        await this.streamLogs({ since, tail: DEFAULT_TAIL })
      } else if (msg.type === "stopStream") {
        this.stopStreaming()
      }
    })

    webviewView.onDidDispose(() => {
      this.view = undefined
      this.activeAbortController?.abort()
    })
  }

  stopStreaming(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = undefined
    }
    this.view?.webview.postMessage({ type: "streamingState", streaming: false })
  }

  async streamLogs(options?: { since?: string; tail?: number }): Promise<void> {
    const workspaceRoot = this.getActiveWorkspaceFolder()

    if (!workspaceRoot) {
      vscode.window.showErrorMessage("No workspace folder open.")
      return
    }

    const config = await this.configService.getConfig(workspaceRoot)
    const appId = config?.app_id
    if (!appId) {
      vscode.window.showErrorMessage(
        "No app linked to this workspace. Please deploy or link an app first.",
      )
      return
    }

    const since = options?.since ?? "5m"
    const tail = options?.tail ?? 100

    // Cancel any active log stream
    if (this.activeAbortController) {
      this.activeAbortController.abort()
    }
    const controller = new AbortController()
    this.activeAbortController = controller
    const { signal } = controller

    // Reveal the panel view
    await vscode.commands.executeCommand(`${LOGS_VIEW_ID}.focus`)

    if (this.view) {
      this.view.webview.postMessage({ type: "clear" })
      this.view.webview.postMessage({
        type: "status",
        text: "Connecting to log stream...",
      })
      this.view.webview.postMessage({ type: "streamingState", streaming: true })
    }

    try {
      let count = 0
      const logStream = this.apiService.streamAppLogs({
        appId,
        tail,
        since,
        follow: true,
        signal,
      })
      for await (const entry of logStream) {
        if (!this.view) return
        count++
        this.view.webview.postMessage({
          type: "log",
          html: formatLogEntry(entry),
        })
      }
      if (count === 0) {
        this.view?.webview.postMessage({
          type: "status",
          text: `No logs found (since ${since}).`,
        })
      } else {
        this.view?.webview.postMessage({
          type: "status",
          text: "Stream ended.",
        })
      }
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof StreamLogError) {
        this.view?.webview.postMessage({
          type: "status",
          text: `Error: ${error.message}`,
        })
      } else {
        const message = error instanceof Error ? error.message : String(error)
        log(`Log streaming failed: ${message}`)
        vscode.window.showErrorMessage(`Failed to fetch logs: ${message}`)
      }
    } finally {
      // Only update UI if this is still the active stream (not replaced by a new one)
      if (this.activeAbortController === controller) {
        this.view?.webview.postMessage({
          type: "streamingState",
          streaming: false,
        })
      }
    }
  }

  dispose(): void {
    this.activeAbortController?.abort()
  }
}
