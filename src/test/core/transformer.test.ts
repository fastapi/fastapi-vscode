import * as assert from "node:assert"
import type { RouterNode } from "../../core/routerResolver"
import { routerNodeToAppDefinition } from "../../core/transformer"

/** Helper to create a minimal RouterNode */
function makeRouterNode(
  opts: Partial<RouterNode> & { variableName: string },
): RouterNode {
  return {
    filePath: "test.py",
    type: "APIRouter",
    prefix: "",
    tags: [],
    line: 1,
    column: 0,
    routes: [],
    children: [],
    ...opts,
  }
}

function makeAppNode(opts: Partial<RouterNode> = {}): RouterNode {
  return makeRouterNode({
    variableName: "app",
    type: "FastAPI",
    ...opts,
  })
}

suite("transformer", () => {
  suite("routerNodeToAppDefinition", () => {
    test("transforms basic app with direct routes", () => {
      const node = makeAppNode({
        filePath: "main.py",
        routes: [
          {
            method: "get",
            path: "/health",
            function: "health",
            line: 1,
            column: 0,
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      assert.strictEqual(result.name, "app")
      assert.strictEqual(result.filePath, "main.py")
      assert.strictEqual(result.workspaceFolder, "/workspace")
      assert.strictEqual(result.routes.length, 1)
      assert.strictEqual(result.routes[0].method, "GET")
      assert.strictEqual(result.routes[0].path, "/health")
      assert.strictEqual(result.routes[0].functionName, "health")
    })

    test("computes full path with child prefix", () => {
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "users_router",
              prefix: "/users",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "list_users",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "/api",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      assert.strictEqual(result.routers.length, 1)
      assert.strictEqual(result.routers[0].prefix, "/api/users")
      assert.strictEqual(result.routers[0].routes[0].path, "/api/users/")
    })

    test("nests routers with common prefix", () => {
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "users_router",
              prefix: "/users",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "list_users",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "user_detail",
              prefix: "/users/detail",
              routes: [
                {
                  method: "get",
                  path: "/{id}",
                  function: "get_user",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      // /users/detail should be nested under /users
      assert.strictEqual(result.routers.length, 1)
      assert.strictEqual(result.routers[0].prefix, "/users")
      assert.strictEqual(result.routers[0].children.length, 1)
      assert.strictEqual(result.routers[0].children[0].prefix, "/users/detail")
    })

    test("handles router with empty prefix", () => {
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "misc_router",
              prefix: "",
              routes: [
                {
                  method: "get",
                  path: "/ping",
                  function: "ping",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      assert.strictEqual(result.routers.length, 1)
      assert.strictEqual(result.routers[0].routes[0].path, "/ping")
    })

    test("merges routers with duplicate prefix", () => {
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "users_v1",
              prefix: "/users",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "list_users",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "users_v2",
              prefix: "/users",
              routes: [
                {
                  method: "post",
                  path: "/",
                  function: "create_user",
                  line: 2,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      // Both should be merged under one /users router
      assert.strictEqual(result.routers.length, 1)
      assert.strictEqual(result.routers[0].prefix, "/users")
      assert.strictEqual(result.routers[0].routes.length, 2)
    })

    test("nests deeper siblings under existing router with same prefix", () => {
      // /integrations has routes and is processed first (1 segment),
      // then /integrations/neon and /integrations/redis nest under it
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "integrations_router",
              prefix: "/integrations",
              routes: [
                {
                  method: "get",
                  path: "/status",
                  function: "status",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "neon_router",
              prefix: "/integrations/neon",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "neon",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "redis_router",
              prefix: "/integrations/redis",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "redis",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "integrations_extra",
              prefix: "/integrations",
              routes: [
                {
                  method: "post",
                  path: "/hook",
                  function: "hook",
                  line: 2,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      const group = result.routers.find((r) => r.prefix === "/integrations")
      assert.ok(group, "Should have /integrations router")
      // Original routes + merged routes from integrations_extra
      assert.strictEqual(group.routes.length, 2)
      // neon and redis nested as children
      assert.strictEqual(group.children.length, 2)
    })

    test("creates synthetic group for sibling multi-segment routers", () => {
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "neon_router",
              prefix: "/integrations/neon",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "neon",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "redis_router",
              prefix: "/integrations/redis",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "redis",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      // Should create a synthetic /integrations group
      const group = result.routers.find((r) => r.prefix === "/integrations")
      assert.ok(group, "Should create synthetic /integrations group")
      assert.strictEqual(
        group.routes.length,
        0,
        "Synthetic group has no routes",
      )
      assert.strictEqual(
        group.children.length,
        2,
        "Group should have 2 children",
      )
    })

    test("uses tag-matching root router as group parent", () => {
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "integrations_router",
              prefix: "",
              tags: ["integrations"],
              routes: [
                {
                  method: "get",
                  path: "/status",
                  function: "status",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "neon_router",
              prefix: "/integrations/neon",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "neon",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      // The tag-matching router should become the parent
      const group = result.routers.find((r) => r.prefix === "/integrations")
      assert.ok(group, "Should find /integrations router")
      assert.ok(group.routes.length > 0, "Group should have its own routes")
      assert.strictEqual(group.children.length, 1, "Should nest neon under it")
    })

    test("skips empty routers", () => {
      const node = makeAppNode({
        children: [
          {
            router: makeRouterNode({
              variableName: "empty_router",
              prefix: "/empty",
            }),
            prefix: "",
            tags: [],
          },
          {
            router: makeRouterNode({
              variableName: "users_router",
              prefix: "/users",
              routes: [
                {
                  method: "get",
                  path: "/",
                  function: "list_users",
                  line: 1,
                  column: 0,
                },
              ],
            }),
            prefix: "",
            tags: [],
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      assert.strictEqual(result.routers.length, 1)
      assert.strictEqual(result.routers[0].prefix, "/users")
    })

    test("defaults invalid method to GET", () => {
      const node = makeAppNode({
        routes: [
          {
            method: "invalid",
            path: "/",
            function: "handler",
            line: 1,
            column: 0,
          },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      assert.strictEqual(result.routes[0].method, "GET")
    })

    test("includes location info", () => {
      const node = makeAppNode({
        routes: [
          { method: "get", path: "/", function: "root", line: 10, column: 4 },
        ],
      })

      const result = routerNodeToAppDefinition(node, "/workspace")

      assert.strictEqual(result.routes[0].location.line, 10)
      assert.strictEqual(result.routes[0].location.column, 4)
    })
  })
})
