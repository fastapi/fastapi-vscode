import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import type { App, Team } from "../../../cloud/types"
import { ui } from "../../../cloud/ui/dialogs"
import {
  createNewApp,
  pickExistingApp,
  pickTeam,
} from "../../../cloud/ui/pickers"
import { mockApiService } from "../../testUtils"

const team1: Team = { id: "t1", name: "Team One", slug: "team-one" }
const team2: Team = { id: "t2", name: "Team Two", slug: "team-two" }
const app1: App = {
  id: "a1",
  slug: "app-one",
  url: "https://app-one.fastapicloud.dev",
  team_id: "t1",
}
const app2: App = {
  id: "a2",
  slug: "app-two",
  url: "https://app-two.fastapicloud.dev",
  team_id: "t1",
}

suite("cloud/ui/pickers", () => {
  teardown(() => sinon.restore())

  suite("pickTeam", () => {
    test("auto-selects when only one team", async () => {
      const api = mockApiService({
        getTeams: sinon.stub().resolves([team1]),
      })

      const result = await pickTeam(api)

      assert.deepStrictEqual(result, team1)
    })

    test("shows quick pick when multiple teams", async () => {
      const api = mockApiService({
        getTeams: sinon.stub().resolves([team1, team2]),
      })

      sinon
        .stub(ui, "showQuickPick")
        .resolves({ label: team1.name, team: team1 } as any)

      const result = await pickTeam(api)

      assert.deepStrictEqual(result, team1)
    })

    test("returns null when no teams", async () => {
      const api = mockApiService()
      const errorStub = sinon.stub(ui, "showErrorMessage")

      const result = await pickTeam(api)

      assert.strictEqual(result, null)
      assert.ok(errorStub.calledOnce)
    })

    test("returns null on fetch error", async () => {
      const api = mockApiService({
        getTeams: sinon.stub().rejects(new Error("Network error")),
      })
      const errorStub = sinon.stub(ui, "showErrorMessage")

      const result = await pickTeam(api)

      assert.strictEqual(result, null)
      assert.ok(errorStub.calledOnce)
    })

    test("returns null when user cancels", async () => {
      const api = mockApiService({
        getTeams: sinon.stub().resolves([team1, team2]),
      })

      sinon.stub(ui, "showQuickPick").resolves(undefined)

      const result = await pickTeam(api)

      assert.strictEqual(result, null)
    })
  })

  suite("pickExistingApp", () => {
    test("shows apps and returns selection", async () => {
      const api = mockApiService({
        getApps: sinon.stub().resolves([app1, app2]),
      })

      sinon
        .stub(vscode.window, "showQuickPick")
        .resolves({ label: app1.slug, description: app1.url, app: app1 } as any)

      const result = await pickExistingApp(api, team1)

      assert.deepStrictEqual(result, app1)
    })

    test("returns null when no apps", async () => {
      const api = mockApiService()
      const errorStub = sinon.stub(ui, "showErrorMessage")

      const result = await pickExistingApp(api, team1)

      assert.strictEqual(result, null)
      assert.ok(errorStub.calledOnce)
    })

    test("returns null on fetch error", async () => {
      const api = mockApiService({
        getApps: sinon.stub().rejects(new Error("Network error")),
      })
      const errorStub = sinon.stub(ui, "showErrorMessage")

      const result = await pickExistingApp(api, team1)

      assert.strictEqual(result, null)
      assert.ok(errorStub.calledOnce)
    })

    test("returns null when user cancels", async () => {
      const api = mockApiService({
        getApps: sinon.stub().resolves([app1]),
      })

      sinon.stub(ui, "showQuickPick").resolves(undefined)

      const result = await pickExistingApp(api, team1)

      assert.strictEqual(result, null)
    })
  })

  suite("createNewApp", () => {
    test("creates app with valid name", async () => {
      const createdApp = { id: "a3", slug: "my-app", url: "", team_id: "t1" }
      const api = mockApiService({
        createApp: sinon.stub().resolves(createdApp),
      })

      sinon.stub(vscode.window, "showInputBox").resolves("my-app")
      const infoStub = sinon.stub(ui, "showInformationMessage")

      const result = await createNewApp(api, team1, "default-name")

      assert.deepStrictEqual(result, createdApp)
      assert.ok(infoStub.calledOnce)
    })

    test("returns null when user cancels input", async () => {
      const api = mockApiService()

      sinon.stub(vscode.window, "showInputBox").resolves(undefined)

      const result = await createNewApp(api, team1, "default-name")

      assert.strictEqual(result, null)
    })

    test("passes validateInput that enforces naming rules", async () => {
      const api = mockApiService()

      const inputStub = sinon
        .stub(vscode.window, "showInputBox")
        .resolves(undefined)

      await createNewApp(api, team1, "default-name")

      const options = inputStub.firstCall.args[0] as vscode.InputBoxOptions
      const validate = options.validateInput!

      // Valid names
      assert.strictEqual(validate("ab"), null)
      assert.strictEqual(validate("my-app-123"), null)

      // Too short
      assert.ok(validate("a"))
      assert.ok(validate(""))

      // Invalid characters
      assert.ok(validate("My App"))
      assert.ok(validate("my_app"))
      assert.ok(validate("MY-APP"))
    })

    test("returns null on API error", async () => {
      const api = mockApiService({
        createApp: sinon.stub().rejects(new Error("Already exists")),
      })

      sinon.stub(vscode.window, "showInputBox").resolves("my-app")
      const errorStub = sinon.stub(ui, "showErrorMessage")

      const result = await createNewApp(api, team1, "default-name")

      assert.strictEqual(result, null)
      assert.ok(errorStub.calledOnce)
    })
  })
})
