import * as assert from "node:assert"
import * as vscode from "vscode"

suite("Extension Test Suite", () => {
  test("Extension should be present", () => {
    assert.ok(vscode.extensions.getExtension("FastAPILabs.fastapi-vscode"))
  })

  test("Extension should activate", async () => {
    const ext = vscode.extensions.getExtension("FastAPILabs.fastapi-vscode")
    assert.ok(ext)
    await ext.activate()
    assert.strictEqual(ext.isActive, true)
  })
})
