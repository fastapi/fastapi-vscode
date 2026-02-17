import * as vscode from "vscode"
import { log } from "../../utils/logger"
import { trackCloudLogsOpened } from "../../utils/telemetry"
import { type ApiService, type AppLogEntry, StreamLogError } from "../api"
import type { ConfigService } from "../config"

const DEFAULT_TAIL = 100
export const LOGS_VIEW_ID = "fastapi-cloud-logs"

// --- Log formatting ---

const SINCE_OPTIONS = [
  { label: "5 minutes", value: "5m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
]

// Roughly matches fastapi-cloud-cli LOG_LEVEL_COLORS
const LEVEL_COLORS: Record<string, string> = {
  debug: "#4488ff",
  info: "#00cccc",
  warning: "#ccaa00",
  warn: "#ccaa00",
  error: "#f14c4c",
  critical: "#cc66cc",
  fatal: "#cc66cc",
  default: "#888",
}

const FILTER_CHIPS = [
  { level: "debug", label: "DEBUG" },
  { level: "info", label: "INFO" },
  { level: "warning", label: "WARN" },
  { level: "error", label: "ERROR" },
  { level: "critical", label: "CRITICAL" },
]

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => HTML_ESCAPE[ch])
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : `${d.toISOString().slice(0, 23)}Z`
}

const MESSAGE_LEVEL_RE = new RegExp(
  `^\\s*(${Object.keys(LEVEL_COLORS)
    .filter((k) => k !== "default")
    .join("|")})\\b`,
  "i",
)

function normalizeLevel(level: string, message?: string): string {
  // The streaming API returns "unknown" for new logs (Loki limitation) so try to infer from message prefix
  let resolved = level
  if (resolved === "unknown" && message) {
    const match = message.match(MESSAGE_LEVEL_RE)
    if (match) resolved = match[1].toLowerCase()
  }
  if (resolved === "warn") return "warning"
  if (resolved === "fatal") return "critical"
  return resolved
}

export function formatLogEntry(entry: AppLogEntry): string {
  const rawLevel = (entry.level ?? "info").toLowerCase()
  const level = normalizeLevel(rawLevel, entry.message)
  const pipeColor = LEVEL_COLORS[level] ?? LEVEL_COLORS.default
  const ts = escapeHtml(formatTimestamp(entry.timestamp))
  const msg = escapeHtml(entry.message)
  const escapedLevel = escapeHtml(level)
  return `<div class="log-line" data-level="${escapedLevel}"><span class="pipe" style="color:${pipeColor}">┃</span> <span class="ts">${ts}</span> ${msg}</div>`
}

// --- Webview HTML ---

function getLevelChipsHtml(): string {
  return FILTER_CHIPS.map(
    ({ level, label }) =>
      `<div class="level-item" data-level="${level}"><span>${label}</span><span class="check">✓</span></div>`,
  ).join("\n")
}

function getSinceOptionsHtml(): string {
  return SINCE_OPTIONS.map(
    (o, i) =>
      `<option value="${o.value}"${i === 0 ? " selected" : ""}>${o.label}</option>`,
  ).join("")
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const stylesUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "logs", "styles.css"),
  )
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "logs", "webview.js"),
  )

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src ${webview.cspSource};">
<link rel="stylesheet" href="${stylesUri}">
</head>
<body>
<div class="toolbar">
    <select id="since-filter">${getSinceOptionsHtml()}</select>
    <div class="filter-wrapper">
        <button class="secondary-btn" id="filter-btn" title="Filter displayed logs">Filter <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg></button>
        <div class="filter-popup" id="filter-popup">
            <div class="filter-row">
                <label for="level-list">Log Level</label>
                <div class="level-list" id="level-list">
                  ${getLevelChipsHtml()}
                </div>
            </div>
            <div class="filter-row">
                <label for="search-input">Search</label>
                <input id="search-input" type="text" placeholder="Filter text..." />
            </div>
            <div class="filter-hint">Filters apply to displayed logs</div>
        </div>
    </div>
    <button id="stream-btn" title="Start streaming"><span id="stream-label">Start</span></button>
    <span id="app-label"></span>
    <div class="spacer"></div>
    <button class="icon-btn" id="clear-btn" title="Clear logs"><svg width="12" height="12" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>Clear</button>
</div>
<div id="logs"><span class="status">Click "Start" to stream logs.</span></div>
<script src="${scriptUri}"></script>
</body>
</html>`
}

export class LogsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private activeAbortController: AbortController | undefined

  constructor(
    private extensionUri: vscode.Uri,
    private configService: ConfigService,
    private apiService: ApiService,
    private getActiveWorkspaceFolder: () => vscode.Uri | null,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    trackCloudLogsOpened()
    this.view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist", "webview"),
      ],
    }
    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.extensionUri,
    )

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

  private async resolveWorkspaceFolder(): Promise<vscode.Uri | null> {
    const activeFolder = this.getActiveWorkspaceFolder()

    // Single workspace or no workspace — use as-is
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length <= 1) {
      return activeFolder
    }

    // Multi-root: if active folder has a linked config, use it directly
    if (activeFolder) {
      const config = await this.configService.getConfig(activeFolder)
      if (config?.app_id) return activeFolder
    }

    // Active folder not linked — use the first configured folder
    for (const folder of workspaceFolders) {
      const config = await this.configService.getConfig(folder.uri)
      if (config?.app_id) return folder.uri
    }

    return activeFolder
  }

  async streamLogs(options?: { since?: string; tail?: number }): Promise<void> {
    const workspaceRoot = await this.resolveWorkspaceFolder()

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

    const appLabel =
      config.app_slug ?? workspaceRoot.path.split("/").pop() ?? ""

    if (this.view) {
      this.view.webview.postMessage({ type: "clear" })
      this.view.webview.postMessage({
        type: "status",
        text: "Connecting to log stream...",
      })
      this.view.webview.postMessage({
        type: "streamingState",
        streaming: true,
        appLabel,
      })
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

      // If no entries arrive quickly, update status so user knows we're connected
      const connectedTimer = setTimeout(() => {
        if (count === 0 && this.view && !signal.aborted) {
          this.view.webview.postMessage({
            type: "status",
            text: "Connected. Waiting for new logs...",
          })
        }
      }, 2000)

      for await (const entry of logStream) {
        if (count === 0) clearTimeout(connectedTimer)
        if (!this.view) return
        count++
        this.view.webview.postMessage({
          type: "log",
          html: formatLogEntry(entry),
        })
      }
      clearTimeout(connectedTimer)
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
