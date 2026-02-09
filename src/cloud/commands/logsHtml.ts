import type { AppLogEntry } from "../api"

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
  { level: "debug", label: "DEBUG", fg: "#fff" },
  { level: "info", label: "INFO", fg: "#000" },
  { level: "warning", label: "WARN", fg: "#000" },
  { level: "error", label: "ERROR", fg: "#fff" },
  { level: "critical", label: "CRITICAL", fg: "#fff" },
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return `${d.toISOString().slice(0, 23)}Z`
  } catch {
    return ts
  }
}

function normalizeLevel(level: string): string {
  if (level === "warn") return "warning"
  if (level === "fatal") return "critical"
  return level
}

export function formatLogEntry(entry: AppLogEntry): string {
  const rawLevel = (entry.level ?? "info").toLowerCase()
  const level = normalizeLevel(rawLevel)
  const color = LEVEL_COLORS[rawLevel] ?? LEVEL_COLORS.default
  const ts = escapeHtml(formatTimestamp(entry.timestamp))
  const msg = escapeHtml(entry.message)
  const escapedLevel = escapeHtml(level)
  return `<div class="log-line" data-level="${escapedLevel}"><span class="pipe" style="color:${color}">┃</span> <span class="ts">${ts}</span> ${msg}</div>`
}

function getLevelChipCss(): string {
  return FILTER_CHIPS.map(
    ({ level, fg }) =>
      `    .level-item[data-level="${level}"].selected { background: ${LEVEL_COLORS[level]}; color: ${fg}; }`,
  ).join("\n")
}

function getLevelChipsHtml(): string {
  return FILTER_CHIPS.map(
    ({ level, label }) =>
      `                    <div class="level-item" data-level="${level}"><span>${label}</span><span class="check">✓</span></div>`,
  ).join("\n")
}

function getSinceOptionsHtml(): string {
  return SINCE_OPTIONS.map(
    (o, i) =>
      `<option value="${o.value}"${i === 0 ? " selected" : ""}>${o.label}</option>`,
  ).join("")
}

