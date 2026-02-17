/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }

const vscode = acquireVsCodeApi()
const logs = document.getElementById("logs")!
const sinceFilter = document.getElementById("since-filter") as HTMLSelectElement
const searchInput = document.getElementById("search-input") as HTMLInputElement
const streamBtn = document.getElementById("stream-btn")!
const clearBtn = document.getElementById("clear-btn")!
const filterBtn = document.getElementById("filter-btn")!
const filterPopup = document.getElementById("filter-popup")!
const levelList = document.getElementById("level-list")!
const appLabelEl = document.getElementById("app-label")!
let firstEntry = true
let isStreaming = false

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

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
  logs.innerHTML = ""
  firstEntry = true
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

window.addEventListener("message", (event) => {
  const msg = event.data
  if (msg.type === "log") {
    if (firstEntry) {
      logs.innerHTML = ""
      firstEntry = false
    }
    const wasAtBottom = isNearBottom()
    logs.insertAdjacentHTML("beforeend", msg.html)
    const last = logs.lastElementChild as HTMLElement | null
    if (
      last &&
      !shouldShow(last, getSelectedLevels(), searchInput.value.toLowerCase())
    ) {
      last.classList.add("filtered")
    }
    if (wasAtBottom) window.scrollTo(0, document.body.scrollHeight)
  } else if (msg.type === "status") {
    const safe = esc(msg.text)
    if (firstEntry) {
      logs.innerHTML = `<span class="status">${safe}</span>`
    } else {
      logs.insertAdjacentHTML("beforeend", `<div class="status">${safe}</div>`)
    }
  } else if (msg.type === "clear") {
    logs.innerHTML = ""
    firstEntry = true
  } else if (msg.type === "streamingState") {
    setStreamingState(msg.streaming, msg.appLabel)
  }
})
