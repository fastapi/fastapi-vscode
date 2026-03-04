import * as assert from "node:assert"
import { Parser } from "../../core/parser"
import { findProjectRoot } from "../../core/pathUtils"
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
      const result = await buildRouterGraph(
        fixtures.reexport.initPy,
        parser,
        fixtures.reexport.root,
        nodeFileSystem,
      )

      assert.ok(result, "Should find router via re-export")
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.variableName, "router")

      assert.ok(
        result.filePath.endsWith("router.py"),
        `Expected filePath to end with router.py, got ${result.filePath}`,
      )

      assert.ok(result.routes.length >= 3, "Should have routes from router.py")
      const githubRoute = result.routes.find((r) => r.path === "/github")
      assert.ok(githubRoute, "Should find github route")

      assert.strictEqual(
        result.children.length,
        1,
        "Should have one nested router (neon)",
      )
      const neonChild = result.children[0]
      assert.strictEqual(neonChild.router.prefix, "/neon")
      assert.ok(
        neonChild.router.routes.length >= 2,
        "neon router should have routes",
      )
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

    test("resolves aliased import (from .tokens import router as tokens_router)", async () => {
      const result = await buildRouterGraph(
        fixtures.aliasedImport.mainPy,
        parser,
        fixtures.aliasedImport.root,
        nodeFileSystem,
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

    test("discovers nested routers (router.include_router)", async () => {
      const result = await buildRouterGraph(
        fixtures.nestedRouter.mainPy,
        parser,
        fixtures.nestedRouter.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")

      // App includes apps_router with /api prefix
      assert.strictEqual(
        result.children.length,
        1,
        "Should have one child router (apps)",
      )

      const appsChild = result.children[0]
      assert.strictEqual(appsChild.prefix, "/api")
      assert.strictEqual(appsChild.router.prefix, "/apps")
      assert.strictEqual(appsChild.router.variableName, "router")

      // Apps router should have its direct routes
      const appsRoutes = appsChild.router.routes.map((r) => r.path)
      assert.ok(appsRoutes.includes("/"), "apps router should have / route")
      assert.ok(
        appsRoutes.includes("/{app_id}"),
        "apps router should have /{app_id} route",
      )

      // Apps router includes tokens_router and settings_router (nested)
      assert.strictEqual(
        appsChild.router.children.length,
        2,
        "apps router should have 2 nested routers",
      )

      const childPrefixes = appsChild.router.children.map(
        (c) => c.router.prefix,
      )
      assert.ok(
        childPrefixes.includes("/{app_id}/tokens"),
        "Should have tokens router",
      )
      assert.ok(
        childPrefixes.includes("/{app_id}/settings"),
        "Should have settings router",
      )

      // Verify nested routers have their routes
      const tokensChild = appsChild.router.children.find(
        (c) => c.router.prefix === "/{app_id}/tokens",
      )
      assert.ok(tokensChild)
      assert.ok(
        tokensChild.router.routes.length >= 2,
        "tokens router should have routes",
      )
      // Verify tag merging from include_router(tokens_router, tags=["tokens"])
      assert.ok(
        tokensChild.router.tags.includes("tokens"),
        "tokens router should have merged tags from include_router call",
      )

      const settingsChild = appsChild.router.children.find(
        (c) => c.router.prefix === "/{app_id}/settings",
      )
      assert.ok(settingsChild)
      assert.ok(
        settingsChild.router.routes.length >= 2,
        "settings router should have routes",
      )
    })

    test("follows mount() calls to subapps", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.rootMainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")

      // root main.py mounts sub_app at /v1
      const mountChild = result.children.find((c) => c.prefix === "/v1")
      assert.ok(mountChild, "Should have child mounted at /v1")
      assert.strictEqual(mountChild.router.type, "FastAPI")
    })

    test("merges tags from include_router call with router tags", async () => {
      const result = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )

      assert.ok(result)
      const usersChild = result.children.find(
        (c) => c.router.prefix === "/users",
      )
      assert.ok(usersChild, "Should have users router")
      // Router has tags=["users"], include_router adds tags=["user-management"]
      assert.ok(
        usersChild.router.tags.includes("users"),
        "Should keep router's own tags",
      )
      assert.ok(
        usersChild.router.tags.includes("user-management"),
        "Should include tags from include_router call",
      )
    })

    test("handles circular and unresolvable imports gracefully", async () => {
      const result = await buildRouterGraph(
        fixtures.errorCases.mainPy,
        parser,
        fixtures.errorCases.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      // Should still have the direct route
      const rootRoute = result.routes.find((r) => r.path === "/")
      assert.ok(rootRoute)
      // Circular import resolves, unresolvable is skipped
      assert.strictEqual(result.routes.length, 1)
    })

    test("discovers nested routers via __init__.py re-export", async () => {
      // This tests the pattern: main.py imports from integrations (package),
      // integrations/__init__.py re-exports router from router.py,
      // router.py has include_router calls for nested routers
      const result = await buildRouterGraph(
        fixtures.reexport.mainPy,
        parser,
        fixtures.reexport.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")

      assert.strictEqual(
        result.children.length,
        1,
        "Should have one child router (integrations)",
      )

      const integrationsChild = result.children[0]
      assert.strictEqual(integrationsChild.router.prefix, "/integrations")

      assert.strictEqual(
        integrationsChild.router.children.length,
        1,
        "integrations router should have nested neon router",
      )

      const neonChild = integrationsChild.router.children[0]
      assert.strictEqual(neonChild.router.prefix, "/neon")
      assert.ok(
        neonChild.router.routes.length >= 2,
        "neon router should have routes",
      )
    })

    test("resolves imports in a monorepo with pyproject.toml in a subdirectory", async () => {
      const projectRoot = await findProjectRoot(
        fixtures.monorepo.mainPy,
        fixtures.monorepo.workspaceRoot,
        nodeFileSystem,
      )
      const result = await buildRouterGraph(
        fixtures.monorepo.mainPy,
        parser,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.children.length, 1)
      assert.strictEqual(result.children[0].router.prefix, "/users")
      assert.ok(result.children[0].router.routes.length >= 2)
    })

    test("infers FastAPI app when assigned via factory function (app = get_fastapi_app())", async () => {
      const result = await buildRouterGraph(
        fixtures.factoryFunc.mainPy,
        parser,
        fixtures.factoryFunc.root,
        nodeFileSystem,
        "app",
      )

      assert.ok(
        result,
        "Should find app even when assigned via factory function",
      )
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.routes.length, 2)
      const paths = result.routes.map((r) => r.path)
      assert.ok(paths.includes("/1"))
      assert.ok(paths.includes("/2"))
    })

    test("returns null without targetVariable when app is a factory function", async () => {
      const result = await buildRouterGraph(
        fixtures.factoryFunc.mainPy,
        parser,
        fixtures.factoryFunc.root,
        nodeFileSystem,
      )

      assert.strictEqual(result, null)
    })

    test("resolves custom APIRouter subclass as child router", async () => {
      const result = await buildRouterGraph(
        fixtures.customSubclass.mainPy,
        parser,
        fixtures.customSubclass.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")

      assert.strictEqual(
        result.children.length,
        1,
        "Should have one child router",
      )

      const adminRouter = result.children[0].router
      assert.strictEqual(adminRouter.type, "APIRouter")
      assert.strictEqual(adminRouter.prefix, "/admin")
      assert.strictEqual(adminRouter.routes.length, 2)

      const paths = adminRouter.routes.map((r) => r.path)
      assert.ok(paths.includes("/users"))

      const methods = adminRouter.routes.map((r) => r.method.toLowerCase())
      assert.ok(methods.includes("get"))
      assert.ok(methods.includes("post"))
    })

    test("resolves aliased FastAPI and APIRouter class imports", async () => {
      const result = await buildRouterGraph(
        fixtures.aliasedClass.mainPy,
        parser,
        fixtures.aliasedClass.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")

      assert.strictEqual(
        result.children.length,
        1,
        "Should have one child router",
      )

      const usersRouter = result.children[0].router
      assert.strictEqual(usersRouter.type, "APIRouter")
      assert.strictEqual(usersRouter.prefix, "/users")
      assert.strictEqual(usersRouter.routes.length, 2)
    })

    test("resolves module-aliased fastapi import (import fastapi as f)", async () => {
      const result = await buildRouterGraph(
        fixtures.aliasedModule.mainPy,
        parser,
        fixtures.aliasedModule.root,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.variableName, "app")

      assert.strictEqual(result.children.length, 1)

      const usersRouter = result.children[0].router
      assert.strictEqual(usersRouter.type, "APIRouter")
      assert.strictEqual(usersRouter.prefix, "/users")
      assert.strictEqual(usersRouter.routes.length, 2)
    })
  })
})
