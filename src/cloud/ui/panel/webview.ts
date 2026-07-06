/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { AppLogEntry } from "../../api"

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }

interface SinceOption {
  label: string
  value: string
}

type HistoryRowState =
  | { kind: "hidden" }
  | { kind: "button"; loading: boolean }
  | { kind: "notice"; text: string }

const vscode = acquireVsCodeApi()
const logs = document.getElementById("logs")!
const sinceFilter = document.getElementById("since-filter") as HTMLSelectElement
const searchInput = document.getElementById("search-input") as HTMLInputElement
const streamBtn = document.getElementById("stream-btn")!
const historyBar = document.getElementById("history-bar")!
const loadOlderBtn = document.getElementById(
  "load-older-btn",
) as HTMLButtonElement
const historyNote = document.getElementById("history-note")!
const clearBtn = document.getElementById("clear-btn")!
const filterBtn = document.getElementById("filter-btn")!
const filterPopup = document.getElementById("filter-popup")!
const levelList = document.getElementById("level-list")!
const appLabelEl = document.getElementById("app-label")!
let firstEntry = true
let isStreaming = false

function getSelectedLevels(): string[] {
  return Array.from(
    levelList.querySelectorAll<HTMLElement>(".level-item.selected"),
  ).map((el) => el.dataset.level!)
}

streamBtn.addEventListener("click", () => {
  if (isStreaming) {
    vscode.postMessage({ type: "stopStream" })
  } else {
    vscode.postMessage({
      type: "startStream",
      since: sinceFilter.value,
    })
  }
})

sinceFilter.addEventListener("change", () => {
  if (isStreaming) {
    vscode.postMessage({
      type: "startStream",
      since: sinceFilter.value,
    })
  }
})

filterBtn.addEventListener("click", (e) => {
  e.stopPropagation()
  filterPopup.classList.toggle("open")
})

clearBtn.addEventListener("click", () => {
  logs.replaceChildren()
  firstEntry = true
})

loadOlderBtn.addEventListener("click", () => {
  loadOlderBtn.disabled = true
  loadOlderBtn.textContent = "Loading logs..."
  vscode.postMessage({ type: "loadOlder" })
})

function isNearBottom(): boolean {
  return document.body.scrollHeight - window.innerHeight - window.scrollY < 8
}

document.addEventListener("click", (e) => {
  if (
    !filterPopup.contains(e.target as Node) &&
    !filterBtn.contains(e.target as Node)
  ) {
    filterPopup.classList.remove("open")
  }
})

function updateFilterBtnState(): void {
  const selectedLevels = getSelectedLevels()
  const hasLevelFilter = selectedLevels.length > 0
  const hasFilter = hasLevelFilter || searchInput.value.trim() !== ""
  filterBtn.classList.toggle("active", hasFilter)
}

levelList.addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>(".level-item")
  if (item) {
    item.classList.toggle("selected")
    applyFilters()
    updateFilterBtnState()
  }
})

let searchTimeout: ReturnType<typeof setTimeout>
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    applyFilters()
    updateFilterBtnState()
  }, 150)
})

function shouldShow(
  line: HTMLElement,
  selectedLevels: string[],
  query: string,
): boolean {
  const level = line.dataset.level
  if (selectedLevels.length > 0 && !selectedLevels.includes(level!))
    return false
  if (query && !line.textContent?.toLowerCase().includes(query)) return false
  return true
}

function applyFilters(): void {
  const selectedLevels = getSelectedLevels()
  const query = searchInput.value.toLowerCase()
  const lines = logs.querySelectorAll<HTMLElement>(".log-line")
  for (const line of lines) {
    line.classList.toggle("filtered", !shouldShow(line, selectedLevels, query))
  }
}

function setStreamingState(streaming: boolean, appLabel?: string): void {
  isStreaming = streaming
  const label = document.getElementById("stream-label")!
  if (streaming) {
    label.textContent = "Stop"
    streamBtn.title = "Stop streaming"
  } else {
    label.textContent = "Stream"
    streamBtn.title = "Start streaming"
  }
  appLabelEl.textContent =
    streaming && appLabel ? `Streaming logs for ${appLabel}...` : ""
}

