import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ApiService } from "../../cloud/api"
import { ACCOUNT_ID, NAME, SESSION_ID } from "../../cloud/auth"
import { ConfigService } from "../../cloud/config"
import { CloudController } from "../../cloud/controller"
import type { App, Team } from "../../cloud/types"

function createStatusBarStub() {
  return {
    text: "",
    command: "",
    show: sinon.stub(),
    hide: sinon.stub(),
    dispose: sinon.stub(),
  } as unknown as vscode.StatusBarItem
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
    statusBar,
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
  const workspaceFolder = {
    uri: workspaceRoot,
    name: "test",
    index: 0,
  }

  Object.defineProperty(vscode.workspace, "workspaceFolders", {
    value: [workspaceFolder],
    configurable: true,
  })

  sinon.stub(vscode.authentication, "getSession").resolves(mockSession as any)
  sinon.stub(deps.configService, "startWatching")
  sinon
    .stub(deps.configService, "getConfig")
    .resolves({ app_id: "a1", team_id: "t1" })
  sinon.stub(deps.apiService, "getApp").resolves(testApp)
  sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

  // Stub active editor to return a document in the workspace
  const activeEditor = {
    document: { uri: vscode.Uri.file("/tmp/test/file.py") },
  }
  Object.defineProperty(vscode.window, "activeTextEditor", {
    value: activeEditor,
    configurable: true,
  })
  sinon.stub(vscode.workspace, "getWorkspaceFolder").returns(workspaceFolder)

  await deps.controller.initialize()
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
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const activeEditor = {
        document: { uri: vscode.Uri.file("/tmp/test/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: activeEditor,
        configurable: true,
      })
      sinon
        .stub(vscode.workspace, "getWorkspaceFolder")
        .returns(workspaceFolder)

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
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const activeEditor = {
        document: { uri: vscode.Uri.file("/tmp/test/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: activeEditor,
        configurable: true,
      })
      sinon
        .stub(vscode.workspace, "getWorkspaceFolder")
        .returns(workspaceFolder)

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      // First call: main menu selects "link"
      quickPickStub.onFirstCall().resolves({ label: "", id: "link" } as any)

      // Only one team, so pickTeam auto-selects without showing a picker
      sinon.stub(deps.apiService, "getTeams").resolves([testTeam])
      // No apps, so pickExistingApp returns early
      sinon.stub(deps.apiService, "getApps").resolves([])

      await deps.controller.showMenu()

      // Called once: only for main menu (team picker auto-selects single team)
      assert.strictEqual(quickPickStub.callCount, 1)

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
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const activeEditor = {
        document: { uri: vscode.Uri.file("/tmp/test/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: activeEditor,
        configurable: true,
      })
      sinon
        .stub(vscode.workspace, "getWorkspaceFolder")
        .returns(workspaceFolder)

      sinon.stub(vscode.authentication, "getSession").resolves(null as any)
      sinon.stub(deps.configService, "startWatching")

      await deps.controller.initialize()

      assert.strictEqual(
        deps.statusBar.text,
        "$(cloud) Sign into FastAPI Cloud",
      )

      dispose(deps)
    })

    test("shows setup text when logged in but no config", async () => {
      const deps = createController()
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const activeEditor = {
        document: { uri: vscode.Uri.file("/tmp/test/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: activeEditor,
        configurable: true,
      })
      sinon
        .stub(vscode.workspace, "getWorkspaceFolder")
        .returns(workspaceFolder)

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon.stub(deps.configService, "getConfig").resolves(null)

      await deps.controller.initialize()

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
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const activeEditor = {
        document: { uri: vscode.Uri.file("/tmp/test/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: activeEditor,
        configurable: true,
      })
      sinon
        .stub(vscode.workspace, "getWorkspaceFolder")
        .returns(workspaceFolder)

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

      await deps.controller.initialize()

      // Explicitly wait for status bar update since it's fire-and-forget
      await deps.controller["statusBarManager"].update()

      assert.strictEqual(deps.statusBar.text, "$(warning) FastAPI Cloud")
      assert.ok(warnStub.calledOnce)

      dispose(deps)
    })

    test("shows setup text without toast on transient error", async () => {
      const deps = createController()
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const activeEditor = {
        document: { uri: vscode.Uri.file("/tmp/test/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: activeEditor,
        configurable: true,
      })
      sinon
        .stub(vscode.workspace, "getWorkspaceFolder")
        .returns(workspaceFolder)

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

      await deps.controller.initialize()

      assert.strictEqual(deps.statusBar.text, "$(cloud) Set up FastAPI Cloud")
      assert.ok(!warnStub.called)

      dispose(deps)
    })
  })

  suite("addWorkspaceFolder", () => {
    test("watches config and refreshes state", async () => {
      const deps = createController()
      const newWorkspace = vscode.Uri.file("/tmp/new-workspace")

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      const getConfigStub = sinon.stub(deps.configService, "getConfig")
      getConfigStub.resolves({ app_id: "a1", team_id: "t1" })
      sinon.stub(deps.apiService, "getApp").resolves(testApp)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.addWorkspaceFolder(newWorkspace)

      assert.ok(
        (deps.configService.startWatching as sinon.SinonStub).calledWith(
          newWorkspace,
        ),
      )
      assert.strictEqual(deps.controller["workspaceStates"].size, 1)

      dispose(deps)
    })
  })

  suite("removeWorkspaceFolder", () => {
    test("deletes workspace state", async () => {
      const deps = createController()
      const workspace = vscode.Uri.file("/tmp/workspace")
      const workspaceFolder = { uri: workspace, name: "workspace", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon
        .stub(deps.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      sinon.stub(deps.apiService, "getApp").resolves(testApp)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.initialize()
      assert.strictEqual(deps.controller["workspaceStates"].size, 1)

      deps.controller.removeWorkspaceFolder(workspace)
      assert.strictEqual(deps.controller["workspaceStates"].size, 0)

      dispose(deps)
    })
  })

  suite("refreshAll", () => {
    test("refreshes all workspace folders", async () => {
      const deps = createController()
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      const getConfigStub = sinon.stub(deps.configService, "getConfig")
      getConfigStub
        .withArgs(workspace1)
        .resolves({ app_id: "a1", team_id: "t1" })
      getConfigStub
        .withArgs(workspace2)
        .resolves({ app_id: "a2", team_id: "t1" })
      sinon.stub(deps.apiService, "getApp").resolves(testApp)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.refreshAll()

      assert.strictEqual(deps.controller["workspaceStates"].size, 2)

      dispose(deps)
    })
  })

  suite("concurrent refresh handling", () => {
    test("waits for in-progress refresh instead of starting duplicate", async () => {
      const deps = createController()
      const workspace = vscode.Uri.file("/tmp/workspace")

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon
        .stub(deps.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      const getAppStub = sinon.stub(deps.apiService, "getApp")

      let resolveGetApp: (value: App) => void
      const getAppPromise = new Promise<App>((resolve) => {
        resolveGetApp = resolve
      })
      getAppStub.returns(getAppPromise as any)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      // Start first refresh (will block on getApp)
      const refresh1 = deps.controller.refresh(workspace)

      // Start second refresh while first is in progress
      const refresh2 = deps.controller.refresh(workspace)

      // Resolve the API call
      resolveGetApp!(testApp)

      await Promise.all([refresh1, refresh2])

      // getApp should only be called once due to deduplication
      assert.strictEqual(getAppStub.callCount, 1)

      dispose(deps)
    })
  })

  suite("refresh error handling", () => {
    test("handles getSession throwing an error", async () => {
      const deps = createController()
      const workspace = vscode.Uri.file("/tmp/workspace")
      const workspaceFolder = { uri: workspace, name: "workspace", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .rejects(new Error("Auth error"))
      sinon.stub(deps.configService, "startWatching")

      await deps.controller.initialize()

      const state = deps.controller["getState"](workspace)
      assert.strictEqual(state.status, "not_configured")

      dispose(deps)
    })

    test("handles unexpected error during refresh", async () => {
      const deps = createController()
      const workspace = vscode.Uri.file("/tmp/workspace")
      const workspaceFolder = { uri: workspace, name: "workspace", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")
      sinon
        .stub(deps.configService, "getConfig")
        .rejects(new Error("Unexpected error"))

      await deps.controller.initialize()

      const state = deps.controller["getState"](workspace)
      assert.strictEqual(state.status, "error")

      dispose(deps)
    })

    test("does not show warning when already shown for not_found state", async () => {
      const deps = createController()
      const workspace = vscode.Uri.file("/tmp/workspace")
      const workspaceFolder = { uri: workspace, name: "workspace", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

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

      // First refresh - should show warning
      await deps.controller.initialize()
      assert.strictEqual(warnStub.callCount, 1)

      // Manually mark warning as shown
      deps.controller["setState"](workspace, {
        status: "not_found",
        warningShown: true,
      })

      // Second refresh - should NOT show warning again
      await deps.controller.refresh(workspace)
      assert.strictEqual(warnStub.callCount, 1) // Still 1, not 2

      dispose(deps)
    })

    test("calls unlinkProject when user clicks Unlink in 404 warning", async () => {
      const deps = createController()
      const workspace = vscode.Uri.file("/tmp/workspace")
      const workspaceFolder = { uri: workspace, name: "workspace", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

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

      let resolveWarning: (value: string | undefined) => void
      const warningPromise = new Promise<string | undefined>((resolve) => {
        resolveWarning = resolve
      })
      sinon
        .stub(vscode.window, "showWarningMessage")
        .returns(warningPromise as any)

      const deleteStub = sinon
        .stub(deps.configService, "deleteConfig")
        .resolves()

      await deps.controller.initialize()

      // User clicks "Unlink"
      resolveWarning!("Unlink")

      // Give the async callback time to execute
      await new Promise((resolve) => setTimeout(resolve, 10))

      assert.ok(deleteStub.calledOnce)

      dispose(deps)
    })
  })

  suite("createAndLinkProject", () => {
    test("delegates to linkCommands", async () => {
      const deps = createController()
      const workspace = vscode.Uri.file("/tmp/workspace")
      const workspaceFolder = { uri: workspace, name: "workspace", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.apiService, "getTeams").resolves([testTeam])
      sinon.stub(vscode.window, "showInputBox").resolves("my-new-app")
      sinon.stub(deps.apiService, "createApp").resolves(testApp)
      sinon.stub(deps.configService, "writeConfig").resolves()
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)
      sinon.stub(deps.apiService, "getApp").resolves(testApp)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)
      sinon
        .stub(deps.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      sinon.stub(deps.configService, "startWatching")

      await deps.controller.createAndLinkProject(workspace)

      const state = deps.controller["getState"](workspace)
      assert.strictEqual(state.status, "linked")

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

  suite("multi-root workspaces", () => {
    const testApp2: any = {
      id: "a2",
      slug: "test-app-2",
      url: "https://test-app-2.fastapicloud.dev",
      team_id: "t1",
    }

    test("status bar matches active workspace folder", async () => {
      const deps = createController()
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")

      const getConfigStub = sinon.stub(deps.configService, "getConfig")
      getConfigStub
        .withArgs(workspace1)
        .resolves({ app_id: "a1", team_id: "t1" })
      getConfigStub
        .withArgs(workspace2)
        .resolves({ app_id: "a2", team_id: "t1" })

      const getAppStub = sinon.stub(deps.apiService, "getApp")
      getAppStub.withArgs("a1").resolves(testApp)
      getAppStub.withArgs("a2").resolves(testApp2)

      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.initialize()

      // Active editor in workspace1
      const editor1 = {
        document: { uri: vscode.Uri.file("/tmp/workspace1/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: editor1,
        configurable: true,
      })
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        "getWorkspaceFolder",
      )
      getWorkspaceFolderStub
        .withArgs(editor1.document.uri)
        .returns(workspaceFolder1)

      await deps.controller["statusBarManager"].update()
      assert.strictEqual(deps.statusBar.text, "$(cloud) test-app")

      // Switch to workspace2 file
      const editor2 = {
        document: { uri: vscode.Uri.file("/tmp/workspace2/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: editor2,
        configurable: true,
      })
      getWorkspaceFolderStub
        .withArgs(editor2.document.uri)
        .returns(workspaceFolder2)

      await deps.controller["statusBarManager"].update()
      assert.strictEqual(deps.statusBar.text, "$(cloud) test-app-2")

      dispose(deps)
    })

    test("each workspace has independent config state", async () => {
      const deps = createController()
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")

      const getConfigStub = sinon.stub(deps.configService, "getConfig")
      // workspace1 has config, workspace2 doesn't
      getConfigStub
        .withArgs(workspace1)
        .resolves({ app_id: "a1", team_id: "t1" })
      getConfigStub.withArgs(workspace2).resolves(null)

      sinon.stub(deps.apiService, "getApp").resolves(testApp)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.initialize()

      // workspace1 file shows app
      const editor1 = {
        document: { uri: vscode.Uri.file("/tmp/workspace1/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: editor1,
        configurable: true,
      })
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        "getWorkspaceFolder",
      )
      getWorkspaceFolderStub
        .withArgs(editor1.document.uri)
        .returns(workspaceFolder1)

      await deps.controller["statusBarManager"].update()
      assert.strictEqual(deps.statusBar.text, "$(cloud) test-app")

      // workspace2 file shows setup
      const editor2 = {
        document: { uri: vscode.Uri.file("/tmp/workspace2/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: editor2,
        configurable: true,
      })
      getWorkspaceFolderStub
        .withArgs(editor2.document.uri)
        .returns(workspaceFolder2)

      await deps.controller["statusBarManager"].update()
      assert.strictEqual(deps.statusBar.text, "$(cloud) Set up FastAPI Cloud")

      dispose(deps)
    })

    test("linkProject writes config to correct workspace", async () => {
      const deps = createController()
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2],
        configurable: true,
      })

      const getSessionStub = sinon.stub(vscode.authentication, "getSession")
      getSessionStub.resolves(mockSession as any)

      sinon.stub(deps.configService, "startWatching")
      const getConfigStub = sinon.stub(deps.configService, "getConfig")
      getConfigStub.resolves(null)

      await deps.controller.initialize()

      // Active editor in workspace2
      const editor2 = {
        document: { uri: vscode.Uri.file("/tmp/workspace2/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: editor2,
        configurable: true,
      })
      sinon
        .stub(vscode.workspace, "getWorkspaceFolder")
        .withArgs(editor2.document.uri)
        .returns(workspaceFolder2)

      // pickTeam auto-selects when only 1 team (no QuickPick)
      sinon.stub(deps.apiService, "getTeams").resolves([testTeam])
      // pickExistingApp shows QuickPick for app selection
      sinon.stub(deps.apiService, "getApps").resolves([testApp])

      // Mock QuickPick: first call for workspace folder, second for app
      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub
        .onFirstCall()
        .resolves({ label: "workspace2", uri: workspace2 } as any)
      quickPickStub
        .onSecondCall()
        .resolves({ label: testApp.slug, app: testApp } as any)

      sinon.stub(deps.apiService, "getApp").resolves(testApp)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      const writeStub = sinon.stub(deps.configService, "writeConfig").resolves()
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      // Update getConfig to return config after link
      getConfigStub
        .withArgs(workspace2)
        .resolves({ app_id: "a1", team_id: "t1" })

      await deps.controller.linkProject()

      // Config should be written to workspace2
      assert.ok(writeStub.calledOnce)
      assert.strictEqual(
        writeStub.firstCall.args[0].toString(),
        workspace2.toString(),
      )

      dispose(deps)
    })

    test("unlinkProject deletes config from correct workspace", async () => {
      const deps = createController()
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2],
        configurable: true,
      })

      const getSessionStub = sinon.stub(vscode.authentication, "getSession")
      getSessionStub.resolves(mockSession as any)

      sinon.stub(deps.configService, "startWatching")

      const getConfigStub = sinon.stub(deps.configService, "getConfig")
      getConfigStub
        .withArgs(workspace1)
        .resolves({ app_id: "a1", team_id: "t1" })
      getConfigStub
        .withArgs(workspace2)
        .resolves({ app_id: "a2", team_id: "t1" })

      const getAppStub = sinon.stub(deps.apiService, "getApp")
      getAppStub.withArgs("a1").resolves(testApp)
      getAppStub.withArgs("a2").resolves(testApp2)

      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.initialize()

      // Mock QuickPick to select workspace2
      sinon.stub(vscode.window, "showQuickPick").resolves({
        label: "workspace2",
        uri: workspace2,
      } as any)

      sinon.stub(vscode.window, "showWarningMessage").resolves("Unlink" as any)
      const deleteStub = sinon
        .stub(deps.configService, "deleteConfig")
        .resolves()

      // After unlinking, config returns null
      getConfigStub.withArgs(workspace2).resolves(null)

      await deps.controller.unlinkProject()

      // Config should be deleted from workspace2
      assert.ok(deleteStub.calledOnce)
      assert.strictEqual(
        deleteStub.firstCall.args[0].toString(),
        workspace2.toString(),
      )

      dispose(deps)
    })

    test("showMenu uses active workspace context", async () => {
      const deps = createController()
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2],
        configurable: true,
      })

      sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)
      sinon.stub(deps.configService, "startWatching")

      const getConfigStub = sinon.stub(deps.configService, "getConfig")
      // workspace1 has app, workspace2 doesn't
      getConfigStub
        .withArgs(workspace1)
        .resolves({ app_id: "a1", team_id: "t1" })
      getConfigStub.withArgs(workspace2).resolves(null)

      const getAppStub = sinon.stub(deps.apiService, "getApp")
      getAppStub.withArgs("a1").resolves(testApp)

      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.initialize()

      // Active in workspace1 - shows app menu
      const editor1 = {
        document: { uri: vscode.Uri.file("/tmp/workspace1/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: editor1,
        configurable: true,
      })
      const getWorkspaceFolderStub = sinon.stub(
        vscode.workspace,
        "getWorkspaceFolder",
      )
      getWorkspaceFolderStub
        .withArgs(editor1.document.uri)
        .returns(workspaceFolder1)

      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub.resolves(undefined)

      await deps.controller.showMenu()

      const firstCall = quickPickStub.firstCall.args[0] as any[]
      assert.ok(firstCall.some((item: any) => item.id === "open"))

      // Switch to workspace2 - shows setup menu
      const editor2 = {
        document: { uri: vscode.Uri.file("/tmp/workspace2/file.py") },
      }
      Object.defineProperty(vscode.window, "activeTextEditor", {
        value: editor2,
        configurable: true,
      })
      getWorkspaceFolderStub
        .withArgs(editor2.document.uri)
        .returns(workspaceFolder2)

      quickPickStub.resetHistory()
      await deps.controller.showMenu()

      const secondCall = quickPickStub.firstCall.args[0] as any[]
      assert.ok(secondCall.some((item: any) => item.id === "link"))

      dispose(deps)
    })

    test("signOut clears all workspace states", async () => {
      const deps = createController()
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2],
        configurable: true,
      })

      const getSessionStub = sinon.stub(vscode.authentication, "getSession")
      getSessionStub.resolves(mockSession as any)

      sinon.stub(deps.configService, "startWatching")
      sinon
        .stub(deps.configService, "getConfig")
        .resolves({ app_id: "a1", team_id: "t1" })
      sinon.stub(deps.apiService, "getApp").resolves(testApp)
      sinon.stub(deps.apiService, "getTeam").resolves(testTeam)

      await deps.controller.initialize()

      assert.strictEqual(deps.controller["workspaceStates"].size, 2)

      sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves("Sign Out" as any)
      deps.authProvider.signOut = sinon.stub().resolves()

      // After sign out, session is null
      getSessionStub.resolves(null as any)

      await deps.controller.signOut()

      // All workspace states should be cleared
      assert.strictEqual(deps.controller["workspaceStates"].size, 0)

      dispose(deps)
    })
  })
})
