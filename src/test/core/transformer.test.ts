import * as assert from "node:assert"
import { Parser } from "../../core/parser"
import { buildRouterGraph } from "../../core/routerResolver"
import { routerNodeToAppDefinition } from "../../core/transformer"
import { fixtures, nodeFileSystem, wasmBinaries } from "../testUtils"

suite("transformer", () => {
  let parser: Parser

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("routerNodeToAppDefinition", () => {
    test("transforms router graph to AppDefinition", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      assert.ok(result)
      assert.strictEqual(result.name, "app")
      assert.strictEqual(result.filePath, fixtures.standard.mainPy)
      assert.strictEqual(result.workspaceFolder, "/workspace")
    })

    test("includes direct routes on app", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      // app/main.py has @app.get("/health")
      const healthRoute = result.routes.find((r) => r.path === "/health")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "GET")
      assert.strictEqual(healthRoute.functionName, "health")
    })

    test("flattens nested routers", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      // Should have routers from the include chain
      assert.ok(result.routers.length > 0)
    })

    test("computes full path with prefixes", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      // The users router should have prefix="/users" from its definition
      const usersRouter = result.routers.find((r) =>
        r.prefix.includes("/users"),
      )
      assert.ok(usersRouter, "Should have users router")
      assert.strictEqual(
        usersRouter.prefix,
        "/users",
        "Users router should have /users prefix",
      )
    })

    test("normalizes HTTP methods to uppercase", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      for (const route of result.routes) {
        assert.strictEqual(
          route.method,
          route.method.toUpperCase(),
          "Method should be uppercase",
        )
      }

      for (const router of result.routers) {
        for (const route of router.routes) {
          assert.strictEqual(
            route.method,
            route.method.toUpperCase(),
            "Method should be uppercase",
          )
        }
      }
    })

    test("includes location info for routes", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      for (const route of result.routes) {
        assert.ok(route.location.filePath)
        assert.ok(route.location.line > 0)
        assert.ok(route.location.column >= 0)
      }
    })

    test("includes location info for routers", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      for (const router of result.routers) {
        assert.ok(router.location.filePath)
        assert.ok(router.location.line > 0)
        assert.ok(router.location.column >= 0)
      }
    })

    test("includes tags from routers", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.usersPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      // users.py has: router = APIRouter(prefix="/users", tags=["users"])
      assert.ok(routerNode.tags.includes("users"))
    })

    test("skips routers with no routes or children", async () => {
      const routerNode = await buildRouterGraph(
        fixtures.standard.mainPy,
        parser,
        fixtures.standard.root,
        nodeFileSystem,
      )
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      // All routers in result should have at least one route OR children
      // (synthetic group routers may have only children)
      const checkRouter = (router: (typeof result.routers)[0]) => {
        assert.ok(
          router.routes.length > 0 || router.children.length > 0,
          `Router ${router.name} should have routes or children`,
        )
        for (const child of router.children) {
          checkRouter(child)
        }
      }
      for (const router of result.routers) {
        checkRouter(router)
      }
    })
  })
})
