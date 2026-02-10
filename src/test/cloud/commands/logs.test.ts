import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { StreamLogError } from "../../../cloud/api"
import {
  formatLogEntry,
  getWebviewHtml,
  LogsViewProvider,
} from "../../../cloud/commands/logs"
import type { ConfigService } from "../../../cloud/config"
import { mockApiService, mockConfigService } from "../../testUtils"

const testWorkspaceUri = vscode.Uri.file("/tmp/test")
const testExtensionUri = vscode.Uri.file("/tmp/extension")

function createWebviewView() {
  const messages: any[] = []
  const messageHandlers: ((msg: any) => void)[] = []
  let disposeHandler: (() => void) | undefined

  const webview = {
    options: {} as any,
    html: "",
    cspSource: "https://test-csp-source",
    asWebviewUri: (uri: vscode.Uri) => uri,
    postMessage: sinon.stub().callsFake((msg: any) => {
      messages.push(msg)
      return Promise.resolve(true)
    }),
    onDidReceiveMessage: (handler: (msg: any) => void) => {
      messageHandlers.push(handler)
      return { dispose: () => {} }
    },
  }

  const view = {
    webview,
    onDidDispose: (handler: () => void) => {
      disposeHandler = handler
      return { dispose: () => {} }
    },
  } as unknown as vscode.WebviewView

  return {
    view,
    messages,
    sendMessage: (msg: any) => messageHandlers[0]?.(msg),
    triggerDispose: () => disposeHandler?.(),
  }
}

function createProvider(
  getActiveWorkspaceFolder: () => vscode.Uri | null = () => testWorkspaceUri,
) {
  const configService = mockConfigService()
  const apiService = mockApiService({
    streamAppLogs: sinon.stub(),
  } as any)

  const provider = new LogsViewProvider(
    testExtensionUri,
    configService as unknown as ConfigService,
    apiService as any,
    getActiveWorkspaceFolder,
  )

  return { provider, configService, apiService }
}

