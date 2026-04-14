import * as assert from "node:assert"
import * as vscode from "vscode"
import { Parser } from "../../core/parser"
import type {
  AppDefinition,
  RouteDefinition,
  RouterDefinition,
} from "../../core/types"
import { RouteToTestCodeLensProvider } from "../../vscode/routeToTestCodeLensProvider"
import { TestCallIndex } from "../../vscode/testIndex"
import { wasmBinaries } from "../testUtils"

function createMockApp(
  routes: RouteDefinition[],
  routers: RouterDefinition[] = [],
  filePath = "file:///test/main.py",
): AppDefinition {
  return {
    name: "app",
    filePath,
    workspaceFolder: "file:///test",
    routes,
    routers,
  }
}

function createRoute(
  method: string,
  path: string,
  filePath = "file:///test/main.py",
  line = 1,
): RouteDefinition {
  return {
    method: method.toUpperCase() as RouteDefinition["method"],
    path,
    functionName: "handler",
    location: {
      filePath,
      line,
      column: 0,
    },
  }
}

suite("RouteToTestCodeLensProvider", () => {
  let parser: Parser

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  test("returns empty array when no routes match current file", async () => {
    const testIndex = new TestCallIndex(parser)
    const app = createMockApp([
      createRoute("GET", "/users", "file:///other/main.py"),
    ])
    const provider = new RouteToTestCodeLensProvider([app], testIndex)

    const doc = await vscode.workspace.openTextDocument({
      content: "@app.get('/users')\ndef handler(): pass",
      language: "python",
    })
    const lenses = provider.provideCodeLenses(doc)
    assert.strictEqual(lenses.length, 0)
  })

  test("returns empty array when routes have no matching tests", async () => {
    const testIndex = new TestCallIndex(parser)
    const doc = await vscode.workspace.openTextDocument({
      content: "@app.get('/users')\ndef handler(): pass",
      language: "python",
    })
    const app = createMockApp([
      createRoute("GET", "/users", doc.uri.toString()),
    ])
    const provider = new RouteToTestCodeLensProvider([app], testIndex)

    const lenses = provider.provideCodeLenses(doc)
    assert.strictEqual(lenses.length, 0)
  })

  test("setApps fires change event", () => {
    const testIndex = new TestCallIndex(parser)
    const provider = new RouteToTestCodeLensProvider([], testIndex)

    let eventFired = false
    provider.onDidChangeCodeLenses(() => {
      eventFired = true
    })

    provider.setApps([createMockApp([])])
    assert.strictEqual(eventFired, true)
  })

  test("creates CodeLens with correct title for single test", async () => {
    const testIndex = new TestCallIndex(parser)
    // Manually populate the index with a test call
    const testCode = 'client.get("/users")'
    const tree = parser.parse(testCode)
    if (tree) {
      const { findTestClientCalls } = await import("../../core/extractors")
      const calls = findTestClientCalls(tree.rootNode)
      // Access private index via any cast for testing
      ;(testIndex as any).index.set("file:///test/test_app.py", calls)
    }

    const doc = await vscode.workspace.openTextDocument({
      content: "@app.get('/users')\ndef handler(): pass",
      language: "python",
    })
    const app = createMockApp([
      createRoute("GET", "/users", doc.uri.toString()),
    ])
    const provider = new RouteToTestCodeLensProvider([app], testIndex)

    const lenses = provider.provideCodeLenses(doc)
    assert.strictEqual(lenses.length, 1)
    assert.strictEqual(lenses[0].command?.title, "1 test")
  })

  test("creates CodeLens with plural title for multiple tests", async () => {
    const testIndex = new TestCallIndex(parser)
    const testCode = `
client.get("/users")
client.get("/users")
`
    const tree = parser.parse(testCode)
    if (tree) {
      const { findTestClientCalls } = await import("../../core/extractors")
      const calls = findTestClientCalls(tree.rootNode)
      ;(testIndex as any).index.set("file:///test/test_app.py", calls)
    }

    const doc = await vscode.workspace.openTextDocument({
      content: "@app.get('/users')\ndef handler(): pass",
      language: "python",
    })
    const app = createMockApp([
      createRoute("GET", "/users", doc.uri.toString()),
    ])
    const provider = new RouteToTestCodeLensProvider([app], testIndex)

    const lenses = provider.provideCodeLenses(doc)
    assert.strictEqual(lenses.length, 1)
    assert.strictEqual(lenses[0].command?.title, "2 tests")
  })

  test("uses goToDefinition command with locations", async () => {
    const testIndex = new TestCallIndex(parser)
    const testCode = 'client.get("/users")'
    const tree = parser.parse(testCode)
    if (tree) {
      const { findTestClientCalls } = await import("../../core/extractors")
      const calls = findTestClientCalls(tree.rootNode)
      ;(testIndex as any).index.set("file:///test/test_app.py", calls)
    }

    const doc = await vscode.workspace.openTextDocument({
      content: "@app.get('/users')\ndef handler(): pass",
      language: "python",
    })
    const app = createMockApp([
      createRoute("GET", "/users", doc.uri.toString()),
    ])
    const provider = new RouteToTestCodeLensProvider([app], testIndex)

    const lenses = provider.provideCodeLenses(doc)
    assert.strictEqual(
      lenses[0].command?.command,
      "fastapi-vscode.goToDefinition",
    )
    assert.ok(Array.isArray(lenses[0].command?.arguments?.[0]))
  })

  test("aggregates test calls from multiple files", async () => {
    const testIndex = new TestCallIndex(parser)
    const { findTestClientCalls } = await import("../../core/extractors")

    // Populate index with calls from two different test files
    const tree1 = parser.parse('client.get("/users")')
    if (tree1) {
      ;(testIndex as any).index.set(
        "file:///test/test_users.py",
        findTestClientCalls(tree1.rootNode),
      )
    }
    const tree2 = parser.parse('client.get("/users")\nclient.get("/users/123")')
    if (tree2) {
      ;(testIndex as any).index.set(
        "file:///test/test_admin.py",
        findTestClientCalls(tree2.rootNode),
      )
    }

    const doc = await vscode.workspace.openTextDocument({
      content: "@app.get('/users')\ndef handler(): pass",
      language: "python",
    })
    const app = createMockApp([
      createRoute("GET", "/users", doc.uri.toString()),
    ])
    const provider = new RouteToTestCodeLensProvider([app], testIndex)

    const lenses = provider.provideCodeLenses(doc)
    assert.strictEqual(lenses.length, 1)
    assert.strictEqual(lenses[0].command?.title, "2 tests")

    // Verify locations point to different files
    const locations = lenses[0].command?.arguments?.[0] as vscode.Location[]
    assert.strictEqual(locations.length, 2)
    const filePaths = locations.map((l) => l.uri.toString())
    assert.ok(filePaths.includes("file:///test/test_users.py"))
    assert.ok(filePaths.includes("file:///test/test_admin.py"))
  })

  test("matches routes case-insensitively", async () => {
    const testIndex = new TestCallIndex(parser)
    // findTestClientCalls returns lowercase methods
    const testCode = 'client.get("/items")'
    const tree = parser.parse(testCode)
    if (tree) {
      const { findTestClientCalls } = await import("../../core/extractors")
      const calls = findTestClientCalls(tree.rootNode)
      ;(testIndex as any).index.set("file:///test/test_app.py", calls)
    }

    const doc = await vscode.workspace.openTextDocument({
      content: "@app.get('/items')\ndef handler(): pass",
      language: "python",
    })
    // Route has uppercase method
    const app = createMockApp([
      createRoute("GET", "/items", doc.uri.toString()),
    ])
    const provider = new RouteToTestCodeLensProvider([app], testIndex)

    const lenses = provider.provideCodeLenses(doc)
    assert.strictEqual(lenses.length, 1)
  })
})
