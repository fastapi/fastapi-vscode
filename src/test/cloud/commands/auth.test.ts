import * as assert from "node:assert"
import sinon from "sinon"
import { signOut } from "../../../cloud/commands/auth"
import type { AuthProvider } from "../../../cloud/types"
import { ui } from "../../../cloud/ui/dialogs"

suite("cloud/commands/auth", () => {
  teardown(() => sinon.restore())

  suite("signOut", () => {
    test("signs out when confirmed", async () => {
      const authProvider = {
        signOut: sinon.stub().resolves(),
      } as unknown as AuthProvider

      sinon.stub(ui, "showWarningMessage").resolves("Sign Out")

      const result = await signOut(authProvider)

      assert.strictEqual(result, true)
      assert.ok((authProvider.signOut as sinon.SinonStub).calledOnce)
    })

    test("does not sign out when cancelled", async () => {
      const authProvider = {
        signOut: sinon.stub().resolves(),
      } as unknown as AuthProvider

      sinon.stub(ui, "showWarningMessage").resolves(undefined)

      const result = await signOut(authProvider)

      assert.strictEqual(result, false)
      assert.ok(!(authProvider.signOut as sinon.SinonStub).called)
    })
  })
})