export function getWebviewHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
    body {
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        line-height: 1.5;
        padding: 0;
        margin: 0;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
    }
    #logs {
        font-family: var(--vscode-editor-font-family, 'Menlo', 'Consolas', monospace);
        font-size: var(--vscode-editor-font-size, 13px);
    }
    .toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: var(--vscode-editor-background);
        border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    }
    .toolbar select {
        background: var(--vscode-dropdown-background, #3c3c3c);
        color: var(--vscode-dropdown-foreground, inherit);
        border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,0.3));
        padding: 2px 6px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 0.9em;
        cursor: pointer;
    }
    #stream-btn {
        background: var(--vscode-button-background, #0e639c);
        color: var(--vscode-button-foreground, #fff);
        border: none;
        padding: 3px 10px;
        border-radius: 3px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.9em;
        white-space: nowrap;
    }
    #stream-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    .secondary-btn {
        background: var(--vscode-button-secondaryBackground, #3c3c3c);
        color: var(--vscode-button-secondaryForeground, #fff);
        border: none;
        padding: 3px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-family: inherit;
        font-size: 0.9em;
        display: flex;
        align-items: center;
        gap: 2px;
    }
    .secondary-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #505050); }
    .secondary-btn.active { outline: 1px solid var(--vscode-focusBorder, #007fd4); }
    .spacer { flex: 1; }
    .icon-btn {
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        opacity: 0.6;
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 0.85em;
        color: var(--vscode-foreground);
    }
    .icon-btn:hover { opacity: 1; }
    .icon-btn svg { fill: var(--vscode-foreground); }
    .filter-popup {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        background: var(--vscode-dropdown-background, #3c3c3c);
        border: 1px solid var(--vscode-dropdown-border, rgba(128,128,128,0.3));
        border-radius: 4px;
        padding: 8px 12px;
        z-index: 100;
        min-width: 180px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .filter-popup.open { display: block; }
    .filter-popup label {
        display: block;
        font-size: 0.85em;
        opacity: 0.7;
        margin-bottom: 4px;
    }
    .filter-popup input {
        width: 100%;
        background: var(--vscode-input-background, #3c3c3c);
        color: var(--vscode-input-foreground, inherit);
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
        padding: 4px 6px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 0.9em;
        box-sizing: border-box;
    }
    .filter-popup input::placeholder { color: var(--vscode-input-placeholderForeground, rgba(128,128,128,0.7)); }
    .filter-row { margin-bottom: 8px; }
    .filter-row:last-child { margin-bottom: 0; }
    .level-list { display: flex; flex-wrap: wrap; gap: 4px; }
    .level-item {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        cursor: pointer;
        border-radius: 3px;
        font-size: 0.8em;
        background: var(--vscode-button-secondaryBackground, #3c3c3c);
        opacity: 0.6;
    }
    .level-item:hover { opacity: 0.8; }
    .level-item .check { display: none; }
    .level-item.selected { opacity: 1; }
    .level-item.selected .check { display: inline; }
${getLevelChipCss()}
    .filter-hint {
        font-size: 0.8em;
        opacity: 0.5;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    }
    #logs { white-space: pre-wrap; word-break: break-word; padding: 4px 8px; }
    .log-line { padding: 1px 0; }
    .log-line.filtered { display: none; }
    .ts { opacity: 0.5; }
    .status { opacity: 0.5; font-style: italic; }
</style>
</head>
<body>
<div class="toolbar">
    <select id="since-filter">${getSinceOptionsHtml()}</select>
    <div style="position: relative;">
        <button class="secondary-btn" id="filter-btn" title="Filter displayed logs">Filter <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg></button>
        <div class="filter-popup" id="filter-popup">
            <div class="filter-row">
                <label>Log Level</label>
                <div class="level-list" id="level-list">
${getLevelChipsHtml()}
                </div>
            </div>
            <div class="filter-row">
                <label>Search</label>
                <input id="search-input" type="text" placeholder="Filter text..." />
            </div>
            <div class="filter-hint">Filters apply to displayed logs</div>
        </div>
    </div>
    <button id="stream-btn" title="Start streaming"><span id="stream-label">Stream</span></button>
    <div class="spacer"></div>
    <button class="icon-btn" id="clear-btn" title="Clear logs"><svg width="12" height="12" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4L4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>Clear</button>
</div>
<div id="logs"><span class="status">Click Stream to fetch logs.</span></div>
<script>
    const vscode = acquireVsCodeApi();
    const logs = document.getElementById('logs');
    const sinceFilter = document.getElementById('since-filter');
    const searchInput = document.getElementById('search-input');
    const streamBtn = document.getElementById('stream-btn');
    const clearBtn = document.getElementById('clear-btn');
    const filterBtn = document.getElementById('filter-btn');
    const filterPopup = document.getElementById('filter-popup');
    const levelList = document.getElementById('level-list');
    let firstEntry = true;
    let isStreaming = false;

    function esc(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function getSelectedLevels() {
        return Array.from(levelList.querySelectorAll('.level-item.selected')).map(el => el.dataset.level);
    }

    streamBtn.addEventListener('click', () => {
        if (isStreaming) {
            vscode.postMessage({ type: 'stopStream' });
        } else {
            vscode.postMessage({
                type: 'startStream',
                since: sinceFilter.value
            });
        }
    });

    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPopup.classList.toggle('open');
    });

    clearBtn.addEventListener('click', () => {
        logs.innerHTML = '';
        firstEntry = true;
    });

    function isNearBottom() {
        return (document.body.scrollHeight - window.innerHeight - window.scrollY) < 8;
    }

    document.addEventListener('click', (e) => {
        if (!filterPopup.contains(e.target) && !filterBtn.contains(e.target)) {
            filterPopup.classList.remove('open');
        }
    });

    function updateFilterBtnState() {
        const selectedLevels = getSelectedLevels();
        const hasLevelFilter = selectedLevels.length > 0;
        const hasFilter = hasLevelFilter || searchInput.value.trim() !== '';
        filterBtn.classList.toggle('active', hasFilter);
    }

    levelList.addEventListener('click', (e) => {
        const item = e.target.closest('.level-item');
        if (item) {
            item.classList.toggle('selected');
            applyFilters();
            updateFilterBtnState();
        }
    });

    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyFilters();
            updateFilterBtnState();
        }, 150);
    });

    function shouldShow(line, selectedLevels, query) {
        const level = line.dataset.level;
        if (selectedLevels.length > 0 && !selectedLevels.includes(level)) return false;
        if (query && !line.textContent.toLowerCase().includes(query)) return false;
        return true;
    }

    function applyFilters() {
        const selectedLevels = getSelectedLevels();
        const query = searchInput.value.toLowerCase();
        const lines = logs.querySelectorAll('.log-line');
        for (const line of lines) {
            line.classList.toggle('filtered', !shouldShow(line, selectedLevels, query));
        }
    }

    function setStreamingState(streaming) {
        isStreaming = streaming;
        const label = document.getElementById('stream-label');
        if (streaming) {
            label.textContent = 'Stop';
            streamBtn.title = 'Stop streaming';
        } else {
            label.textContent = 'Stream';
            streamBtn.title = 'Start streaming';
        }
        sinceFilter.disabled = streaming;
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'log') {
            if (firstEntry) {
                logs.innerHTML = '';
                firstEntry = false;
            }
            const wasAtBottom = isNearBottom();
            logs.insertAdjacentHTML('beforeend', msg.html);
            const last = logs.lastElementChild;
            if (last && !shouldShow(last, getSelectedLevels(), searchInput.value.toLowerCase())) {
                last.classList.add('filtered');
            }
            if (wasAtBottom) window.scrollTo(0, document.body.scrollHeight);
        } else if (msg.type === 'status') {
            const safe = esc(msg.text);
            if (firstEntry) {
                logs.innerHTML = '<span class="status">' + safe + '</span>';
            } else {
                logs.insertAdjacentHTML('beforeend', '<div class="status">' + safe + '</div>');
            }
        } else if (msg.type === 'clear') {
            logs.innerHTML = '';
            firstEntry = true;
        } else if (msg.type === 'streamingState') {
            setStreamingState(msg.streaming);
        }
    });
</script>
</body>
</html>`
}
