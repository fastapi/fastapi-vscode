import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { StreamLogError } from "../../../cloud/api"
import {
  formatLogEntry,
  getSinceOptions,
  getWebviewHtml,
  LogsViewProvider,
} from "../../../cloud/commands/logs"
import type { ConfigService } from "../../../cloud/config"
import { mockApiService, mockConfigService } from "../../testUtils"

const testWorkspaceUri = vscode.Uri.file("/tmp/test")
const testExtensionUri = vscode.Uri.file("/tmp/extension")

interface TestLogEntry {
  timestamp: string
  timestamp_ns: string
  message: string
  level: string
}

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

function createLogEntry(
  timestamp: string,
  timestamp_ns: string,
  message: string,
): TestLogEntry {
  return { timestamp, timestamp_ns, message, level: "info" }
}

async function* streamEntries(entries: TestLogEntry[]) {
  for (const entry of entries) yield entry
}

suite("cloud/commands/logs", () => {
  teardown(() => sinon.restore())

  suite("getSinceOptions", () => {
    test("limits hobby teams to the base retention options", () => {
      assert.deepStrictEqual(
        getSinceOptions(1).map((option) => option.value),
        ["5m", "30m", "1h", "1d"],
      )
    })

    test("includes weekly and full-retention options for pro teams", () => {
      assert.deepStrictEqual(
        getSinceOptions(14).map((option) => option.value),
        ["5m", "30m", "1h", "1d", "7d", "14d"],
      )
    })
  })

  suite("resolveWebviewView", () => {
    test("sets up webview options and html", () => {
      const { provider } = createProvider()
      const { view } = createWebviewView()

      provider.resolveWebviewView(view)

      assert.strictEqual(view.webview.options.enableScripts, true)
      assert.ok(view.webview.html.includes("<!DOCTYPE html>"))
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
      assert.strictEqual(logMessages[0].entry.message, "line 1")
      assert.strictEqual(logMessages[0].entry.level, "info")
      assert.strictEqual(logMessages[1].entry.message, "line 2")
      assert.strictEqual(logMessages[1].entry.level, "error")

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

    test("enables manual older log loading when the initial stream stays empty", async () => {
      const clock = sinon.useFakeTimers({
        now: new Date("2025-01-15T10:40:00Z"),
        shouldClearNativeTimers: true,
      })
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      let releaseStream: (() => void) | undefined
      async function* delayedStream() {
        await new Promise<void>((resolve) => {
          releaseStream = resolve
        })
        yield createLogEntry(
          "2025-01-15T10:35:00Z",
          "1736937300000000000",
          "eventual log",
        )
      }
      apiService.streamAppLogs.returns(delayedStream())
      apiService.getAppLogs.resolves({
        logs: [],
        has_more: false,
      })
      sinon.stub(vscode.commands, "executeCommand").resolves()

      const streamPromise = provider.streamLogs({ since: "30m" })
      await Promise.resolve()
      await Promise.resolve()
      await clock.tickAsync(1000)

      assert.strictEqual(apiService.getAppLogs.called, false)
      assert.ok(
        messages.some(
          (m) =>
            m.type === "historyState" &&
            m.hasOlder === true &&
            m.loading === false,
        ),
      )

      releaseStream?.()
      await streamPromise
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

    test("enables older log loading after stream cursor is available", async () => {
      sinon.useFakeTimers(new Date("2025-01-15T10:40:00Z"))
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      apiService.streamAppLogs.returns(
        streamEntries([
          createLogEntry(
            "2025-01-15T10:30:00Z",
            "1736937000000000000",
            "line 1",
          ),
        ]),
      )
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "1h" })

      assert.ok(
        messages.some(
          (m) =>
            m.type === "historyState" &&
            m.hasOlder === true &&
            m.loading === false,
        ),
      )
    })

    test("loads older logs before the oldest current cursor", async () => {
      sinon.useFakeTimers(new Date("2025-01-15T10:40:00Z"))
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      apiService.streamAppLogs.returns(
        streamEntries([
          createLogEntry(
            "2025-01-15T10:30:00Z",
            "1736937000000000000",
            "newer",
          ),
        ]),
      )
      apiService.getAppLogs.resolves({
        logs: [
          createLogEntry(
            "2025-01-15T10:20:00Z",
            "1736936400000000000",
            "older",
          ),
        ],
        has_more: false,
      })
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "1h" })
      await provider.loadOlderLogs()

      assert.deepStrictEqual(apiService.getAppLogs.firstCall.args[0], {
        appId: "a1",
        beforeNs: "1736937000000000000",
        limit: 500,
      })
      const olderMessages = messages.filter((m) => m.type === "olderLogs")
      assert.strictEqual(olderMessages.length, 1)
      assert.strictEqual(olderMessages[0].entries[0].message, "older")
      assert.ok(
        messages.some(
          (m) =>
            m.type === "historyState" &&
            m.hasOlder === false &&
            m.loading === false,
        ),
      )
    })

    test("keeps loading available as a load action after history confirms more pages", async () => {
      sinon.useFakeTimers(new Date("2025-01-15T10:40:00Z"))
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      apiService.streamAppLogs.returns(
        streamEntries([
          createLogEntry(
            "2025-01-15T10:30:00Z",
            "1736937000000000000",
            "newer",
          ),
        ]),
      )
      apiService.getAppLogs.resolves({
        logs: [
          createLogEntry(
            "2025-01-15T10:20:00Z",
            "1736936400000000000",
            "older",
          ),
        ],
        has_more: true,
      })
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "1h" })
      await provider.loadOlderLogs()

      assert.ok(
        messages.some(
          (m) =>
            m.type === "historyState" &&
            m.hasOlder === true &&
            m.loading === false,
        ),
      )
    })

    test("does not render older logs outside selected range", async () => {
      sinon.useFakeTimers(new Date("2025-01-15T10:40:00Z"))
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      apiService.streamAppLogs.returns(
        streamEntries([
          createLogEntry(
            "2025-01-15T10:30:00Z",
            "1736937000000000000",
            "newer",
          ),
        ]),
      )
      apiService.getAppLogs.resolves({
        logs: [
          createLogEntry(
            "2025-01-15T10:00:00Z",
            "1736935200000000000",
            "too old",
          ),
        ],
        has_more: true,
      })
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "30m" })
      await provider.loadOlderLogs()

      assert.ok(!messages.some((m) => m.type === "olderLogs"))
      assert.ok(
        messages.some(
          (m) =>
            m.type === "historyNotice" &&
            m.text === "No earlier logs in the last 30 minutes.",
        ),
      )
      assert.ok(
        !messages.some(
          (m) =>
            m.type === "status" && m.text === "No older logs in this range.",
        ),
      )
      assert.ok(
        messages.some(
          (m) =>
            m.type === "historyState" &&
            m.hasOlder === false &&
            m.loading === false,
        ),
      )
    })

    test("suggests choosing a longer range when no loaded logs are in the selected range", async () => {
      sinon.useFakeTimers(new Date("2025-01-15T10:40:00Z"))
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())
      apiService.getAppLogs.resolves({
        logs: [
          createLogEntry(
            "2025-01-15T10:00:00Z",
            "1736935200000000000",
            "outside selected range",
          ),
        ],
        has_more: true,
      })
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "30m" })
      await provider.loadOlderLogs()

      assert.ok(!messages.some((m) => m.type === "olderLogs"))
      assert.ok(
        messages.some(
          (m) =>
            m.type === "historyNotice" &&
            m.text ===
              "No logs found in the last 30 minutes. Choose a longer range to see older logs.",
        ),
      )
    })

    test("ignores older log responses after a new stream starts", async () => {
      sinon.useFakeTimers(new Date("2025-01-15T10:40:00Z"))
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      let resolveOlderLogs:
        | ((response: { logs: TestLogEntry[]; has_more: boolean }) => void)
        | undefined
      const olderLogsPromise = new Promise<{
        logs: TestLogEntry[]
        has_more: boolean
      }>((resolve) => {
        resolveOlderLogs = resolve
      })

      apiService.streamAppLogs
        .onFirstCall()
        .returns(
          streamEntries([
            createLogEntry(
              "2025-01-15T10:30:00Z",
              "1736937000000000000",
              "first stream",
            ),
          ]),
        )
      apiService.streamAppLogs
        .onSecondCall()
        .returns(
          streamEntries([
            createLogEntry(
              "2025-01-15T10:35:00Z",
              "1736937300000000000",
              "second stream",
            ),
          ]),
        )
      apiService.getAppLogs.returns(olderLogsPromise)
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "1h" })
      const loadPromise = provider.loadOlderLogs()
      await provider.streamLogs({ since: "5m" })

      resolveOlderLogs?.({
        logs: [
          createLogEntry(
            "2025-01-15T10:20:00Z",
            "1736936400000000000",
            "stale older",
          ),
        ],
        has_more: false,
      })
      await loadPromise

      assert.ok(
        !messages.some(
          (m) =>
            m.type === "olderLogs" &&
            m.entries.some((entry: { message: string }) =>
              entry.message.includes("stale older"),
            ),
        ),
      )
    })

    test("keeps older log fetch errors visible after restoring history state", async () => {
      sinon.useFakeTimers(new Date("2025-01-15T10:40:00Z"))
      const { provider, configService, apiService } = createProvider()
      const { view, messages } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      apiService.streamAppLogs.returns(
        streamEntries([
          createLogEntry(
            "2025-01-15T10:30:00Z",
            "1736937000000000000",
            "newer",
          ),
        ]),
      )
      apiService.getAppLogs.rejects(new Error("network failed"))
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs({ since: "1h" })
      await provider.loadOlderLogs()

      const historyMessages = messages.filter(
        (m) => m.type === "historyState" || m.type === "historyNotice",
      )
      const lastHistoryMessage = historyMessages.at(-1)
      assert.strictEqual(lastHistoryMessage?.type, "historyNotice")
      assert.ok(lastHistoryMessage?.text.includes("network failed"))
    })
  })

  suite("multi-root workspace resolution", () => {
    const workspace1 = vscode.Uri.file("/tmp/workspace1")
    const workspace2 = vscode.Uri.file("/tmp/workspace2")
    const workspace3 = vscode.Uri.file("/tmp/workspace3")
    const folder1 = { uri: workspace1, name: "workspace1", index: 0 }
    const folder2 = { uri: workspace2, name: "workspace2", index: 1 }
    const folder3 = { uri: workspace3, name: "workspace3", index: 2 }

    test("uses active folder when it has a config in multi-root", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [folder1, folder2],
        configurable: true,
      })

      const { provider, configService, apiService } = createProvider(
        () => workspace1,
      )
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)

      // Active folder has a config
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      // Should stream from workspace1's app
      const opts = apiService.streamAppLogs.firstCall.args[0]
      assert.strictEqual(opts.appId, "a1")
    })

    test("falls back to the only configured folder when active has no config", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [folder1, folder2],
        configurable: true,
      })

      const { provider, configService, apiService } = createProvider(
        () => workspace1,
      )
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)

      // Active folder has no config, workspace2 does
      configService.getConfig.withArgs(workspace1).resolves(null)
      configService.getConfig.withArgs(workspace2).resolves({
        app_id: "a2",
        team_id: "t1",
      })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      const opts = apiService.streamAppLogs.firstCall.args[0]
      assert.strictEqual(opts.appId, "a2")
    })

    test("uses first configured folder when active folder is not linked", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [folder1, folder2, folder3],
        configurable: true,
      })

      const { provider, configService, apiService } = createProvider(
        () => workspace1,
      )
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)

      configService.getConfig.withArgs(workspace1).resolves(null)
      configService.getConfig.withArgs(workspace2).resolves({
        app_id: "a2",
        team_id: "t1",
      })
      configService.getConfig.withArgs(workspace3).resolves({
        app_id: "a3",
        team_id: "t1",
      })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      const opts = apiService.streamAppLogs.firstCall.args[0]
      assert.strictEqual(opts.appId, "a2")
    })

    test("uses first configured folder when no active folder", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [folder1, folder2],
        configurable: true,
      })

      const { provider, configService, apiService } = createProvider(() => null)
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)

      configService.getConfig.withArgs(workspace1).resolves(null)
      configService.getConfig.withArgs(workspace2).resolves({
        app_id: "a2",
        team_id: "t1",
      })

      async function* emptyStream() {}
      apiService.streamAppLogs.returns(emptyStream())
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      const opts = apiService.streamAppLogs.firstCall.args[0]
      assert.strictEqual(opts.appId, "a2")
    })

    test("shows error when no folders have configs in multi-root", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [folder1, folder2],
        configurable: true,
      })

      const { provider, configService, apiService } = createProvider(
        () => workspace1,
      )
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)

      configService.getConfig.resolves(null)

      const errorStub = sinon.stub(vscode.window, "showErrorMessage")
      sinon.stub(vscode.commands, "executeCommand").resolves()

      await provider.streamLogs()

      assert.ok(errorStub.calledOnce)
      assert.ok(errorStub.firstCall.args[0].includes("No app linked"))
      assert.ok(!apiService.streamAppLogs.called)
    })
  })

  suite("dispose", () => {
    test("aborts active stream", async () => {
      const { provider, configService, apiService } = createProvider()
      const { view } = createWebviewView()
      provider.resolveWebviewView(view)
      configService.getConfig.resolves({ app_id: "a1", team_id: "t1" })

      let abortSignal: AbortSignal | undefined
      async function* blockingStream() {
        abortSignal = apiService.streamAppLogs.firstCall.args[0].signal
        yield {
          timestamp: "2025-01-15T10:30:00Z",
          message: "first",
          level: "info",
        }
        await new Promise(() => {})
      }
      apiService.streamAppLogs.returns(blockingStream())

      sinon.stub(vscode.commands, "executeCommand").resolves()

      void provider.streamLogs()

      await new Promise((r) => setTimeout(r, 10))

      provider.dispose()

      assert.ok(abortSignal?.aborted)
    })
  })

  suite("formatLogEntry", () => {
    test("returns level, timestamp, and message fields", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "Server started",
        level: "info",
      })
      assert.equal(entry.level, "info")
      assert.equal(entry.message, "Server started")
      assert.equal(entry.timestamp, "2025-01-15T10:30:00.000Z")
    })

    test("normalizes warn to warning", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "warn",
      })
      assert.equal(entry.level, "warning")
    })

    test("normalizes fatal to critical", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "fatal",
      })
      assert.equal(entry.level, "critical")
    })

    test("infers level from message prefix when level is unknown", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: '      INFO   50.35.91.231:0 - "GET / HTTP/1.1" 200',
        level: "unknown",
      })
      assert.equal(entry.level, "info")
    })

    test("defaults to info when level is missing", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "no level",
        level: undefined as any,
      })
      assert.equal(entry.level, "info")
    })

    test("preserves unrecognized level verbatim", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "trace",
      })
      assert.equal(entry.level, "trace")
    })

    test("lowercases level", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "ERROR",
      })
      assert.equal(entry.level, "error")
    })

    test("passes message through unescaped (webview sets it as text)", () => {
      const entry = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "<script>alert('xss')</script>",
        level: "info",
      })
      assert.equal(entry.message, "<script>alert('xss')</script>")
    })

    test("handles invalid timestamp gracefully", () => {
      const entry = formatLogEntry({
        timestamp: "not-a-date",
        message: "msg",
        level: "info",
      })
      assert.equal(entry.timestamp, "not-a-date")
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

    test("includes log controls", () => {
      const html = getWebviewHtml(createMockWebview(), testExtensionUri)
      assert.ok(html.includes('id="since-filter"'))
      assert.ok(html.includes('id="load-older-btn"'))
      assert.ok(html.includes('id="history-note"'))
      assert.ok(html.includes("Load earlier logs"))
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
