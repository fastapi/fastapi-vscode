import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ApiService } from "../../../cloud/api"
import {
  createAndLinkProject,
  linkProject,
  unlinkProject,
} from "../../../cloud/commands/project"
import { ConfigService } from "../../../cloud/config"
import type { App, Team, WorkspaceState } from "../../../cloud/types"

const testTeam: Team = { id: "t1", name: "Test Team", slug: "test-team" }
const testApp: App = {
  id: "a1",
  slug: "test-app",
  url: "https://test-app.fastapicloud.dev",
  team_id: "t1",
}
const testApp2: App = {
  id: "a2",
  slug: "test-app-2",
  url: "https://test-app-2.fastapicloud.dev",
  team_id: "t1",
}

suite("cloud/commands/project", () => {
  let apiService: ApiService
  let configService: ConfigService

  setup(() => {
    apiService = new ApiService()
    configService = new ConfigService()
  })

  teardown(() => sinon.restore())

  suite("linkProject", () => {
    test("shows error without workspace folder", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: undefined,
        configurable: true,
      })

      const errorStub = sinon.stub(vscode.window, "showErrorMessage")

      await linkProject(apiService, configService)

      assert.ok(errorStub.calledOnceWith("No workspace folder open"))
    })

    test("links project when team and app selected", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon.stub(apiService, "getTeams").resolves([testTeam])
      sinon.stub(apiService, "getApps").resolves([testApp])

      sinon.stub(vscode.window, "showQuickPick").resolves({
        label: testApp.slug,
        description: testApp.url,
        app: testApp,
      } as any)

      const writeStub = sinon.stub(configService, "writeConfig").resolves()
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      const result = await linkProject(apiService, configService, workspaceRoot)

      assert.ok(writeStub.calledOnce)
      assert.strictEqual(
        writeStub.firstCall.args[0].toString(),
        workspaceRoot.toString(),
      )
      assert.deepStrictEqual(writeStub.firstCall.args[1], {
        app_id: "a1",
        team_id: "t1",
      })
      assert.strictEqual(result?.toString(), workspaceRoot.toString())
    })

    test("returns null when team selection cancelled", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon
        .stub(apiService, "getTeams")
        .resolves([testTeam, { id: "t2", name: "Team 2", slug: "team-2" }])
      sinon.stub(vscode.window, "showQuickPick").resolves(undefined)

      const writeStub = sinon.stub(configService, "writeConfig").resolves()

      const result = await linkProject(apiService, configService, workspaceRoot)

      assert.ok(!writeStub.called)
      assert.strictEqual(result, null)
    })

    test("returns null when app selection cancelled", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon.stub(apiService, "getTeams").resolves([testTeam])
      sinon.stub(apiService, "getApps").resolves([testApp])
      sinon.stub(vscode.window, "showQuickPick").resolves(undefined)

      const writeStub = sinon.stub(configService, "writeConfig").resolves()

      const result = await linkProject(apiService, configService, workspaceRoot)

      assert.ok(!writeStub.called)
      assert.strictEqual(result, null)
    })
  })

  suite("createAndLinkProject", () => {
    test("creates new app and links project", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon.stub(apiService, "getTeams").resolves([testTeam])
      sinon.stub(vscode.window, "showInputBox").resolves("my-new-app")
      sinon.stub(apiService, "createApp").resolves(testApp)

      const writeStub = sinon.stub(configService, "writeConfig").resolves()
      sinon
        .stub(vscode.window, "showInformationMessage")
        .resolves(undefined as any)

      const result = await createAndLinkProject(
        apiService,
        configService,
        workspaceRoot,
      )

      assert.ok(writeStub.calledOnce)
      assert.strictEqual(
        writeStub.firstCall.args[0].toString(),
        workspaceRoot.toString(),
      )
      assert.deepStrictEqual(writeStub.firstCall.args[1], {
        app_id: "a1",
        team_id: "t1",
      })
      assert.strictEqual(result?.toString(), workspaceRoot.toString())
    })

    test("returns null when team selection cancelled", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon
        .stub(apiService, "getTeams")
        .resolves([testTeam, { id: "t2", name: "Team 2", slug: "team-2" }])
      sinon.stub(vscode.window, "showQuickPick").resolves(undefined)

      const writeStub = sinon.stub(configService, "writeConfig").resolves()

      const result = await createAndLinkProject(
        apiService,
        configService,
        workspaceRoot,
      )

      assert.ok(!writeStub.called)
      assert.strictEqual(result, null)
    })

    test("returns null when app name input cancelled", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      sinon.stub(apiService, "getTeams").resolves([testTeam])
      sinon.stub(vscode.window, "showInputBox").resolves(undefined)

      const writeStub = sinon.stub(configService, "writeConfig").resolves()

      const result = await createAndLinkProject(
        apiService,
        configService,
        workspaceRoot,
      )

      assert.ok(!writeStub.called)
      assert.strictEqual(result, null)
    })
  })

  suite("unlinkProject", () => {
    test("shows error without workspace folder", async () => {
      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: undefined,
        configurable: true,
      })

      const errorStub = sinon.stub(vscode.window, "showErrorMessage")
      const getState = () => ({ status: "not_configured" }) as WorkspaceState

      await unlinkProject(configService, getState)

      assert.ok(errorStub.calledOnceWith("No workspace folder open"))
    })

    test("unlinks when confirmed", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const getState = () =>
        ({ status: "linked", app: testApp, team: testTeam }) as WorkspaceState

      sinon.stub(vscode.window, "showWarningMessage").resolves("Unlink" as any)
      const deleteStub = sinon.stub(configService, "deleteConfig").resolves()

      const result = await unlinkProject(configService, getState, workspaceRoot)

      assert.ok(deleteStub.calledOnce)
      assert.strictEqual(
        deleteStub.firstCall.args[0].toString(),
        workspaceRoot.toString(),
      )
      assert.strictEqual(result?.toString(), workspaceRoot.toString())
    })

    test("returns null when cancelled", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const getState = () =>
        ({ status: "linked", app: testApp, team: testTeam }) as WorkspaceState

      sinon.stub(vscode.window, "showWarningMessage").resolves(undefined as any)
      const deleteStub = sinon.stub(configService, "deleteConfig").resolves()

      const result = await unlinkProject(configService, getState, workspaceRoot)

      assert.ok(!deleteStub.called)
      assert.strictEqual(result, null)
    })

    test("only shows linked folders in picker for multi-root workspace", async () => {
      const workspace1 = vscode.Uri.file("/tmp/workspace1")
      const workspace2 = vscode.Uri.file("/tmp/workspace2")
      const workspace3 = vscode.Uri.file("/tmp/workspace3")
      const workspaceFolder1 = { uri: workspace1, name: "workspace1", index: 0 }
      const workspaceFolder2 = { uri: workspace2, name: "workspace2", index: 1 }
      const workspaceFolder3 = { uri: workspace3, name: "workspace3", index: 2 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder1, workspaceFolder2, workspaceFolder3],
        configurable: true,
      })

      const getState = (uri: vscode.Uri): WorkspaceState => {
        if (uri.toString() === workspace1.toString()) {
          return { status: "linked", app: testApp, team: testTeam }
        }
        if (uri.toString() === workspace2.toString()) {
          return { status: "linked", app: testApp2, team: testTeam }
        }
        return { status: "not_configured" }
      }

      const quickPickStub = sinon.stub(vscode.window, "showQuickPick")
      quickPickStub.resolves({ label: "workspace2", uri: workspace2 } as any)

      sinon.stub(vscode.window, "showWarningMessage").resolves("Unlink" as any)
      const deleteStub = sinon.stub(configService, "deleteConfig").resolves()

      await unlinkProject(configService, getState)

      // Verify picker was called with only workspace1 and workspace2
      assert.ok(quickPickStub.calledOnce)
      const items = quickPickStub.firstCall.args[0] as any[]
      assert.strictEqual(items.length, 2)
      assert.strictEqual(items[0].label, "workspace1")
      assert.strictEqual(items[1].label, "workspace2")

      // Verify workspace2 was unlinked
      assert.ok(deleteStub.calledOnce)
      assert.strictEqual(
        deleteStub.firstCall.args[0].toString(),
        workspace2.toString(),
      )
    })

    test("uses 'this app' label when state is not linked", async () => {
      const workspaceRoot = vscode.Uri.file("/tmp/test")
      const workspaceFolder = { uri: workspaceRoot, name: "test", index: 0 }

      Object.defineProperty(vscode.workspace, "workspaceFolders", {
        value: [workspaceFolder],
        configurable: true,
      })

      const getState = () =>
        ({ status: "not_found", warningShown: true }) as WorkspaceState

      const warningStub = sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves("Unlink" as any)
      sinon.stub(configService, "deleteConfig").resolves()

      await unlinkProject(configService, getState, workspaceRoot)

      assert.ok(warningStub.calledOnce)
      assert.ok(warningStub.firstCall.args[0].includes("this app"))
    })
  })
})
