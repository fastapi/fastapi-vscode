import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ui } from "../../../cloud/ui/dialogs"

suite("cloud/ui/dialogs", () => {
  teardown(() => sinon.restore())

  test("showErrorMessage calls vscode.window.showErrorMessage", async () => {
    const stub = sinon
      .stub(vscode.window, "showErrorMessage")
      .resolves("Retry" as any)

    const result = await ui.showErrorMessage(
      "An error occurred",
      "Retry",
      "Cancel",
    )

    assert.strictEqual(result, "Retry")
    assert.ok(stub.calledOnce)
    assert.strictEqual(stub.firstCall.args[0], "An error occurred")
    assert.strictEqual(stub.firstCall.args[1], "Retry")
    assert.strictEqual(stub.firstCall.args[2], "Cancel")
  })

  test("showInformationMessage calls vscode.window.showInformationMessage", async () => {
    const stub = sinon
      .stub(vscode.window, "showInformationMessage")
      .resolves("Open App" as any)

    const result = await ui.showInformationMessage(
      "Operation successful",
      "Open App",
      "View Dashboard",
    )
    assert.strictEqual(result, "Open App")
    assert.ok(stub.calledOnce)
    assert.strictEqual(stub.firstCall.args[0], "Operation successful")
    assert.strictEqual(stub.firstCall.args[1], "Open App")
    assert.strictEqual(stub.firstCall.args[2], "View Dashboard")
  })

  test("showQuickPick calls vscode.window.showQuickPick", async () => {
    const items = [
      { label: "Option 1" },
      { label: "Option 2" },
      { label: "Option 3" },
    ]
    const stub = sinon
      .stub(vscode.window, "showQuickPick")
      .resolves(items[1] as any)

    const result = await ui.showQuickPick(items, {
      placeHolder: "Select an option",
    })

    assert.strictEqual(result, items[1])
    assert.ok(stub.calledOnce)
    assert.strictEqual(stub.firstCall.args[0], items)
    assert.deepStrictEqual(stub.firstCall.args[1], {
      placeHolder: "Select an option",
    })
  })
})