suite("cloud/commands/logs", () => {
  teardown(() => sinon.restore())

  suite("resolveWebviewView", () => {
    test("sets up webview options and html", () => {
      const { provider } = createProvider()
      const { view } = createWebviewView()

      provider.resolveWebviewView(view)

      assert.strictEqual(view.webview.options.enableScripts, true)
      assert.ok(view.webview.html.includes("<!DOCTYPE html>"))
    })
  })

  suite("stopStreaming", () => {
    test("sends streamingState false", () => {
      const { provider } = createProvider()
      const { view, messages } = createWebviewView()

      provider.resolveWebviewView(view)
      provider.stopStreaming()

      const stateMsg = messages.find((m) => m.type === "streamingState")
      assert.ok(stateMsg)
      assert.strictEqual(stateMsg.streaming, false)
    })
  })

  suite("streamLogs", () => {
    test("shows error when no workspace folder", async () => {
      const { provider } = createProvider(() => null)
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)

      const errorStub = sinon.stub(vscode.window, "showErrorMessage")

      await provider.streamLogs()

      assert.ok(errorStub.calledOnce)
      assert.ok(errorStub.firstCall.args[0].includes("No workspace folder"))
    })

    test("shows error when no app linked", async () => {
      const { provider, configService } = createProvider()
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves(null)

      const errorStub = sinon.stub(vscode.window, "showErrorMessage")

      await provider.streamLogs()

      assert.ok(errorStub.calledOnce)
      assert.ok(errorStub.firstCall.args[0].includes("No app linked"))
    })

    test("streams log entries to webview", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      const entries = [
        { timestamp: "2025-01-15T10:30:00Z", message: "line 1", level: "info" },
        {
          timestamp: "2025-01-15T10:30:01Z",
          message: "line 2",
          level: "error",
        },
      ]

      async function* fakeStream() {
        for (const entry of entries) yield entry
      }
      apiService.streamAppLogs.returns(fakeStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "5m", tail: 50 })

      const logMessages = messages.filter((m) => m.type === "log")
      assert.strictEqual(logMessages.length, 2)
      assert.ok(logMessages[0].html.includes("line 1"))
      assert.ok(logMessages[1].html.includes("line 2"))

      // Verify stream ended message
      const statusMessages = messages.filter((m) => m.type === "status")
      assert.ok(statusMessages.some((m) => m.text === "Stream ended."))
    })

    test("shows no-logs status when stream is empty", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* emptyStream() {
        // yield nothing
      }
      apiService.streamAppLogs.returns(emptyStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "1h" })

      const statusMessages = messages.filter((m) => m.type === "status")
      assert.ok(statusMessages.some((m) => m.text.includes("No logs found")))
    })

    test("handles StreamLogError", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* errorStream() {
        yield* [] // satisfy useYield lint rule
        throw new StreamLogError("App not found")
      }
      apiService.streamAppLogs.returns(errorStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      const statusMessages = messages.filter((m) => m.type === "status")
      assert.ok(statusMessages.some((m) => m.text.includes("App not found")))
    })

    test("handles generic error", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* errorStream() {
        yield* [] // satisfy useYield lint rule
        throw new Error("Network failure")
      }
      apiService.streamAppLogs.returns(errorStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()
      const errorStub = sinon.stub(vscode.window, "showErrorMessage")

      await provider.streamLogs()

      assert.ok(errorStub.calledOnce)
      assert.ok(errorStub.firstCall.args[0].includes("Network failure"))
    })

    test("sends clear and connecting status before streaming", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      assert.ok(messages.some((m) => m.type === "clear"))
      assert.ok(
        messages.some(
          (m) => m.type === "status" && m.text.includes("Connecting"),
        ),
      )
      assert.ok(
        messages.some(
          (m) => m.type === "streamingState" && m.streaming === true,
        ),
      )
    })

    test("sends streamingState false when done", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      const last = messages[messages.length - 1]
      assert.strictEqual(last.type, "streamingState")
      assert.strictEqual(last.streaming, false)
    })

    test("passes options to streamAppLogs", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "1d", tail: 200 })

      const opts = apiService.streamAppLogs.firstCall.args[0]
      assert.strictEqual(opts.appId, "a1")
      assert.strictEqual(opts.since, "1d")
      assert.strictEqual(opts.tail, 200)
      assert.strictEqual(opts.follow, true)
    })
  })

  suite("dispose", () => {
    test("aborts active stream", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      // Create a stream that blocks forever
      let abortSignal: AbortSignal | undefined
      async function* blockingStream() {
        abortSignal = apiService.streamAppLogs.firstCall.args[0].signal
        yield {
          timestamp: "2025-01-15T10:30:00Z",
          message: "first",
          level: "info",
        }
        // Would block here, but dispose should abort
        await new Promise(() => {})
      }
      apiService.streamAppLogs.returns(blockingStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      // Start streaming (don't await - it will block)
      void provider.streamLogs()

      // Give the stream time to start
      await new Promise((r) => setTimeout(r, 10))

      provider.dispose()

      assert.ok(abortSignal?.aborted)
    })
  })

  suite("formatLogEntry", () => {
    test("formats a log entry with level, timestamp, and message", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "Server started",
        level: "info",
      })
      assert.ok(html.startsWith('<div class="log-line"'))
      assert.ok(html.includes('data-level="info"'))
      assert.ok(html.includes("color:#00cccc"))
      assert.ok(html.includes("Server started"))
      assert.ok(html.includes("2025-01-15T10:30:00.000Z"))
      assert.ok(html.includes('<span class="ts">'))
      assert.ok(html.includes("┃"))
    })

    test("normalizes warn to warning", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "warn",
      })
      assert.ok(html.includes('data-level="warning"'))
    })

    test("normalizes fatal to critical", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "fatal",
      })
      assert.ok(html.includes('data-level="critical"'))
    })

    test("infers level from message prefix when level is unknown", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: '      INFO   50.35.91.231:0 - "GET / HTTP/1.1" 200',
        level: "unknown",
      })
      assert.ok(html.includes('data-level="info"'))
      assert.ok(html.includes("color:#00cccc"))
    })

    test("defaults to info when level is missing", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "no level",
        level: undefined as any,
      })
      assert.ok(html.includes('data-level="info"'))
    })

    test("uses default color for unknown level", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "trace",
      })
      assert.ok(html.includes('data-level="trace"'))
      assert.ok(html.includes("color:#888"))
    })

    test("lowercases level", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "ERROR",
      })
      assert.ok(html.includes('data-level="error"'))
    })

    test("escapes HTML in message", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "<script>alert('xss')</script>",
        level: "info",
      })
      assert.ok(html.includes("&lt;script&gt;"))
      assert.ok(!html.includes("<script>alert"))
    })

    test("escapes quotes in level for attribute safety", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: '"onclick="alert(1)',
      })
      assert.ok(!html.includes('data-level=""onclick'))
      assert.ok(html.includes("&quot;"))
    })

    test("handles invalid timestamp gracefully", () => {
      const html = formatLogEntry({
        timestamp: "not-a-date",
        message: "msg",
        level: "info",
      })
      assert.ok(html.includes("not-a-date"))
    })
  })

  suite("getWebviewHtml", () => {
    function createMockWebview() {
      return {
        cspSource: "https://test-csp-source",
        asWebviewUri: (uri: vscode.Uri) => uri,
      } as unknown as vscode.Webview
    }

    test("returns valid HTML with CSP", () => {
      const html = getWebviewHtml(createMockWebview(), testExtensionUri)
      assert.ok(html.includes("<!DOCTYPE html>"))
      assert.ok(html.includes("Content-Security-Policy"))
      assert.ok(html.includes("default-src 'none'"))
      assert.ok(html.includes("https://test-csp-source"))
    })

    test("includes toolbar controls", () => {
      const html = getWebviewHtml(createMockWebview(), testExtensionUri)
      assert.ok(html.includes('id="since-filter"'))
      assert.ok(html.includes('id="stream-btn"'))
      assert.ok(html.includes('id="filter-btn"'))
      assert.ok(html.includes('id="clear-btn"'))
      assert.ok(html.includes('id="search-input"'))
    })

    test("includes since options", () => {
      const html = getWebviewHtml(createMockWebview(), testExtensionUri)
      assert.ok(html.includes('value="5m"'))
      assert.ok(html.includes('value="1d"'))
    })

    test("includes level filter chips", () => {
      const html = getWebviewHtml(createMockWebview(), testExtensionUri)
      for (const level of ["debug", "info", "warning", "error", "critical"]) {
        assert.ok(
          html.includes(`data-level="${level}"`),
          `missing ${level} chip`,
        )
      }
    })

    test("references external script", () => {
      const html = getWebviewHtml(createMockWebview(), testExtensionUri)
      assert.ok(html.includes("<script src="))
      assert.ok(html.includes("webview.js"))
    })

    test("references external stylesheet", () => {
      const html = getWebviewHtml(createMockWebview(), testExtensionUri)
      assert.ok(html.includes('<link rel="stylesheet"'))
      assert.ok(html.includes("styles.css"))
    })
  })
})
