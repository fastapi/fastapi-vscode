import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { deploy, shouldExclude } from "../../../cloud/commands/deploy"
import type { Deployment } from "../../../cloud/types"
import { DeploymentStatus } from "../../../cloud/types"
import { ui } from "../../../cloud/ui/dialogs"
import { mockApiService, mockConfigService, stubFs } from "../../testUtils"

suite("cloud/commands/deploy", () => {
  teardown(() => sinon.restore())

  test("excludes correct files", () => {
    const exclusions = [
      ".venv/lib/python3.12/site-packages",
      "__pycache__/module.cpython-312.pyc",
      "some_folder/__pycache__/file.py",
      ".git/config",
      "some_folder/.git/config",
      ".mypy_cache/cache.json",
      ".pytest_cache/v/cache",
      ".gitignore",
      ".fastapicloudignore",
      "file.pyc",
      "nested/folder/file.pyc",
      ".env",
      ".env.local",
      ".env.production",
      "config/.env",
      "config/.env.test",
    ]
    for (const path of exclusions) {
      assert.strictEqual(
        shouldExclude(path),
        true,
        `Expected to exclude: ${path}`,
      )
    }

    const inclusions = [
      "main.py",
      "app/__init__.py",
      "requirements.txt",
      "src/app.py",
      "some_folder/file.py",
      "env.py",
      "my.env.py",
      "dotenv_config.py",
    ]
    for (const path of inclusions) {
      assert.strictEqual(
        shouldExclude(path),
        false,
        `Expected to include: ${path}`,
      )
    }
  })

  test("shows error message when no workspace folder", async () => {
    const errorStub = sinon.stub(ui, "showErrorMessage")
    const statusBarItem = { text: "" } as vscode.StatusBarItem

    const result = await deploy({
      workspaceRoot: null,
      configService: mockConfigService(),
      apiService: mockApiService(),
      statusBarItem,
    })

    assert.strictEqual(result, false)
    assert.ok(errorStub.calledOnce)
    assert.strictEqual(errorStub.firstCall.args[0], "No workspace folder open")
  })

  test("prompts sign in when no session", async () => {
    const getSessionStub = sinon
      .stub(vscode.authentication, "getSession")
      .resolves(undefined)
    const errorStub = sinon.stub(ui, "showErrorMessage").resolves("Sign In")
    const executeCommandStub = sinon
      .stub(vscode.commands, "executeCommand")
      .resolves()
    const statusBarItem = { text: "" } as vscode.StatusBarItem
    const workspaceRoot = vscode.Uri.file("/test/workspace")

    const result = await deploy({
      workspaceRoot,
      configService: mockConfigService(),
      apiService: mockApiService(),
      statusBarItem,
    })

    assert.strictEqual(result, false)
    assert.ok(getSessionStub.calledOnce)
    assert.ok(errorStub.calledOnce)
    assert.strictEqual(
      errorStub.firstCall.args[0],
      "Please sign in to FastAPI Cloud first.",
    )
    assert.ok(executeCommandStub.calledOnce)
    assert.strictEqual(
      executeCommandStub.firstCall.args[0],
      "fastapi-vscode.signIn",
    )
  })

  test("show create/link app when no app_id in config", async () => {
    const mockSession: vscode.AuthenticationSession = {
      accessToken: "test-token",
      account: { id: "test-id", label: "test-user" },
      id: "session-id",
      scopes: [],
    }
    const getSessionStub = sinon
      .stub(vscode.authentication, "getSession")
      .resolves(mockSession)
    const statusBarItem = { text: "" } as vscode.StatusBarItem
    const workspaceRoot = vscode.Uri.file("/test/workspace")
    const configService = mockConfigService()

    const apiService = mockApiService()
    apiService.getTeams.resolves([
      { id: "team123", name: "Test Team", slug: "test-team" },
    ])

    const quickPickStub = sinon
      .stub(ui, "showQuickPick")
      .resolves({ label: "$(link) Link Existing App", id: "link" } as any)

    const result = await deploy({
      workspaceRoot,
      configService,
      apiService,
      statusBarItem,
    })

    assert.strictEqual(result, false)
    assert.ok(getSessionStub.calledOnce)
    assert.ok(apiService.getTeams.calledOnce)
    assert.ok(quickPickStub.calledOnce)
  })

  test("successfully deploys with existing config", async () => {
    const mockSession: vscode.AuthenticationSession = {
      accessToken: "test-token",
      account: { id: "test-id", label: "test-user" },
      id: "session-id",
      scopes: [],
    }
    const getSessionStub = sinon
      .stub(vscode.authentication, "getSession")
      .resolves(mockSession)
    const statusBarItem = { text: "" } as vscode.StatusBarItem
    const workspaceRoot = vscode.Uri.file("/test/workspace")

    const configService = mockConfigService()
    configService.getConfig.resolves({ app_id: "app123", team_id: "team123" })

    const mockDeployment: Deployment = {
      id: "deploy123",
      slug: "deploy-slug",
      status: DeploymentStatus.waiting_upload,
      url: "https://app.example.com",
      dashboard_url: "https://dashboard.example.com",
    }
    const mockSuccessDeployment: Deployment = {
      ...mockDeployment,
      status: DeploymentStatus.success,
    }

    const apiService = mockApiService()
    apiService.createDeployment.resolves(mockDeployment)
    apiService.getUploadUrl.resolves({
      url: "https://s3.example.com",
      fields: {},
    })
    apiService.completeUpload.resolves()
    apiService.getDeployment.resolves(mockSuccessDeployment)

    // Mock file system
    sinon
      .stub(vscode.workspace, "findFiles")
      .resolves([vscode.Uri.file("/test/workspace/main.py")])
    const fs = stubFs()
    fs.fake.readFile.resolves(new Uint8Array([1, 2, 3]))

    // Mock fetch for S3 upload
    const fetchStub = sinon.stub(global, "fetch").resolves({
      ok: true,
      status: 200,
    } as Response)

    const infoMessageStub = sinon
      .stub(ui, "showInformationMessage")
      .resolves(undefined)

    const result = await deploy({
      workspaceRoot,
      configService,
      apiService,
      statusBarItem,
    })

    assert.strictEqual(result, true)
    assert.ok(getSessionStub.calledOnce)
    assert.ok(apiService.createDeployment.calledWith("app123"))
    assert.ok(apiService.getUploadUrl.calledWith("deploy123"))
    assert.ok(apiService.completeUpload.calledWith("deploy123"))
    assert.ok(infoMessageStub.calledOnce)
    assert.strictEqual(
      infoMessageStub.firstCall.args[0],
      "Deployed successfully!",
    )
    assert.ok(fetchStub.calledOnce)
  })

  test("shows dashboard link on deployment failure", async () => {
    sinon.stub(vscode.authentication, "getSession").resolves({
      accessToken: "test-token",
      account: { id: "test-id", label: "test-user" },
      id: "session-id",
      scopes: [],
    })
    const statusBarItem = { text: "" } as vscode.StatusBarItem
    const workspaceRoot = vscode.Uri.file("/test/workspace")

    const configService = mockConfigService()
    configService.getConfig.resolves({ app_id: "app123", team_id: "team123" })

    const mockDeployment: Deployment = {
      id: "deploy123",
      slug: "deploy-slug",
      status: DeploymentStatus.waiting_upload,
      url: "https://app.example.com",
      dashboard_url:
        "https://dashboard.fastapicloud.com/team-slug/apps/my-app/deployments",
    }
    const mockFailedDeployment: Deployment = {
      ...mockDeployment,
      status: DeploymentStatus.building_image_failed,
    }

    const apiService = mockApiService()
    apiService.createDeployment.resolves(mockDeployment)
    apiService.getUploadUrl.resolves({
      url: "https://s3.example.com",
      fields: {},
    })
    apiService.completeUpload.resolves()
    apiService.getDeployment.resolves(mockFailedDeployment)

    sinon
      .stub(vscode.workspace, "findFiles")
      .resolves([vscode.Uri.file("/test/workspace/main.py")])
    const fs = stubFs()
    fs.fake.readFile.resolves(new Uint8Array([1, 2, 3]))
    sinon.stub(global, "fetch").resolves({ ok: true, status: 200 } as Response)

    const openExternalStub = sinon
      .stub(vscode.env, "openExternal")
      .resolves(true)
    const errorMessageStub = sinon
      .stub(vscode.window, "showErrorMessage")
      .resolves("View Dashboard" as any)

    const result = await deploy({
      workspaceRoot,
      configService,
      apiService,
      statusBarItem,
    })

    assert.strictEqual(result, false)
    assert.strictEqual(statusBarItem.text, "$(cloud) Deploy failed")
    assert.ok(errorMessageStub.calledOnce)
    assert.strictEqual(errorMessageStub.firstCall.args[0], "Deployment failed.")
    assert.ok(openExternalStub.calledOnce)
    assert.strictEqual(
      openExternalStub.firstCall.args[0].toString(),
      "https://dashboard.fastapicloud.com/team-slug/apps/my-app/deployments",
    )
  })

  test("does not open dashboard when user dismisses failure dialog", async () => {
    sinon.stub(vscode.authentication, "getSession").resolves({
      accessToken: "test-token",
      account: { id: "test-id", label: "test-user" },
      id: "session-id",
      scopes: [],
    })
    const statusBarItem = { text: "" } as vscode.StatusBarItem
    const workspaceRoot = vscode.Uri.file("/test/workspace")

    const configService = mockConfigService()
    configService.getConfig.resolves({ app_id: "app123", team_id: "team123" })

    const mockDeployment: Deployment = {
      id: "deploy123",
      slug: "deploy-slug",
      status: DeploymentStatus.waiting_upload,
      url: "https://app.example.com",
      dashboard_url:
        "https://dashboard.fastapicloud.com/team-slug/apps/my-app/deployments",
    }

    const apiService = mockApiService()
    apiService.createDeployment.resolves(mockDeployment)
    apiService.getUploadUrl.resolves({
      url: "https://s3.example.com",
      fields: {},
    })
    apiService.completeUpload.resolves()
    apiService.getDeployment.resolves({
      ...mockDeployment,
      status: DeploymentStatus.building_image_failed,
    })

    sinon
      .stub(vscode.workspace, "findFiles")
      .resolves([vscode.Uri.file("/test/workspace/main.py")])
    const fs = stubFs()
    fs.fake.readFile.resolves(new Uint8Array([1, 2, 3]))
    sinon.stub(global, "fetch").resolves({ ok: true, status: 200 } as Response)

    const openExternalStub = sinon
      .stub(vscode.env, "openExternal")
      .resolves(true)
    sinon.stub(vscode.window, "showErrorMessage").resolves(undefined as any)

    const result = await deploy({
      workspaceRoot,
      configService,
      apiService,
      statusBarItem,
    })

    assert.strictEqual(result, false)
    assert.ok(openExternalStub.notCalled)
  })

  test("does not open dashboard on poll timeout", async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })

    sinon.stub(vscode.authentication, "getSession").resolves({
      accessToken: "test-token",
      account: { id: "test-id", label: "test-user" },
      id: "session-id",
      scopes: [],
    })
    const statusBarItem = { text: "" } as vscode.StatusBarItem
    const workspaceRoot = vscode.Uri.file("/test/workspace")

    const configService = mockConfigService()
    configService.getConfig.resolves({ app_id: "app123", team_id: "team123" })

    const mockDeployment: Deployment = {
      id: "deploy123",
      slug: "deploy-slug",
      status: DeploymentStatus.waiting_upload,
      url: "https://app.example.com",
      dashboard_url:
        "https://dashboard.fastapicloud.com/team-slug/apps/my-app/deployments",
    }

    const apiService = mockApiService()
    apiService.createDeployment.resolves(mockDeployment)
    apiService.getUploadUrl.resolves({
      url: "https://s3.example.com",
      fields: {},
    })
    apiService.completeUpload.resolves()
    apiService.getDeployment.resolves({
      ...mockDeployment,
      status: DeploymentStatus.building,
    })

    sinon
      .stub(vscode.workspace, "findFiles")
      .resolves([vscode.Uri.file("/test/workspace/main.py")])
    const fs = stubFs()
    fs.fake.readFile.resolves(new Uint8Array([1, 2, 3]))
    sinon.stub(global, "fetch").resolves({ ok: true, status: 200 } as Response)

    const openExternalStub = sinon
      .stub(vscode.env, "openExternal")
      .resolves(true)
    sinon
      .stub(vscode.window, "showErrorMessage")
      .resolves("View Dashboard" as any)

    const resultPromise = deploy({
      workspaceRoot,
      configService,
      apiService,
      statusBarItem,
    })

    // 300 polls x 2000ms = 600000ms
    await clock.tickAsync(600_000)

    const result = await resultPromise

    assert.strictEqual(result, false)
    assert.strictEqual(statusBarItem.text, "$(cloud) Deploy failed")
    assert.ok(openExternalStub.notCalled)

    clock.restore()
  })
})