function renderHistoryRow(state: HistoryRowState): void {
  historyBar.classList.toggle("hidden", state.kind === "hidden")
  loadOlderBtn.classList.toggle("hidden", state.kind !== "button")
  historyNote.classList.toggle("hidden", state.kind !== "notice")

  if (state.kind === "hidden") {
    historyNote.textContent = ""
    return
  }

  if (state.kind === "notice") {
    historyNote.textContent = state.text
    return
  }

  historyNote.textContent = ""
  loadOlderBtn.disabled = state.loading
  loadOlderBtn.textContent = state.loading
    ? "Loading logs..."
    : "Load earlier logs"
  loadOlderBtn.title = "Load earlier logs in the selected range"
}

function setHistoryState(hasOlder: boolean, loading: boolean): void {
  renderHistoryRow(
    hasOlder || loading ? { kind: "button", loading } : { kind: "hidden" },
  )
}

function showHistoryNotice(text: string): void {
  renderHistoryRow({ kind: "notice", text })
}

function updateSinceOptions(options: SinceOption[]): void {
  const previousValue = sinceFilter.value
  sinceFilter.replaceChildren()
  for (const option of options) {
    const optionEl = document.createElement("option")
    optionEl.value = option.value
    optionEl.textContent = option.label
    sinceFilter.append(optionEl)
  }

  if (options.some((option) => option.value === previousValue)) {
    sinceFilter.value = previousValue
  }
}

// Build the log line as a DOM node. The untrusted message is set as a text
// node, so it is never parsed as HTML — no sanitization needed.
function buildLogLine(entry: AppLogEntry): HTMLElement {
  const line = document.createElement("div")
  line.className = "log-line"
  line.dataset.level = entry.level
  const pipe = document.createElement("span")
  pipe.className = "pipe"
  pipe.textContent = "┃"
  const ts = document.createElement("span")
  ts.className = "ts"
  ts.textContent = entry.timestamp
  line.append(pipe, " ", ts, " ", entry.message)
  return line
}

function buildStatusLine(text: string): HTMLElement {
  const status = document.createElement("div")
  status.className = "status"
  status.textContent = text
  return status
}

function applyCurrentFilters(line: HTMLElement): void {
  if (!shouldShow(line, getSelectedLevels(), searchInput.value.toLowerCase())) {
    line.classList.add("filtered")
  }
}

window.addEventListener("message", (event) => {
  const msg = event.data
  if (msg.type === "log") {
    if (firstEntry) {
      logs.replaceChildren()
      firstEntry = false
    }
    const wasAtBottom = isNearBottom()
    const line = buildLogLine(msg.entry)
    logs.append(line)
    applyCurrentFilters(line)
    if (wasAtBottom) window.scrollTo(0, document.body.scrollHeight)
  } else if (msg.type === "olderLogs" && Array.isArray(msg.entries)) {
    if (firstEntry) {
      logs.replaceChildren()
      firstEntry = false
    }
    const previousScrollHeight = document.body.scrollHeight
    const previousScrollY = window.scrollY
    const fragment = document.createDocumentFragment()
    for (const entry of msg.entries) {
      const line = buildLogLine(entry)
      applyCurrentFilters(line)
      fragment.append(line)
    }
    logs.prepend(fragment)
    window.scrollTo(
      0,
      previousScrollY + document.body.scrollHeight - previousScrollHeight,
    )
  } else if (msg.type === "status") {
    const status = buildStatusLine(String(msg.text ?? ""))
    if (firstEntry) {
      logs.replaceChildren(status)
    } else {
      logs.append(status)
    }
  } else if (msg.type === "clear") {
    logs.replaceChildren()
    firstEntry = true
  } else if (msg.type === "streamingState") {
    setStreamingState(msg.streaming, msg.appLabel)
  } else if (msg.type === "sinceOptions" && Array.isArray(msg.options)) {
    updateSinceOptions(msg.options)
  } else if (msg.type === "historyNotice") {
    showHistoryNotice(String(msg.text ?? ""))
  } else if (msg.type === "historyState") {
    setHistoryState(Boolean(msg.hasOlder), Boolean(msg.loading))
  }
})
