import * as assert from "node:assert"
import { parseEntrypointString } from "../appDiscovery"

suite("parseEntrypointString", () => {
  test("module notation with variable: my_app.main:app", () => {
    const result = parseEntrypointString("my_app.main:app")
    assert.strictEqual(result.relativePath, "my_app/main.py")
    assert.strictEqual(result.variableName, "app")
  })

  test("module notation without variable: my_app.main", () => {
    const result = parseEntrypointString("my_app.main")
    assert.strictEqual(result.relativePath, "my_app/main.py")
    assert.strictEqual(result.variableName, undefined)
  })

  test("deeply nested module: a.b.c.main:application", () => {
    const result = parseEntrypointString("a.b.c.main:application")
    assert.strictEqual(result.relativePath, "a/b/c/main.py")
    assert.strictEqual(result.variableName, "application")
  })

  test("single module name: app", () => {
    const result = parseEntrypointString("app")
    assert.strictEqual(result.relativePath, "app.py")
    assert.strictEqual(result.variableName, undefined)
  })

  test("single module with variable: app:my_app", () => {
    const result = parseEntrypointString("app:my_app")
    assert.strictEqual(result.relativePath, "app.py")
    assert.strictEqual(result.variableName, "my_app")
  })
})
