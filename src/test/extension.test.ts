import * as assert from "node:assert"
import * as vscode from "vscode"
import { EXTENSION_ID } from "../extension"

suite("Extension Test Suite", () => {
  test("Extension should be present", () => {
    assert.ok(vscode.extensions.getExtension(EXTENSION_ID))
  })

  test("Extension should activate", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID)
    assert.ok(ext)
    await ext.activate()
    assert.strictEqual(ext.isActive, true)
  })
})
