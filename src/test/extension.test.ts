import * as assert from "node:assert"
import * as vscode from "vscode"

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.")

  test("Extension should be present", () => {
    assert.ok(vscode.extensions.getExtension("FastAPI Labs.fastapi-vscode"))
  })

  test("Extension should activate", async () => {
    const ext = vscode.extensions.getExtension("FastAPI Labs.fastapi-vscode")
    assert.ok(ext)
    await ext.activate()
    assert.strictEqual(ext.isActive, true)
  })
})
