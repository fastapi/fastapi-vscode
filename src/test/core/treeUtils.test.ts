import * as assert from "node:assert"
import {
  collectRoutes,
  countRouters,
  countRoutesInRouter,
  findRouter,
} from "../../core/treeUtils"
import type {
  AppDefinition,
  RouteDefinition,
  RouterDefinition,
} from "../../core/types"

/** Helper to create a minimal route */
function makeRoute(method: string, path: string): RouteDefinition {
  return {
    method: method as RouteDefinition["method"],
    path,
    functionName: `${method.toLowerCase()}_${path.replace(/\//g, "_")}`,
    location: { filePath: "test.py", line: 1, column: 0 },
  }
}

/** Helper to create a minimal router */
function makeRouter(
  name: string,
  prefix: string,
  routes: RouteDefinition[] = [],
  children: RouterDefinition[] = [],
): RouterDefinition {
  return {
    name,
    prefix,
    tags: [],
    location: { filePath: "test.py", line: 1, column: 0 },
    routes,
    children,
  }
}

/** Helper to create a minimal app */
function makeApp(
  name: string,
  routes: RouteDefinition[] = [],
  routers: RouterDefinition[] = [],
): AppDefinition {
  return {
    name,
    filePath: "test.py",
    workspaceFolder: "/workspace",
    routes,
    routers,
  }
}

suite("treeUtils", () => {
  suite("findRouter", () => {
    test("returns undefined when no apps", () => {
      const result = findRouter([], () => true)
      assert.strictEqual(result, undefined)
    })

    test("returns undefined when predicate never matches", () => {
      const apps = [makeApp("app", [], [makeRouter("r1", "/r1")])]
      const result = findRouter(apps, () => false)
      assert.strictEqual(result, undefined)
    })

    test("finds router at top level", () => {
      const router = makeRouter("target", "/target")
      const apps = [makeApp("app", [], [makeRouter("other", "/other"), router])]

      const result = findRouter(apps, (r) => r.name === "target")
      assert.strictEqual(result, router)
    })

    test("finds nested router", () => {
      const nested = makeRouter("nested", "/parent/nested")
      const apps = [
        makeApp("app", [], [makeRouter("parent", "/parent", [], [nested])]),
      ]

      const result = findRouter(apps, (r) => r.name === "nested")
      assert.strictEqual(result, nested)
    })

    test("finds router across multiple apps", () => {
      const target = makeRouter("target", "/target")
      const apps = [
        makeApp("app1", [], [makeRouter("r1", "/r1")]),
        makeApp("app2", [], [target]),
      ]

      const result = findRouter(apps, (r) => r.name === "target")
      assert.strictEqual(result, target)
    })
  })

  suite("collectRoutes", () => {
    test("returns empty array for empty apps", () => {
      const result = collectRoutes([])
      assert.deepStrictEqual(result, [])
    })

    test("collects direct app routes", () => {
      const route = makeRoute("GET", "/")
      const apps = [makeApp("app", [route])]

      const result = collectRoutes(apps)
      assert.deepStrictEqual(result, [route])
    })

    test("collects routes from routers", () => {
      const directRoute = makeRoute("GET", "/")
      const routerRoute = makeRoute("GET", "/users")
      const apps = [
        makeApp(
          "app",
          [directRoute],
          [makeRouter("users", "/users", [routerRoute])],
        ),
      ]

      const result = collectRoutes(apps)
      assert.deepStrictEqual(result, [directRoute, routerRoute])
    })

    test("collects routes from multiple apps", () => {
      const route1 = makeRoute("GET", "/app1")
      const route2 = makeRoute("GET", "/app2")
      const apps = [makeApp("app1", [route1]), makeApp("app2", [route2])]

      const result = collectRoutes(apps)
      assert.deepStrictEqual(result, [route1, route2])
    })

    test("collects routes from nested routers", () => {
      const childRoute = makeRoute("GET", "/a")
      const parentRoute = makeRoute("GET", "/b")
      const directRoute = makeRoute("GET", "/c")
      const child = makeRouter("child", "/child", [childRoute])
      const parent = makeRouter("parent", "/parent", [parentRoute], [child])
      const apps = [makeApp("app", [directRoute], [parent])]

      const result = collectRoutes(apps)
      assert.strictEqual(result.length, 3)
    })
  })

  suite("countRouters", () => {
    test("returns 0 for empty apps", () => {
      assert.strictEqual(countRouters([]), 0)
    })

    test("counts top-level routers", () => {
      const apps = [
        makeApp("app", [], [makeRouter("r1", "/r1"), makeRouter("r2", "/r2")]),
      ]
      assert.strictEqual(countRouters(apps), 2)
    })

    test("counts nested routers", () => {
      const apps = [
        makeApp(
          "app",
          [],
          [
            makeRouter(
              "parent",
              "/parent",
              [],
              [
                makeRouter("child1", "/parent/child1"),
                makeRouter("child2", "/parent/child2"),
              ],
            ),
          ],
        ),
      ]
      assert.strictEqual(countRouters(apps), 3)
    })

    test("counts routers across multiple apps", () => {
      const apps = [
        makeApp("app1", [], [makeRouter("r1", "/r1")]),
        makeApp("app2", [], [makeRouter("r2", "/r2")]),
      ]
      assert.strictEqual(countRouters(apps), 2)
    })
  })

  suite("countRoutesInRouter", () => {
    test("counts direct routes only", () => {
      const route = makeRoute("GET", "/")
      const router = makeRouter("r", "/r", [route])
      assert.strictEqual(countRoutesInRouter(router), 1)
    })

    test("returns 0 for empty router", () => {
      const router = makeRouter("r", "/r")
      assert.strictEqual(countRoutesInRouter(router), 0)
    })

    test("counts routes in nested routers", () => {
      const child = makeRouter("child", "/r/child", [
        makeRoute("GET", "/a"),
        makeRoute("POST", "/b"),
      ])
      const router = makeRouter("r", "/r", [makeRoute("GET", "/")], [child])
      assert.strictEqual(countRoutesInRouter(router), 3)
    })
  })
})
