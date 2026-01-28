import * as assert from "node:assert"
import { Parser } from "../core/parser"
import { findProjectRoot } from "../core/pathUtils"
import { buildRouterGraph } from "../core/routerResolver"
import { routerNodeToAppDefinition } from "../core/transformer"
import { collectRoutes } from "../core/treeUtils"
import { fixtures, nodeFileSystem, wasmBinaries } from "./testUtils"

suite("Project Layouts", () => {
  let parser: Parser

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  test("standard: discovers routes from package layout", async () => {
    const projectRoot = await findProjectRoot(
      fixtures.standard.mainPy,
      fixtures.standard.root,
      nodeFileSystem,
    )

    const graph = await buildRouterGraph(
      fixtures.standard.mainPy,
      parser,
      projectRoot,
      nodeFileSystem,
    )
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, fixtures.standard.root)
    const allRoutes = collectRoutes([appDef])

    // Should have: GET /, GET /health, GET /users/, GET /users/{user_id}, POST /users/, GET /items/, GET /items/{item_id}
    assert.strictEqual(
      allRoutes.length,
      7,
      `Expected 7 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /users/"),
      "Should have GET /users/",
    )
    assert.ok(
      paths.some((p) => p === "GET /users/{user_id}"),
      "Should have GET /users/{user_id}",
    )
    assert.ok(
      paths.some((p) => p === "GET /items/"),
      "Should have GET /items/",
    )
  })

  test("flat: discovers routes from flat layout", async () => {
    const projectRoot = await findProjectRoot(
      fixtures.flat.mainPy,
      fixtures.flat.root,
      nodeFileSystem,
    )

    const graph = await buildRouterGraph(
      fixtures.flat.mainPy,
      parser,
      projectRoot,
      nodeFileSystem,
    )
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, fixtures.flat.root)
    const allRoutes = collectRoutes([appDef])

    // Should have: GET /, GET /api/users, GET /api/items
    assert.strictEqual(
      allRoutes.length,
      3,
      `Expected 3 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /api/users"),
      "Should have GET /api/users",
    )
    assert.ok(
      paths.some((p) => p === "GET /api/items"),
      "Should have GET /api/items",
    )
  })

  test("namespace: discovers routes from namespace package (no __init__.py)", async () => {
    const projectRoot = await findProjectRoot(
      fixtures.namespace.mainPy,
      fixtures.namespace.root,
      nodeFileSystem,
    )

    const graph = await buildRouterGraph(
      fixtures.namespace.mainPy,
      parser,
      projectRoot,
      nodeFileSystem,
    )
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, fixtures.namespace.root)
    const allRoutes = collectRoutes([appDef])

    // Should have: GET /, GET /users/, GET /users/{user_id}, GET /items/
    assert.strictEqual(
      allRoutes.length,
      4,
      `Expected 4 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /users/"),
      "Should have GET /users/",
    )
    assert.ok(
      paths.some((p) => p === "GET /items/"),
      "Should have GET /items/",
    )
  })

  test("reexport: discovers routes from __init__.py re-exports", async () => {
    const projectRoot = await findProjectRoot(
      fixtures.reexport.mainPy,
      fixtures.reexport.root,
      nodeFileSystem,
    )

    const graph = await buildRouterGraph(
      fixtures.reexport.mainPy,
      parser,
      projectRoot,
      nodeFileSystem,
    )
    assert.ok(graph, "Should find FastAPI app")

    const appDef = routerNodeToAppDefinition(graph, fixtures.reexport.root)
    const allRoutes = collectRoutes([appDef])

    // Should have: GET /, GET /integrations/github, GET /integrations/slack, POST /integrations/webhook,
    // and nested neon routes: GET /integrations/neon/, POST /integrations/neon/connect
    assert.strictEqual(
      allRoutes.length,
      6,
      `Expected 6 routes, got ${allRoutes.length}`,
    )

    const paths = allRoutes.map((r) => `${r.method} ${r.path}`)
    assert.ok(
      paths.some((p) => p === "GET /"),
      "Should have GET /",
    )
    assert.ok(
      paths.some((p) => p === "GET /integrations/github"),
      "Should have GET /integrations/github",
    )
    assert.ok(
      paths.some((p) => p === "GET /integrations/slack"),
      "Should have GET /integrations/slack",
    )
    assert.ok(
      paths.some((p) => p === "POST /integrations/webhook"),
      "Should have POST /integrations/webhook",
    )
    assert.ok(
      paths.some((p) => p === "GET /integrations/neon/"),
      "Should have GET /integrations/neon/",
    )
    assert.ok(
      paths.some((p) => p === "POST /integrations/neon/connect"),
      "Should have POST /integrations/neon/connect",
    )
  })
})
