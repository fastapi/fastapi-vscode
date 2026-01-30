import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ApiService } from "../../cloud/api"
import { ACCOUNT_ID, NAME, SESSION_ID } from "../../cloud/auth"
import { CloudController } from "../../cloud/cloudController"
import { ConfigService } from "../../cloud/config"
import type { App, Team } from "../../cloud/types"

function createStatusBarStub() {
  const statusBar = {
    text: "",
    command: "",
    show: sinon.stub(),
    hide: sinon.stub(),
    dispose: sinon.stub(),
  } as unknown as vscode.StatusBarItem
  sinon.stub(vscode.window, "createStatusBarItem").returns(statusBar)
  return statusBar
}

const mockSession = {
  accessToken: "test_token",
  id: SESSION_ID,
  account: { id: ACCOUNT_ID, label: NAME },
  scopes: [],
} as vscode.AuthenticationSession

function createController() {
  const statusBar = createStatusBarStub()
  const authProvider = { signOut: sinon.stub().resolves() }
  const configService = new ConfigService()
  const apiService = new ApiService()

  const controller = new CloudController(
    authProvider,
    configService,
    apiService,
  )

  return { controller, authProvider, configService, apiService, statusBar }
}

const testTeam: Team = { id: "t1", name: "Test Team", slug: "test-team" }
const testApp: App = {
  id: "a1",
  slug: "test-app",
  url: "https://test-app.fastapicloud.dev",
  team_id: "t1",
}

async function initializeWithApp(deps: ReturnType<typeof createController>) {
  const workspaceRoot = vscode.Uri.file("/tmp/test")
  sinon.stub(vscode.authentication, "getSession").resolves(mockSession as any)
  sinon.stub(deps.configService, "startWatching")
  sinon
    .stub(deps.configService, "getConfig")
    .resolves({ app_id: "a1", team_id: "t1" })
  sinon.stub(deps.apiService, "getApp").resolves(testApp)
  sinon.stub(deps.apiService, "getTeam").resolves(testTeam)
  await deps.controller.initialize(workspaceRoot)
  return workspaceRoot
}

function dispose(deps: ReturnType<typeof createController>) {
  deps.controller.dispose()
  deps.configService.dispose()
}

