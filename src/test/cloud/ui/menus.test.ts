import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import type { WorkspaceState } from "../../../cloud/types"
import { ui } from "../../../cloud/ui/dialogs"
import { type MenuActions, MenuHandler } from "../../../cloud/ui/menus"

const mockSession = {
  accessToken: "test_token",
  id: "session_id",
  account: { id: "account_id", label: "Test User" },
  scopes: [],
} as vscode.AuthenticationSession

const testWorkspaceUri = vscode.Uri.file("/tmp/test")

function createMenuHandler(
  getState: (uri: vscode.Uri) => WorkspaceState = () => ({
    status: "not_configured",
  }),
  getActiveWorkspaceFolder: () => vscode.Uri | null = () => testWorkspaceUri,
) {
  const actions: MenuActions = {
    signOut: sinon.stub().resolves(),
    unlinkProject: sinon.stub().resolves(),
    deploy: sinon.stub().resolves(),
  }

  const handler = new MenuHandler(getState, getActiveWorkspaceFolder, actions)

  return { handler, actions }
}

suite("cloud/ui/menus", () => {
  teardown(() => sinon.restore())

  suite("showMenu", () => {
    test("triggers sign in when not logged in", async () => {
      const { handler } = createMenuHandler()

      const getSessionStub = sinon
        .stub(vscode.authentication, "getSession")
        .resolves(null as any)

      await handler.showMenu()

      // Should call getSession with silent: true, then with createIfNone: true
      assert.strictEqual(getSessionStub.callCount, 2)
      assert.deepStrictEqual(getSessionStub.firstCall.args[2], { silent: true })
      assert.deepStrictEqual(getSessionStub.secondCall.args[2], {
        createIfNone: true,
      })
    })

    test("shows error when no workspace folder", async () => {
      const { handler } = createMenuHandler(
        () => ({ status: "not_configured" }),
        () => null, // No workspace folder
      )

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const errorStub = sinon.stub(ui, "showErrorMessage")

      await handler.showMenu()

      assert.ok(errorStub.calledOnceWith("No workspace folder open"))
    })

    test("calls deploy when not configured", async () => {
      const { handler, actions } = createMenuHandler(() => ({
        status: "not_configured",
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      await handler.showMenu()

      assert.ok((actions.deploy as sinon.SinonStub).calledOnce)
    })

    test("calls deploy when refreshing", async () => {
      const { handler, actions } = createMenuHandler(() => ({
        status: "refreshing",
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      await handler.showMenu()

      assert.ok((actions.deploy as sinon.SinonStub).calledOnce)
    })

    test("calls deploy when app not found", async () => {
      const { handler, actions } = createMenuHandler(() => ({
        status: "not_found",
        warningShown: false,
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      await handler.showMenu()

      assert.ok((actions.deploy as sinon.SinonStub).calledOnce)
    })

    test("calls deploy on error", async () => {
      const { handler, actions } = createMenuHandler(() => ({
        status: "error",
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      await handler.showMenu()

      assert.ok((actions.deploy as sinon.SinonStub).calledOnce)
    })

    test("shows app menu when linked", async () => {
      const { handler } = createMenuHandler(() => ({
        status: "linked",
        app: {
          id: "a1",
          slug: "test-app",
          url: "https://test-app.example.com",
          team_id: "t1",
        },
        team: { id: "t1", name: "Test Team", slug: "test-team" },
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const quickPickStub = sinon
        .stub(vscode.window, "showQuickPick")
        .resolves(undefined)

      await handler.showMenu()

      assert.ok(quickPickStub.calledOnce)
      const items = quickPickStub.firstCall.args[0] as any[]
      assert.ok(items.some((i) => i.id === "open"))
      assert.ok(items.some((i) => i.id === "dashboard"))
      assert.ok(items.some((i) => i.id === "more"))
    })
  })

  suite("app menu", () => {
    test("opens app URL when open selected", async () => {
      const { handler } = createMenuHandler(() => ({
        status: "linked",
        app: {
          id: "a1",
          slug: "test-app",
          url: "https://test-app.example.com",
          team_id: "t1",
        },
        team: { id: "t1", name: "Test Team", slug: "test-team" },
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(ui, "showQuickPick").resolves({ id: "open" } as any)
      const openStub = sinon.stub(vscode.env, "openExternal")

      await handler.showMenu()

      assert.ok(openStub.calledOnce)
      assert.ok(
        openStub.firstCall.args[0].toString().includes("test-app.example.com"),
      )
    })

    test("opens dashboard when dashboard selected", async () => {
      const { handler } = createMenuHandler(() => ({
        status: "linked",
        app: {
          id: "a1",
          slug: "test-app",
          url: "https://test-app.example.com",
          team_id: "t1",
        },
        team: { id: "t1", name: "Test Team", slug: "test-team" },
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon
        .stub(vscode.window, "showQuickPick")
        .resolves({ id: "dashboard" } as any)
      const openStub = sinon.stub(vscode.env, "openExternal")

      await handler.showMenu()

      assert.ok(openStub.calledOnce)
      assert.ok(openStub.firstCall.args[0].toString().includes("test-team"))
      assert.ok(openStub.firstCall.args[0].toString().includes("test-app"))
    })

    test("shows more menu when more selected", async () => {
      const { handler } = createMenuHandler(() => ({
        status: "linked",
        app: {
          id: "a1",
          slug: "test-app",
          url: "https://test-app.example.com",
          team_id: "t1",
        },
        team: { id: "t1", name: "Test Team", slug: "test-team" },
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const quickPickStub = sinon.stub(ui, "showQuickPick")
      // First call: main menu selects "more"
      quickPickStub.onFirstCall().resolves({ id: "more" } as any)
      // Second call: more menu
      quickPickStub.onSecondCall().resolves(undefined)

      await handler.showMenu()

      assert.strictEqual(quickPickStub.callCount, 2)
      const moreItems = quickPickStub.secondCall.args[0] as any[]
      assert.ok(moreItems.some((i) => i.id === "unlink"))
      assert.ok(moreItems.some((i) => i.id === "signout"))
    })
  })

  suite("more menu", () => {
    test("calls unlinkProject when unlink selected", async () => {
      const { handler, actions } = createMenuHandler(() => ({
        status: "linked",
        app: {
          id: "a1",
          slug: "test-app",
          url: "https://test-app.example.com",
          team_id: "t1",
        },
        team: { id: "t1", name: "Test Team", slug: "test-team" },
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const quickPickStub = sinon.stub(ui, "showQuickPick")
      quickPickStub.onFirstCall().resolves({ id: "more" } as any)
      quickPickStub.onSecondCall().resolves({ id: "unlink" } as any)

      await handler.showMenu()

      assert.ok((actions.unlinkProject as sinon.SinonStub).calledOnce)
    })

    test("calls signOut when signout selected", async () => {
      const { handler, actions } = createMenuHandler(() => ({
        status: "linked",
        app: {
          id: "a1",
          slug: "test-app",
          url: "https://test-app.example.com",
          team_id: "t1",
        },
        team: { id: "t1", name: "Test Team", slug: "test-team" },
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const quickPickStub = sinon.stub(ui, "showQuickPick")
      quickPickStub.onFirstCall().resolves({ id: "more" } as any)
      quickPickStub.onSecondCall().resolves({ id: "signout" } as any)

      await handler.showMenu()

      assert.ok((actions.signOut as sinon.SinonStub).calledOnce)
    })
  })
})
