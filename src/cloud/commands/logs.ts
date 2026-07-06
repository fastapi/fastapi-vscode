import * as vscode from "vscode"
import { log } from "../../utils/logger"
import { trackCloudLogsOpened } from "../../utils/telemetry"
import { type ApiService, type AppLogEntry, StreamLogError } from "../api"
import type { ConfigService } from "../config"
import type { Config } from "../types"

const DEFAULT_TAIL = 100
const HISTORY_PAGE_SIZE = 500
export const LOGS_VIEW_ID = "fastapi-cloud-logs"

// --- Log formatting ---

export interface SinceOption {
  label: string
  value: string
}

const BASE_SINCE_OPTIONS: SinceOption[] = [
  { label: "5 minutes", value: "5m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
]

function dayOption(days: number): SinceOption {
  return { label: `${days} days`, value: `${days}d` }
}

export function getSinceOptions(logRetentionDays = 1): SinceOption[] {
  const options = [...BASE_SINCE_OPTIONS]
  const retentionDays = Math.floor(logRetentionDays)
  const extraDays = [7, 14].filter((days) => days <= retentionDays)
  if (retentionDays > 1 && !extraDays.includes(retentionDays)) {
    extraDays.push(retentionDays)
  }

  for (const days of extraDays.sort((a, b) => a - b)) {
    options.push(dayOption(days))
  }
  return options
}

function parseSinceMs(since: string): number {
  const match = since.match(/^(\d+)([smhd])$/)
  if (!match) return 5 * 60 * 1000

  const value = Number(match[1])
  const unit = match[2]
  if (unit === "s") return value * 1000
  if (unit === "m") return value * 60 * 1000
  if (unit === "h") return value * 60 * 60 * 1000
  return value * 24 * 60 * 60 * 1000
}

// Levels recognized when inferring a log's level from its message prefix.
// Pipe colors for these live in the webview stylesheet, keyed on [data-level].
const KNOWN_LEVELS = [
  "debug",
  "info",
  "warning",
  "warn",
  "error",
  "critical",
  "fatal",
]

const FILTER_CHIPS = [
  { level: "debug", label: "DEBUG" },
  { level: "info", label: "INFO" },
  { level: "warning", label: "WARN" },
  { level: "error", label: "ERROR" },
  { level: "critical", label: "CRITICAL" },
]

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : `${d.toISOString().slice(0, 23)}Z`
}

const MESSAGE_LEVEL_RE = new RegExp(`^\\s*(${KNOWN_LEVELS.join("|")})\\b`, "i")

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

// Returns the entry with its level normalized and timestamp formatted. Same
// shape as the raw entry, but the webview builds the DOM node itself
// (className/dataset/textContent), so no HTML escaping is required here.
export function formatLogEntry(entry: AppLogEntry): AppLogEntry {
  const rawLevel = (entry.level ?? "info").toLowerCase()
  const level = normalizeLevel(rawLevel, entry.message)
  return {
    level,
    timestamp: formatTimestamp(entry.timestamp),
    timestamp_ns: entry.timestamp_ns,
    message: entry.message,
  }
}

function getTimestampMs(entry: AppLogEntry): number {
  const timestampMs = new Date(entry.timestamp).getTime()
  return Number.isNaN(timestampMs) ? 0 : timestampMs
}

function getCursorNs(entry: AppLogEntry): string | undefined {
  if (entry.timestamp_ns) return entry.timestamp_ns
  const timestampMs = getTimestampMs(entry)
  return timestampMs > 0 ? `${timestampMs}000000` : undefined
}

function currentTimeNs(): string {
  return `${Date.now()}000000`
}

interface HistoryState {
  appId: string
  beforeNs: string
  windowStartMs: number
  hasOlder: boolean
  checked: boolean
}

// --- Webview HTML ---

function getLevelChipsHtml(): string {
  return FILTER_CHIPS.map(
    ({ level, label }) =>
      `<div class="level-item" data-level="${level}"><span>${label}</span><span class="check">✓</span></div>`,
  ).join("\n")
}

