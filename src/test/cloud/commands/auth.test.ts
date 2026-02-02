import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ACCOUNT_ID, NAME, SESSION_ID } from "../../../cloud/auth"
import { AuthCommands } from "../../../cloud/commands/auth"

const mockSession = {
  accessToken: "test_token",
  id: SESSION_ID,
  account: { id: ACCOUNT_ID, label: NAME },
  scopes: [],
} as vscode.AuthenticationSession

function createAuthCommands() {
  const authProvider = { signOut: sinon.stub().resolves() }
  const onStateChanged = sinon.stub()

  const commands = new AuthCommands(authProvider, onStateChanged)

  return { commands, authProvider, onStateChanged }
}

suite("cloud/commands/auth", () => {
  teardown(() => sinon.restore())

  suite("signIn", () => {
    test("calls getSession with createIfNone", async () => {
      const { commands } = createAuthCommands()

      const getSessionStub = sinon
        .stub(vscode.authentication, "getSession")
        .resolves(mockSession as any)

      await commands.signIn()

      assert.ok(getSessionStub.calledOnce)
      assert.deepStrictEqual(getSessionStub.firstCall.args[2], {
        createIfNone: true,
      })
    })
  })

  suite("signOut", () => {
    test("signs out when confirmed", async () => {
      const { commands, authProvider, onStateChanged } = createAuthCommands()

      sinon
        .stub(vscode.window, "showWarningMessage")
        .resolves("Sign Out" as any)

      const result = await commands.signOut()

      assert.strictEqual(result, true)
      assert.ok((authProvider.signOut as sinon.SinonStub).calledOnce)
      assert.ok(onStateChanged.calledOnce)
    })

    test("does not sign out when cancelled", async () => {
      const { commands, authProvider, onStateChanged } = createAuthCommands()

      sinon.stub(vscode.window, "showWarningMessage").resolves(undefined as any)

      const result = await commands.signOut()

      assert.strictEqual(result, false)
      assert.ok(!(authProvider.signOut as sinon.SinonStub).called)
      assert.ok(!onStateChanged.called)
    })
  })
})
