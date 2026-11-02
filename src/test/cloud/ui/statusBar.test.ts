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

    test("debounces updates on active editor change", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      const getSessionStub = sinon
        .stub(vscode.authentication, "getSession")
        .resolves(undefined)

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

      // Trigger multiple editor changes rapidly
      editorChangeCallback!(undefined)
      editorChangeCallback!(undefined)
      editorChangeCallback!(undefined)

      // Wait for debounce timeout (100ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Only one update should have happened due to debouncing
      assert.strictEqual(getSessionStub.callCount, 1)
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

    test("clears pending timeout on dispose", async () => {
      const statusBarItem = mockStatusBarItem()
      const manager = new StatusBarManager(
        statusBarItem,
        () => ({ status: "not_configured" }),
        () => null,
      )

      const getSessionStub = sinon
        .stub(vscode.authentication, "getSession")
        .resolves(undefined)

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

      // Trigger an editor change to start the debounce timer
      editorChangeCallback!(undefined)

      // Dispose before the timeout fires
      manager.dispose()

      // Wait to ensure timeout would have fired
      await new Promise((resolve) => setTimeout(resolve, 150))

      // getSession should not have been called because timeout was cleared
      assert.strictEqual(getSessionStub.callCount, 0)
    })
  })
})