function getSinceOptionsHtml(): string {
  return getSinceOptions()
    .map(
      (o, i) =>
        `<option value="${o.value}"${i === 0 ? " selected" : ""}>${o.label}</option>`,
    )
    .join("")
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
	<div class="history-bar hidden" id="history-bar">
	    <button class="link-btn" id="load-older-btn" title="Check whether earlier logs exist in the selected range" disabled>Check earlier logs</button>
	    <span class="history-note hidden" id="history-note"></span>
	</div>
	<div id="logs"><span class="status">Click "Start" to stream logs.</span></div>
<script src="${scriptUri}"></script>
</body>
</html>`
}

export class LogsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined
  private activeAbortController: AbortController | undefined
  private historyState: HistoryState | undefined

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
    void this.updateSinceOptions()

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "startStream") {
        const since = typeof msg.since === "string" ? msg.since : "5m"
        await this.streamLogs({ since, tail: DEFAULT_TAIL })
      } else if (msg.type === "stopStream") {
        this.stopStreaming()
      } else if (msg.type === "loadOlder") {
        await this.loadOlderLogs()
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

  private async updateSinceOptionsForConfig(config: Config): Promise<void> {
    try {
      const access = await this.apiService.getTeamAccess(config.team_id)
      this.view?.webview.postMessage({
        type: "sinceOptions",
        options: getSinceOptions(access.entitlements.log_retention_days),
      })
    } catch (err) {
      log(`Failed to fetch team entitlements: ${err}`)
    }
  }

  private async updateSinceOptions(): Promise<void> {
    const workspaceRoot = await this.resolveWorkspaceFolder()
    if (!workspaceRoot) return

    const config = await this.configService.getConfig(workspaceRoot)
    if (!config?.app_id) return

    await this.updateSinceOptionsForConfig(config)
  }

  private postHistoryState(
    hasOlder: boolean,
    loading: boolean,
    checked = this.historyState?.checked ?? false,
  ): void {
    this.view?.webview.postMessage({
      type: "historyState",
      hasOlder,
      loading,
      checked,
    })
  }

  private updateHistoryCursor(entry: AppLogEntry): void {
    const cursor = getCursorNs(entry)
    if (!cursor || !this.historyState) return
    if (BigInt(cursor) < BigInt(this.historyState.beforeNs)) {
      this.historyState.beforeNs = cursor
    }
  }

  private filterLogsWithinWindow(logs: AppLogEntry[]): {
    logs: AppLogEntry[]
    reachedWindowStart: boolean
  } {
    const windowStartMs = this.historyState?.windowStartMs ?? 0
    let reachedWindowStart = false
    const filteredLogs = logs.filter((entry) => {
      const timestampMs = getTimestampMs(entry)
      const inWindow = timestampMs >= windowStartMs
      if (!inWindow) reachedWindowStart = true
      return inWindow
    })
    return { logs: filteredLogs, reachedWindowStart }
  }

  async loadOlderLogs(): Promise<void> {
    if (!this.historyState?.hasOlder) return
    const state = this.historyState

    this.postHistoryState(true, true)
    try {
      const response = await this.apiService.getAppLogs({
        appId: state.appId,
        beforeNs: state.beforeNs,
        limit: HISTORY_PAGE_SIZE,
      })
      if (this.historyState !== state) return

      const { logs, reachedWindowStart } = this.filterLogsWithinWindow(
        response.logs,
      )
      if (logs.length > 0) {
        state.beforeNs = getCursorNs(logs[0]) ?? state.beforeNs
        this.view?.webview.postMessage({
          type: "olderLogs",
          entries: logs.map(formatLogEntry),
        })
      }

      state.checked = true
      state.hasOlder = response.has_more && !reachedWindowStart
      this.postHistoryState(state.hasOlder, false, state.checked)
      if (logs.length === 0 && !state.hasOlder) {
        this.view?.webview.postMessage({
          type: "historyNotice",
          text: "No earlier logs in this range.",
        })
      }
    } catch (error) {
      if (this.historyState !== state) return

      const message = error instanceof Error ? error.message : String(error)
      log(`Failed to load older logs: ${message}`)
      this.postHistoryState(state.hasOlder, false, state.checked)
      this.view?.webview.postMessage({
        type: "historyNotice",
        text: `Failed to load earlier logs: ${message}`,
      })
    }
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

    await this.updateSinceOptionsForConfig(config)

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
    this.historyState = {
      appId,
      beforeNs: currentTimeNs(),
      windowStartMs: Date.now() - parseSinceMs(since),
      hasOlder: true,
      checked: false,
    }

    if (this.view) {
      this.view.webview.postMessage({ type: "clear" })
      this.postHistoryState(false, false)
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
          this.postHistoryState(this.historyState?.hasOlder ?? false, false)
        }
      }, 2000)

      for await (const entry of logStream) {
        if (count === 0) clearTimeout(connectedTimer)
        if (!this.view) return
        count++
        this.updateHistoryCursor(entry)
        if (count === 1) {
          this.postHistoryState(this.historyState?.hasOlder ?? false, false)
        }
        this.view.webview.postMessage({
          type: "log",
          entry: formatLogEntry(entry),
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
      this.postHistoryState(this.historyState?.hasOlder ?? false, false)
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
