import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import type { AuthCommands } from "../../../cloud/commands/auth"
import type { LinkCommands } from "../../../cloud/commands/project"
import type { WorkspaceState } from "../../../cloud/types"
import { MenuHandler } from "../../../cloud/ui/menus"

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
  const authCommands = {
    signIn: sinon.stub().resolves(),
    signOut: sinon.stub().resolves(true),
  } as unknown as AuthCommands

  const linkCommands = {
    linkProject: sinon.stub().resolves(),
    createAndLinkProject: sinon.stub().resolves(),
    unlinkProject: sinon.stub().resolves(),
  } as unknown as LinkCommands

  const handler = new MenuHandler(
    authCommands,
    linkCommands,
    getState,
    getActiveWorkspaceFolder,
  )

  return { handler, authCommands, linkCommands }
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
      const errorStub = sinon.stub(vscode.window, "showErrorMessage")

      await handler.showMenu()

      assert.ok(errorStub.calledOnceWith("No workspace folder open"))
    })

    test("shows setup menu when not configured", async () => {
      const { handler } = createMenuHandler(() => ({
        status: "not_configured",
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
      assert.ok(items.some((i) => i.id === "link"))
      assert.ok(items.some((i) => i.id === "create"))
    })

    test("shows setup menu when refreshing", async () => {
      const { handler } = createMenuHandler(() => ({ status: "refreshing" }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const quickPickStub = sinon
        .stub(vscode.window, "showQuickPick")
        .resolves(undefined)

      await handler.showMenu()

      assert.ok(quickPickStub.calledOnce)
    })

    test("shows broken link menu when app not found", async () => {
      const { handler } = createMenuHandler(() => ({
        status: "not_found",
        warningShown: false,
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const warningStub = sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves(undefined)

      await handler.showMenu()

      assert.ok(warningStub.calledOnce)
      assert.ok(warningStub.firstCall.args[0].includes("could not be found"))
    })

    test("shows broken link menu on error", async () => {
      const { handler } = createMenuHandler(() => ({ status: "error" }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      const warningStub = sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves(undefined)

      await handler.showMenu()

      assert.ok(warningStub.calledOnce)
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

  suite("setup menu", () => {
    test("calls linkProject when link selected", async () => {
      const { handler, linkCommands } = createMenuHandler(() => ({
        status: "not_configured",
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(vscode.window, "showQuickPick").resolves({ id: "link" } as any)

      await handler.showMenu()

      assert.ok((linkCommands.linkProject as sinon.SinonStub).calledOnce)
    })

    test("calls createAndLinkProject when create selected", async () => {
      const { handler, linkCommands } = createMenuHandler(() => ({
        status: "not_configured",
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon
        .stub(vscode.window, "showQuickPick")
        .resolves({ id: "create" } as any)

      await handler.showMenu()

      assert.ok(
        (linkCommands.createAndLinkProject as sinon.SinonStub).calledOnce,
      )
    })
  })

  suite("broken link menu", () => {
    test("calls unlinkProject when unlink selected", async () => {
      const { handler, linkCommands } = createMenuHandler(() => ({
        status: "not_found",
        warningShown: false,
      }))

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(vscode.window, "showWarningMessage").resolves("Unlink" as any)

      await handler.showMenu()

      assert.ok((linkCommands.unlinkProject as sinon.SinonStub).calledOnce)
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
      sinon.stub(vscode.window, "showQuickPick").resolves({ id: "open" } as any)
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
      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
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
      const { handler, linkCommands } = createMenuHandler(() => ({
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
      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub.onFirstCall().resolves({ id: "more" } as any)
      quickPickStub.onSecondCall().resolves({ id: "unlink" } as any)

      await handler.showMenu()

      assert.ok((linkCommands.unlinkProject as sinon.SinonStub).calledOnce)
    })

    test("calls signOut when signout selected", async () => {
      const { handler, authCommands } = createMenuHandler(() => ({
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
      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub.onFirstCall().resolves({ id: "more" } as any)
      quickPickStub.onSecondCall().resolves({ id: "signout" } as any)

      await handler.showMenu()

      assert.ok((authCommands.signOut as sinon.SinonStub).calledOnce)
    })
  })
})