suite("cloud/cloudController", () => {
  teardown(() => sinon.restore())

  suite("showMenu", () => {
    test("calls signIn when not logged in", async () => {
      const deps = createController()

      sinon.stub(vscode.authentication, "getSession").resolves(null as any)

      await deps.controller.showMenu()

      const stub = vscode.authentication.getSession as sinon.SinonStub
      assert.strictEqual(stub.callCount, 2)
      assert.deepStrictEqual(stub.secondCall.args[2], { createIfNone: true })

      dispose(deps)
    })

    test("shows link options when logged in but no app", async () => {
      const deps = createController()

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      const quickPickStub = sinon
        .stub(vscode.window, "showQuickPick")
        .resolves(undefined)

      await deps.controller.showMenu()

      assert.ok(quickPickStub.calledOnce)
      const items = quickPickStub.firstCall.args[0] as any[]
      assert.ok(items.some((i: any) => i.id === "link"))
      assert.ok(items.some((i: any) => i.id === "create"))

      dispose(deps)
    })

    test("executes link command when link selected", async () => {
      const deps = createController()

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      sinon
        .stub(vscode.window, "showQuickPick")
        .resolves({ label: "", id: "link" } as any)
      const execStub = sinon.stub(vscode.commands, "executeCommand").resolves()

      await deps.controller.showMenu()

      assert.ok(execStub.calledOnceWith("fastapi-vscode.linkApp"))

      dispose(deps)
    })

    test("shows app menu when app is linked", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      const quickPickStub = sinon
        .stub(vscode.window, "showQuickPick")
        .resolves(undefined)

      await deps.controller.showMenu()

      assert.ok(quickPickStub.calledOnce)
      const items = quickPickStub.firstCall.args[0] as any[]
      assert.ok(items.some((i: any) => i.id === "open"))
      assert.ok(items.some((i: any) => i.id === "dashboard"))
      assert.ok(items.some((i: any) => i.id === "more"))

      dispose(deps)
    })

    test("opens app URL when open selected", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      sinon
        .stub(vscode.window, "showQuickPick")
        .resolves({ label: "", id: "open" } as any)
      const openStub = sinon.stub(vscode.env, "openExternal")

      await deps.controller.showMenu()

      assert.ok(openStub.calledOnce)

      dispose(deps)
    })

    test("opens dashboard when dashboard selected", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      sinon
        .stub(vscode.window, "showQuickPick")
        .resolves({ label: "", id: "dashboard" } as any)
      const openStub = sinon.stub(vscode.env, "openExternal")

      await deps.controller.showMenu()

      assert.ok(openStub.calledOnce)

      dispose(deps)
    })

    test("shows more menu when more selected", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      // First call: main menu selects "more"
      quickPickStub.onFirstCall().resolves({ label: "", id: "more" } as any)
      // Second call: more menu — cancel
      quickPickStub.onSecondCall().resolves(undefined)

      await deps.controller.showMenu()

      assert.strictEqual(quickPickStub.callCount, 2)

      dispose(deps)
    })
  })

  suite("showMoreMenu (via showMenu)", () => {
    test("unlinks project when unlink selected", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub.onFirstCall().resolves({ label: "", id: "more" } as any)
      quickPickStub.onSecondCall().resolves({ label: "", id: "unlink" } as any)

      sinon.stub(vscode.window, "showWarningMessage").resolves("Unlink" as any)
      const deleteStub = sinon
        .stub(deps.configService, "deleteConfig")
        .resolves()

      await deps.controller.showMenu()

      assert.ok(deleteStub.calledOnce)

      dispose(deps)
    })

    test("signs out when signout selected", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub.onFirstCall().resolves({ label: "", id: "more" } as any)
      quickPickStub.onSecondCall().resolves({ label: "", id: "signout" } as any)

      sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves("Sign Out" as any)

      await deps.controller.showMenu()

      assert.ok((deps.authProvider.signOut as sinon.SinonStub).calledOnce)

      dispose(deps)
    })
  })

  suite("refresh", () => {
    test("shows sign in text when not logged in", async () => {
      const deps = createController()

      sinon.stub(vscode.authentication, "getSession").resolves(null as any)

      await deps.controller.refresh()

      assert.strictEqual(
        deps.statusBar.text,
        "$(cloud) Sign into FastAPI Cloud",
      )

      dispose(deps)
    })

    test("shows setup text when logged in but no config", async () => {
      const deps = createController()
      const workspaceRoot = vscode.Uri.file("/tmp/test")

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon.stub(deps.configService, "getConfig").resolves(null)

      await deps.controller.initialize(workspaceRoot)

      assert.strictEqual(deps.statusBar.text, "$(cloud) Set up FastAPI Cloud")

      dispose(deps)
    })

    test("shows app slug when config and app exist", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      assert.strictEqual(deps.statusBar.text, "$(cloud) test-app")

      dispose(deps)
    })

    test("shows warning icon and toast when getApp returns 404", async () => {
      const deps = createController()
      const workspaceRoot = vscode.Uri.file("/tmp/test")

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon
        .stub(deps.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      sinon
        .stub(deps.apiService, "getApp")
        .rejects(new Error("API request failed: GET /apps/a1 returned 404"))
      sinon
        .stub(deps.apiService, "getTeam")
        .rejects(new Error("API request failed: GET /teams/t1 returned 404"))
      const warnStub = sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves(undefined as any)

      await deps.controller.initialize(workspaceRoot)

      assert.strictEqual(deps.statusBar.text, "$(warning) FastAPI Cloud")
      assert.ok(warnStub.calledOnce)

      dispose(deps)
    })

    test("shows setup text without toast on transient error", async () => {
      const deps = createController()
      const workspaceRoot = vscode.Uri.file("/tmp/test")

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon
        .stub(deps.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      sinon.stub(deps.apiService, "getApp").rejects(new Error("fetch failed"))
      sinon.stub(deps.apiService, "getTeam").rejects(new Error("fetch failed"))
      const warnStub = sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves(undefined as any)

      await deps.controller.initialize(workspaceRoot)

      assert.strictEqual(deps.statusBar.text, "$(cloud) Set up FastAPI Cloud")
      assert.ok(!warnStub.called)

      dispose(deps)
    })
  })

  suite("linkProject", () => {
    test("shows error without workspace root", async () => {
      const deps = createController()

      const errorStub = sinon.stub(vscode.window, "showErrorMessage")

      await deps.controller.linkProject()

      assert.ok(errorStub.calledOnceWith("No workspace folder open"))

      dispose(deps)
    })

    test("links project when team and app selected", async () => {
      const deps = createController()
      const workspaceRoot = vscode.Uri.file("/tmp/test")

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon.stub(deps.configService, "getConfig").resolves(null)
      await deps.controller.initialize(workspaceRoot)

      // Stub pickTeam and pickExistingApp via their dependencies
      sinon.stub(deps.apiService, "getTeams").resolves([testTeam])
      sinon.stub(deps.apiService, "getApps").resolves([testApp])

      // pickTeam auto-selects when only 1 team, so only pickExistingApp calls showQuickPick
      sinon.stub(vscode.window, "showQuickPick").resolves({
        label: testApp.slug,
        description: testApp.url,
        app: testApp,
      } as any)

      const writeStub = sinon.stub(deps.configService, "writeConfig").resolves()
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      await deps.controller.linkProject()

      assert.ok(writeStub.calledOnce)

      dispose(deps)
    })

    test("returns when team selection cancelled", async () => {
      const deps = createController()
      const workspaceRoot = vscode.Uri.file("/tmp/test")

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon.stub(deps.configService, "getConfig").resolves(null)
      await deps.controller.initialize(workspaceRoot)

      sinon.stub(deps.apiService, "getTeams").resolves([testTeam])
      sinon.stub(vscode.window, "showQuickPick").resolves(undefined)

      const writeStub = sinon.stub(deps.configService, "writeConfig").resolves()

      await deps.controller.linkProject()

      assert.ok(!writeStub.called)

      dispose(deps)
    })
  })

  suite("signOut", () => {
    test("signs out when confirmed", async () => {
      const deps = createController()

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves("Sign Out" as any)

      await deps.controller.signOut()

      assert.ok((deps.authProvider.signOut as sinon.SinonStub).calledOnce)

      dispose(deps)
    })

    test("does not sign out when cancelled", async () => {
      const deps = createController()

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      sinon.stub(vscode.window, "showWarningMessage").resolves(undefined as any)

      await deps.controller.signOut()

      assert.ok(!(deps.authProvider.signOut as sinon.SinonStub).called)

      dispose(deps)
    })
  })

  suite("unlinkProject", () => {
    test("does nothing without workspace root", async () => {
      const deps = createController()

      const deleteStub = sinon
        .stub(deps.configService, "deleteConfig")
        .resolves()

      await deps.controller.unlinkProject()

      assert.ok(!deleteStub.called)

      dispose(deps)
    })

    test("unlinks when confirmed", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      sinon.stub(vscode.window, "showWarningMessage").resolves("Unlink" as any)
      const deleteStub = sinon
        .stub(deps.configService, "deleteConfig")
        .resolves()

      await deps.controller.unlinkProject()

      assert.ok(deleteStub.calledOnce)

      dispose(deps)
    })

    test("does not unlink when cancelled", async () => {
      const deps = createController()
      await initializeWithApp(deps)

      sinon.stub(vscode.window, "showWarningMessage").resolves(undefined as any)
      const deleteStub = sinon
        .stub(deps.configService, "deleteConfig")
        .resolves()

      await deps.controller.unlinkProject()

      assert.ok(!deleteStub.called)

      dispose(deps)
    })
  })

  suite("dispose", () => {
    test("disposes session listener and status bar", () => {
      const deps = createController()
      const listenerDisposable = { dispose: sinon.stub() }
      const original = vscode.authentication.onDidChangeSessions
      Object.defineProperty(vscode.authentication, "onDidChangeSessions", {
        value: () => listenerDisposable,
        configurable: true,
      })

      deps.controller.showStatusBar()
      deps.controller.dispose()

      assert.ok(listenerDisposable.dispose.calledOnce)
      assert.ok((deps.statusBar.dispose as sinon.SinonStub).calledOnce)

      Object.defineProperty(vscode.authentication, "onDidChangeSessions", {
        value: original,
        configurable: true,
      })
    })
  })
})
