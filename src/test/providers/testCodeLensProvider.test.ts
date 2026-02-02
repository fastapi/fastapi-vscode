import * as assert from "node:assert"
import * as vscode from "vscode"
import { Parser } from "../../core/parser"
import type {
  AppDefinition,
  RouteDefinition,
  RouterDefinition,
} from "../../core/types"
import { TestCodeLensProvider } from "../../vscode/testCodeLensProvider"
import { wasmBinaries } from "../testUtils"

function createMockApp(
  routes: RouteDefinition[],
  routers: RouterDefinition[] = [],
): AppDefinition {
  return {
    name: "app",
    filePath: "file:///test/main.py",
    workspaceFolder: "file:///test",
    routes,
    routers,
  }
}

function createRoute(method: string, path: string, line = 1): RouteDefinition {
  return {
    method: method.toUpperCase() as RouteDefinition["method"],
    path,
    functionName: "handler",
    location: {
      filePath: "file:///test/main.py",
      line,
      column: 0,
    },
  }
}

function createRouter(
  prefix: string,
  routes: RouteDefinition[],
  children: RouterDefinition[] = [],
): RouterDefinition {
  return {
    name: "router",
    prefix,
    tags: [],
    location: {
      filePath: "file:///test/router.py",
      line: 1,
      column: 0,
    },
    routes,
    children,
  }
}

suite("TestCodeLensProvider", () => {
  let parser: Parser
  let provider: TestCodeLensProvider

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  setup(() => {
    provider = new TestCodeLensProvider(parser, [])
  })

  suite("constructor", () => {
    test("creates provider with empty apps", () => {
      const p = new TestCodeLensProvider(parser, [])
      assert.ok(p)
    })

    test("creates provider with apps", () => {
      const app = createMockApp([createRoute("GET", "/")])
      const p = new TestCodeLensProvider(parser, [app])
      assert.ok(p)
    })
  })

  suite("setApps", () => {
    test("updates apps and fires change event", () => {
      let eventFired = false
      provider.onDidChangeCodeLenses(() => {
        eventFired = true
      })

      const app = createMockApp([createRoute("GET", "/")])
      provider.setApps([app])

      assert.strictEqual(eventFired, true)
    })
  })

  suite("provideCodeLenses", () => {
    test("returns empty array for non-Python code", async () => {
      const doc = await vscode.workspace.openTextDocument({
        content: "const x = 1",
        language: "javascript",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 0)
    })

    test("returns empty array when no test client calls", async () => {
      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_something():
    x = 1
    y = 2
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 0)
    })

    test("returns empty array when no matching routes", async () => {
      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_endpoint():
    client.get("/users")
`,
        language: "python",
      })
      // No apps set, so no routes to match
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 0)
    })

    test("creates CodeLens for matching route", async () => {
      const app = createMockApp([createRoute("GET", "/users")])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_get_users():
    response = client.get("/users")
    assert response.status_code == 200
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 1)
      assert.ok(lenses[0].command)
      assert.ok(lenses[0].command.title.includes("GET"))
      assert.ok(lenses[0].command.title.includes("/users"))
    })

    test("creates CodeLens for POST route", async () => {
      const app = createMockApp([createRoute("POST", "/items")])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_create_item():
    response = client.post("/items")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 1)
      assert.ok(lenses[0].command?.title.includes("POST"))
    })

    test("creates CodeLens for routes in routers", async () => {
      // Route path in the definition is just the route path, not the full path with prefix
      // The pathMatchesEndpoint function handles matching
      const router = createRouter("/api", [createRoute("GET", "/users")])
      const app = createMockApp([], [router])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_api_users():
    client.get("/users")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 1)
    })

    test("creates CodeLens for routes in nested routers", async () => {
      // Route path in the definition is just the leaf path
      const childRouter = createRouter("/v1", [createRoute("GET", "/items")])
      const parentRouter = createRouter("/api", [], [childRouter])
      const app = createMockApp([], [parentRouter])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_nested():
    client.get("/items")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 1)
    })

    test("creates multiple CodeLenses for multiple calls", async () => {
      const app = createMockApp([
        createRoute("GET", "/users"),
        createRoute("POST", "/users"),
      ])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_users():
    client.get("/users")
    client.post("/users")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 2)
    })

    test("handles path with parameters", async () => {
      const app = createMockApp([createRoute("GET", "/users/{id}")])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_get_user():
    client.get("/users/123")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 1)
    })

    test("handles f-string paths", async () => {
      const app = createMockApp([createRoute("GET", "/users/{id}")])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_get_user():
    user_id = 123
    client.get(f"/users/{user_id}")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      // f-strings with interpolation are detected as dynamic paths and matched
      assert.strictEqual(lenses.length, 1)
    })

    test("ignores plain function calls (not attribute access)", async () => {
      const app = createMockApp([createRoute("GET", "/users")])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_plain():
    get("/users")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 0)
    })

    test("ignores non-HTTP method calls", async () => {
      const app = createMockApp([createRoute("GET", "/users")])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_something():
    client.connect("/users")
    client.custom("/users")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 0)
    })

    test("ignores calls with no arguments", async () => {
      const app = createMockApp([createRoute("GET", "/users")])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_no_args():
    client.get()
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 0)
    })

    test("handles all HTTP methods", async () => {
      const app = createMockApp([
        createRoute("GET", "/resource"),
        createRoute("POST", "/resource"),
        createRoute("PUT", "/resource"),
        createRoute("DELETE", "/resource"),
        createRoute("PATCH", "/resource"),
        createRoute("OPTIONS", "/resource"),
        createRoute("HEAD", "/resource"),
      ])
      provider.setApps([app])

      const doc = await vscode.workspace.openTextDocument({
        content: `
def test_all_methods():
    client.get("/resource")
    client.post("/resource")
    client.put("/resource")
    client.delete("/resource")
    client.patch("/resource")
    client.options("/resource")
    client.head("/resource")
`,
        language: "python",
      })
      const lenses = provider.provideCodeLenses(doc)
      assert.strictEqual(lenses.length, 7)
    })
  })
})
