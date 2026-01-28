import * as assert from "node:assert"
import {
  collectAllRoutes,
  collectRoutesFromRouters,
  countRouters,
  countRoutes,
  countRoutesInRouter,
  findRouter,
  forEachRoute,
  traverseRouters,
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
  suite("traverseRouters", () => {
    test("returns undefined for empty array", () => {
      const result = traverseRouters([], () => "found")
      assert.strictEqual(result, undefined)
    })

    test("visits all routers when visitor returns undefined", () => {
      const visited: string[] = []
      const routers = [
        makeRouter("r1", "/r1", [], [makeRouter("r1a", "/r1/a")]),
        makeRouter("r2", "/r2"),
      ]

      traverseRouters(routers, (router) => {
        visited.push(router.name)
        return undefined
      })

      assert.deepStrictEqual(visited, ["r1", "r1a", "r2"])
    })

    test("returns early when visitor returns a value", () => {
      const visited: string[] = []
      const routers = [
        makeRouter("r1", "/r1"),
        makeRouter("r2", "/r2"),
        makeRouter("r3", "/r3"),
      ]

      const result = traverseRouters(routers, (router) => {
        visited.push(router.name)
        if (router.name === "r2") return "found r2"
        return undefined
      })

      assert.strictEqual(result, "found r2")
      assert.deepStrictEqual(visited, ["r1", "r2"])
    })

    test("traverses nested children depth-first", () => {
      const visited: string[] = []
      const routers = [
        makeRouter(
          "parent",
          "/parent",
          [],
          [
            makeRouter(
              "child1",
              "/parent/child1",
              [],
              [makeRouter("grandchild", "/parent/child1/grandchild")],
            ),
            makeRouter("child2", "/parent/child2"),
          ],
        ),
      ]

      traverseRouters(routers, (router) => {
        visited.push(router.name)
        return undefined
      })

      assert.deepStrictEqual(visited, [
        "parent",
        "child1",
        "grandchild",
        "child2",
      ])
    })
  })

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

  suite("collectRoutesFromRouters", () => {
    test("returns empty array for empty routers", () => {
      const result = collectRoutesFromRouters([])
      assert.deepStrictEqual(result, [])
    })

    test("collects routes from single router", () => {
      const route = makeRoute("GET", "/test")
      const routers = [makeRouter("r1", "/r1", [route])]

      const result = collectRoutesFromRouters(routers)
      assert.deepStrictEqual(result, [route])
    })

    test("collects routes from nested routers", () => {
      const route1 = makeRoute("GET", "/parent/test")
      const route2 = makeRoute("POST", "/parent/child/test")
      const routers = [
        makeRouter(
          "parent",
          "/parent",
          [route1],
          [makeRouter("child", "/parent/child", [route2])],
        ),
      ]

      const result = collectRoutesFromRouters(routers)
      assert.deepStrictEqual(result, [route1, route2])
    })
  })

  suite("collectAllRoutes", () => {
    test("returns empty array for empty apps", () => {
      const result = collectAllRoutes([])
      assert.deepStrictEqual(result, [])
    })

    test("collects direct app routes", () => {
      const route = makeRoute("GET", "/")
      const apps = [makeApp("app", [route])]

      const result = collectAllRoutes(apps)
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

      const result = collectAllRoutes(apps)
      assert.deepStrictEqual(result, [directRoute, routerRoute])
    })

    test("collects routes from multiple apps", () => {
      const route1 = makeRoute("GET", "/app1")
      const route2 = makeRoute("GET", "/app2")
      const apps = [makeApp("app1", [route1]), makeApp("app2", [route2])]

      const result = collectAllRoutes(apps)
      assert.deepStrictEqual(result, [route1, route2])
    })
  })

  suite("countRoutesInRouter", () => {
    test("returns 0 for router with no routes", () => {
      const router = makeRouter("empty", "/empty")
      assert.strictEqual(countRoutesInRouter(router), 0)
    })

    test("counts direct routes", () => {
      const router = makeRouter("r", "/r", [
        makeRoute("GET", "/r"),
        makeRoute("POST", "/r"),
      ])
      assert.strictEqual(countRoutesInRouter(router), 2)
    })

    test("counts routes in nested children", () => {
      const router = makeRouter(
        "parent",
        "/parent",
        [makeRoute("GET", "/parent")],
        [
          makeRouter("child", "/parent/child", [
            makeRoute("GET", "/parent/child"),
            makeRoute("POST", "/parent/child"),
          ]),
        ],
      )
      assert.strictEqual(countRoutesInRouter(router), 3)
    })
  })

  suite("countRoutes", () => {
    test("returns 0 for empty apps", () => {
      assert.strictEqual(countRoutes([]), 0)
    })

    test("counts direct app routes", () => {
      const apps = [
        makeApp("app", [makeRoute("GET", "/"), makeRoute("POST", "/")]),
      ]
      assert.strictEqual(countRoutes(apps), 2)
    })

    test("counts routes in routers", () => {
      const apps = [
        makeApp(
          "app",
          [makeRoute("GET", "/")],
          [makeRouter("users", "/users", [makeRoute("GET", "/users")])],
        ),
      ]
      assert.strictEqual(countRoutes(apps), 2)
    })

    test("counts routes across multiple apps", () => {
      const apps = [
        makeApp("app1", [makeRoute("GET", "/app1")]),
        makeApp("app2", [makeRoute("GET", "/app2")]),
      ]
      assert.strictEqual(countRoutes(apps), 2)
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

  suite("forEachRoute", () => {
    test("does nothing for empty apps", () => {
      const visited: string[] = []
      forEachRoute([], (route) => visited.push(route.path))
      assert.deepStrictEqual(visited, [])
    })

    test("visits direct app routes", () => {
      const visited: string[] = []
      const apps = [
        makeApp("app", [makeRoute("GET", "/"), makeRoute("POST", "/")]),
      ]

      forEachRoute(apps, (route) =>
        visited.push(`${route.method} ${route.path}`),
      )
      assert.deepStrictEqual(visited, ["GET /", "POST /"])
    })

    test("visits routes in routers", () => {
      const visited: string[] = []
      const apps = [
        makeApp(
          "app",
          [makeRoute("GET", "/")],
          [makeRouter("users", "/users", [makeRoute("GET", "/users")])],
        ),
      ]

      forEachRoute(apps, (route) => visited.push(route.path))
      assert.deepStrictEqual(visited, ["/", "/users"])
    })

    test("visits routes in nested routers", () => {
      const visited: string[] = []
      const apps = [
        makeApp(
          "app",
          [],
          [
            makeRouter(
              "parent",
              "/parent",
              [makeRoute("GET", "/parent")],
              [
                makeRouter("child", "/parent/child", [
                  makeRoute("GET", "/parent/child"),
                ]),
              ],
            ),
          ],
        ),
      ]

      forEachRoute(apps, (route) => visited.push(route.path))
      assert.deepStrictEqual(visited, ["/parent", "/parent/child"])
    })

    test("provides router context when available", () => {
      const results: Array<{ path: string; routerName: string | undefined }> =
        []
      const apps = [
        makeApp(
          "app",
          [makeRoute("GET", "/")],
          [makeRouter("users", "/users", [makeRoute("GET", "/users")])],
        ),
      ]

      forEachRoute(apps, (route, router) =>
        results.push({ path: route.path, routerName: router?.name }),
      )

      assert.deepStrictEqual(results, [
        { path: "/", routerName: undefined },
        { path: "/users", routerName: "users" },
      ])
    })
  })
})
