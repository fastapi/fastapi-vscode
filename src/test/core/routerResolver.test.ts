import * as assert from "node:assert"
import { Parser } from "../../core/parser"
import { buildRouterGraph } from "../../core/routerResolver"
import {
  fixtures,
  fixturesPath,
  nodeFileSystem,
  wasmBinaries,
} from "../testUtils"

suite("routerResolver", () => {
  let parser: Parser

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("buildRouterGraph", () => {
    test("builds graph from main.py entry point", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.filePath, fixtures.standard.mainPy)
    })

    test("includes direct routes on app", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      // app/main.py has @app.get("/health")
      const healthRoute = result.routes.find((r) => r.path === "/health")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "get")
      assert.strictEqual(healthRoute.function, "health")
    })

    test("follows include_router to child routers", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      // app/main.py includes users and items routers
      assert.ok(
        result.children.length >= 2,
        "Should have at least 2 child routers",
      )
    })

    test("captures prefix from router definition", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      // users.router has prefix="/users" in its definition
      const usersChild = result.children.find(
        (c) => c.router.prefix === "/users",
      )
      assert.ok(usersChild, "Should have child with /users prefix")
    })

    test("returns null for non-existent file", async () => {
      const result = await buildRouterGraph(
        "file:///nonexistent/file.py",
        parser,
        `file://${fixturesPath}`,
        nodeFileSystem,
      )
      assert.strictEqual(result, null)
    })

    test("returns null for file without FastAPI/APIRouter", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.initPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      // __init__.py has no FastAPI or APIRouter
      assert.strictEqual(result, null)
    })

    test("builds graph from APIRouter file", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.usersPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.variableName, "router")

      // Should have routes (users.py has 3 routes: list, get, create)
      assert.ok(result.routes.length >= 3)
    })

    test("includes line numbers for routes", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.usersPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      for (const route of result.routes) {
        assert.ok(route.line > 0, "Route should have valid line number")
        assert.ok(route.column >= 0, "Route should have valid column number")
      }
    })

    test("includes router location info", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.usersPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.filePath, fixtures.standard.usersPy)
      assert.ok(result.line > 0)
      assert.ok(result.column >= 0)
    })

    test("follows __init__.py re-exports to actual router file", async () => {
      // Use reexport fixture which has integrations/__init__.py re-exporting from router.py
      const result = await buildRouterGraph(
        fixtures.reexport.initPy,
        parser,
        fixtures.reexport.root,
        nodeFileSystem,
      )

      assert.ok(result, "Should find router via re-export")
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.variableName, "router")

      // Should point to router.py, not __init__.py
      assert.ok(
        result.filePath.endsWith("router.py"),
        `Expected filePath to end with router.py, got ${result.filePath}`,
      )

      // Should have the routes defined in router.py (3 routes: github, slack, webhook)
      assert.ok(result.routes.length >= 3, "Should have routes from router.py")
      const githubRoute = result.routes.find((r) => r.path === "/github")
      assert.ok(githubRoute, "Should find github route")
    })

    test("includes router when following include_router chain", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)

      // app/main.py includes users.router and items.router
      assert.ok(result.children.length >= 2, "Should have child routers")

      // Find the users router child
      const usersChild = result.children.find(
        (c) => c.router.prefix === "/users",
      )
      assert.ok(usersChild, "Should have users router child")

      // users router should have routes
      assert.ok(
        usersChild.router.routes.length >= 3,
        "users router should have routes",
      )
    })

    test("prioritizes FastAPI over APIRouter in same file", async () => {
      const result = await buildRouterGraph(
        fixtures.sameFile.mainPy,
        parser,
        fixtures.sameFile.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")
    })

    test("assigns routes to correct owner in same file", async () => {
      const result = await buildRouterGraph(
        fixtures.sameFile.mainPy,
        parser,
        fixtures.sameFile.root,
        nodeFileSystem,
      )

      assert.ok(result)

      // App routes should only include @app.xxx routes
      const appRoutePaths = result.routes.map((r) => r.path)
      assert.ok(
        !appRoutePaths.includes("/items"),
        "App should not have /items route (belongs to router)",
      )
    })

    test("resolves local router as child in same file", async () => {
      const result = await buildRouterGraph(
        fixtures.sameFile.mainPy,
        parser,
        fixtures.sameFile.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(
        result.children.length,
        1,
        "Should have one child router",
      )

      const apiRouter = result.children[0]
      assert.strictEqual(apiRouter.router.type, "APIRouter")
      assert.strictEqual(apiRouter.router.prefix, "/api")

      // Router should have its own routes
      const routerRoutePaths = apiRouter.router.routes.map((r) => r.path)
      assert.ok(
        routerRoutePaths.includes("/items"),
        "Router should have /items route",
      )
    })

    test("selects specific app by targetVariable", async () => {
      // Without targetVariable, should pick first FastAPI app (public_app)
      const defaultResult = await buildRouterGraph(
        fixtures.multiApp.mainPy,
        parser,
        fixtures.multiApp.root,
        nodeFileSystem,
      )

      assert.ok(defaultResult)
      assert.strictEqual(defaultResult.variableName, "public_app")

      // With targetVariable, should select admin_app
      const adminResult = await buildRouterGraph(
        fixtures.multiApp.mainPy,
        parser,
        fixtures.multiApp.root,
        nodeFileSystem,
        "admin_app",
      )

      assert.ok(adminResult)
      assert.strictEqual(adminResult.variableName, "admin_app")
      assert.strictEqual(adminResult.type, "FastAPI")

      // admin_app has 3 routes: /, /users, /users/{user_id}
      assert.strictEqual(adminResult.routes.length, 3)
      const routePaths = adminResult.routes.map((r) => r.path)
      assert.ok(routePaths.includes("/"))
      assert.ok(routePaths.includes("/users"))
      assert.ok(routePaths.includes("/users/{user_id}"))
    })

    test("returns null for non-existent targetVariable", async () => {
      const result = await buildRouterGraph(
        fixtures.multiApp.mainPy,
        parser,
        fixtures.multiApp.root,
        nodeFileSystem,
        "nonexistent_app",
      )

      assert.strictEqual(result, null)
    })

    test("resolves aliased import (from .tokens import router as tokens_router)", () => {
      const result = buildRouterGraph(
        fixtures.aliasedImport.mainPy,
        parser,
        fixtures.aliasedImport.root,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")

      assert.strictEqual(
        result.children.length,
        1,
        "Should have one child router",
      )

      const tokensRouter = result.children[0]
      assert.strictEqual(tokensRouter.router.type, "APIRouter")
      assert.strictEqual(tokensRouter.router.prefix, "/tokens")

      assert.ok(
        tokensRouter.router.routes.length >= 3,
        `Expected at least 3 routes, got ${tokensRouter.router.routes.length}`,
      )

      assert.ok(
        tokensRouter.router.filePath.endsWith("tokens.py"),
        `Expected filePath to end with tokens.py, got ${tokensRouter.router.filePath}`,
      )
    })
  })
})
