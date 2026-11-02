import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { StatusBarManager } from "../../../cloud/ui/statusBar"

function mockStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem()
  sinon.stub(item, "show").returns()
  sinon.stub(item, "dispose").returns()
  return item
}

suite("cloud/ui/statusBar", () => {
  teardown(() => sinon.restore())

  suite("statuses", () => {
    test("shows sign in when no session", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      sinon.stub(vscode.authentication, "getSession").resolves(undefined)

      await manager.update()

      assert.strictEqual(statusBarItem.text, "$(cloud) Sign into FastAPI Cloud")
    })

    test("shows deploy when no workspace folder", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      sinon.stub(vscode.authentication, "getSession").resolves({} as any)

      await manager.update()

      assert.strictEqual(
        statusBarItem.text,
        "$(rocket) Deploy to FastAPI Cloud",
      )
    })

    test("shows deploy when workspace not configured", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => vscode.Uri.parse("file:///workspace"),
      )

      sinon.stub(vscode.authentication, "getSession").resolves({} as any)

      await manager.update()

      assert.strictEqual(
        statusBarItem.text,
        "$(rocket) Deploy to FastAPI Cloud",
      )
    })

    test("shows app slug when linked", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({
          status: "linked",
          app: {
            id: "a1",
            slug: "my-app",
            url: "https://myapp.com",
            team_id: "t1",
          },
          team: {} as any,
        }),
        () => vscode.Uri.parse("file:///workspace"),
      )

      sinon.stub(vscode.authentication, "getSession").resolves({} as any)

      await manager.update()

      assert.strictEqual(statusBarItem.text, "$(cloud) my-app")
    })

    test("shows warning on bad link", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_found", warningShown: false }),
        () => vscode.Uri.parse("file:///workspace"),
      )

      sinon.stub(vscode.authentication, "getSession").resolves({} as any)

      await manager.update()

      assert.strictEqual(statusBarItem.text, "$(warning) FastAPI Cloud")
    })

    test("shows sign in on error", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      sinon
        .stub(vscode.authentication, "getSession")
        .rejects(new Error("Auth failed"))

      await manager.update()

      assert.strictEqual(statusBarItem.text, "$(cloud) Sign into FastAPI Cloud")
    })
  })

  suite("show", () => {
    test("sets up status bar and registers editor listener", () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      const listenerStub = sinon.stub(
        vscode.window,
        "onDidChangeActiveTextEditor",
      )
      const disposable = { dispose: sinon.stub() }
      listenerStub.returns(disposable as any)

      manager.show()

      assert.strictEqual(statusBarItem.text, "$(cloud) FastAPI Cloud")
      assert.ok((statusBarItem.show as sinon.SinonStub).calledOnce)
      assert.ok(listenerStub.calledOnce)
    })

    test("does not register duplicate editor listener", () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      const listenerStub = sinon.stub(
        vscode.window,
        "onDidChangeActiveTextEditor",
      )
      const disposable = { dispose: sinon.stub() }
      listenerStub.returns(disposable as any)

      manager.show()
      manager.show()

      // Should only register once
      assert.ok(listenerStub.calledOnce)
    })

    test("debounces updates on active editor change", () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      const clock = sinon.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout"],
      })
      const updateStub = sinon.stub(manager, "update").resolves()

      let editorChangeCallback:
        | ((e: vscode.TextEditor | undefined) => void)
        | undefined
      sinon
        .stub(vscode.window, "onDidChangeActiveTextEditor")
        .callsFake((cb) => {
          editorChangeCallback = cb
          return { dispose: sinon.stub() } as any
        })

      manager.show()

      editorChangeCallback!(undefined)
      clock.tick(60)
      editorChangeCallback!(undefined)

      // The first change's deadline passes, but the second change reset it.
      clock.tick(60)
      assert.strictEqual(updateStub.callCount, 0)
      editorChangeCallback!(undefined)

      // Wait until 100ms after the most recent change, not the first one.
      clock.tick(99)
      assert.strictEqual(updateStub.callCount, 0)
      clock.tick(1)
      assert.strictEqual(updateStub.callCount, 1)

      // No additional updates should follow once editor changes stop.
      clock.tick(1000)
      assert.strictEqual(updateStub.callCount, 1)
      manager.dispose()
    })
  })

  suite("dispose", () => {
    test("disposes listener and status bar item", () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      const disposeStub = sinon.stub()
      sinon.stub(vscode.window, "onDidChangeActiveTextEditor").returns({
        dispose: disposeStub,
      } as any)

      manager.show()
      manager.dispose()

      assert.ok(disposeStub.calledOnce)
      assert.ok((statusBarItem.dispose as sinon.SinonStub).calledOnce)
    })

    test("does not update after disposal with an editor change pending", () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      const clock = sinon.useFakeTimers({
        toFake: ["setTimeout", "clearTimeout"],
      })
      const updateStub = sinon.stub(manager, "update").resolves()

      let editorChangeCallback:
        | ((e: vscode.TextEditor | undefined) => void)
        | undefined
      sinon
        .stub(vscode.window, "onDidChangeActiveTextEditor")
        .callsFake((cb) => {
          editorChangeCallback = cb
          return { dispose: sinon.stub() } as any
        })

      manager.show()

      editorChangeCallback!(undefined)
      clock.tick(50)
      assert.strictEqual(updateStub.callCount, 0)

      // Disposal must prevent the pending update, even after its deadline.
      manager.dispose()
      clock.tick(1000)
      assert.strictEqual(updateStub.callCount, 0)
    })
  })
})
