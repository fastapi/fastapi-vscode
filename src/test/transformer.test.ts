import * as assert from "node:assert"
import * as path from "node:path"
import { Parser } from "../core/parser"
import { buildRouterGraph } from "../core/routerResolver"
import { routerNodeToAppDefinition } from "../core/transformer"

// Tests run from dist/test/*.test.js, so we go up to dist, then into wasm
const getWasmPaths = () => {
  const wasmDir = path.join(__dirname, "..", "wasm")
  return {
    core: path.join(wasmDir, "web-tree-sitter.wasm"),
    python: path.join(wasmDir, "tree-sitter-python.wasm"),
  }
}

// Fixtures are in src/test/fixtures/python
const getFixturesPath = () => {
  return path.join(__dirname, "..", "..", "src", "test", "fixtures", "python")
}

suite("transformer", () => {
  let parser: Parser
  let fixturesPath: string

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(getWasmPaths())
    fixturesPath = getFixturesPath()
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("routerNodeToAppDefinition", () => {
    test("transforms router graph to AppDefinition", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      assert.ok(result)
      assert.strictEqual(result.name, "app")
      assert.strictEqual(result.filePath, mainPyPath)
      assert.strictEqual(result.workspaceFolder, "/workspace")
    })

    test("includes direct routes on app", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      // main.py has @app.get("/health")
      const healthRoute = result.routes.find((r) => r.path === "/health")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "GET")
      assert.strictEqual(healthRoute.functionName, "health_check")
    })

    test("flattens nested routers", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      // Should have routers from the include chain
      assert.ok(result.routers.length > 0)
    })

    test("computes full path with prefixes", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      // The users router should have prefix computed from:
      // app -> /api/v1 -> /users = /api/v1/users
      const usersRouter = result.routers.find((r) =>
        r.prefix.includes("/users"),
      )
      if (usersRouter) {
        assert.ok(
          usersRouter.prefix.startsWith("/api/v1"),
          `Expected prefix to start with /api/v1, got ${usersRouter.prefix}`,
        )
      }
    })

    test("normalizes HTTP methods to uppercase", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
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

    test("includes location info for routes", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      for (const route of result.routes) {
        assert.ok(route.location.filePath)
        assert.ok(route.location.line > 0)
        assert.ok(route.location.column >= 0)
      }
    })

    test("includes location info for routers", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
      assert.ok(routerNode)

      const result = routerNodeToAppDefinition(routerNode, "/workspace")

      for (const router of result.routers) {
        assert.ok(router.location.filePath)
        assert.ok(router.location.line > 0)
        assert.ok(router.location.column >= 0)
      }
    })

    test("includes tags from routers", () => {
      const usersPath = path.join(
        fixturesPath,
        "app",
        "api",
        "routes",
        "items.py",
      )
      const routerNode = buildRouterGraph(usersPath, parser, fixturesPath)
      assert.ok(routerNode)

      // items.py has: router = APIRouter(tags=["items"])
      assert.ok(routerNode.tags.includes("items"))
    })

    test("skips routers with no routes or children", () => {
      const mainPyPath = path.join(fixturesPath, "main.py")
      const routerNode = buildRouterGraph(mainPyPath, parser, fixturesPath)
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

    test("merges routers with same prefix from different files", () => {
      // Routers with the same prefix should be merged for cleaner display
      const mockRouterNode = {
        type: "FastAPI" as const,
        variableName: "app",
        prefix: "",
        tags: [],
        routes: [],
        filePath: "/test/main.py",
        line: 1,
        column: 0,
        children: [
          {
            prefix: "/api/v1",
            router: {
              type: "APIRouter" as const,
              variableName: "login_router",
              prefix: "",
              tags: ["login"],
              routes: [
                {
                  method: "post",
                  path: "/login",
                  function: "login",
                  line: 10,
                  column: 0,
                },
              ],
              filePath: "/test/login.py",
              line: 5,
              column: 0,
              children: [],
            },
          },
          {
            prefix: "/api/v1",
            router: {
              type: "APIRouter" as const,
              variableName: "utils_router",
              prefix: "",
              tags: ["utils"],
              routes: [
                {
                  method: "get",
                  path: "/health",
                  function: "health",
                  line: 20,
                  column: 0,
                },
              ],
              filePath: "/test/utils.py",
              line: 5,
              column: 0,
              children: [],
            },
          },
        ],
      }

      const result = routerNodeToAppDefinition(mockRouterNode, "/workspace")

      // Should have 1 merged router with routes from both files
      assert.strictEqual(
        result.routers.length,
        1,
        "Should merge routers with same prefix",
      )

      const mergedRouter = result.routers[0]
      assert.strictEqual(
        mergedRouter.routes.length,
        2,
        "Merged router should have both routes",
      )
      assert.ok(
        mergedRouter.routes.some((r) => r.functionName === "login"),
        "Should have login route",
      )
      assert.ok(
        mergedRouter.routes.some((r) => r.functionName === "health"),
        "Should have health route",
      )
    })
  })
})
