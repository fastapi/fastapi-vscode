import * as assert from "node:assert"
import type {
  AppDefinition,
  RouteDefinition,
  RouterDefinition,
} from "../../core/types"
import {
  EndpointTreeProvider,
  getAppLabel,
  getRouteLabel,
  getRouterLabel,
} from "../../providers/endpointTreeProvider"
import { mockApps } from "../fixtures/mockEndpointData"

function makeRoute(method: string, path: string): RouteDefinition {
  return {
    method: method as RouteDefinition["method"],
    path,
    functionName: `${method.toLowerCase()}_handler`,
    location: { filePath: "test.py", line: 1, column: 0 },
  }
}

function makeRouter(
  prefix: string,
  opts: { tags?: string[]; filePath?: string } = {},
): RouterDefinition {
  return {
    name: "router",
    prefix,
    tags: opts.tags ?? [],
    location: { filePath: opts.filePath ?? "test.py", line: 1, column: 0 },
    routes: [],
    children: [],
  }
}

function makeApp(name: string, filePath: string): AppDefinition {
  return {
    name,
    filePath,
    workspaceFolder: "/workspace",
    routes: [],
    routers: [],
  }
}

suite("getAppLabel", () => {
  test("uses app name when not generic", () => {
    assert.strictEqual(
      getAppLabel(makeApp("myapi", "backend/main.py")),
      "myapi",
    )
  })

  test("uses parent dir when name is 'app'", () => {
    assert.strictEqual(
      getAppLabel(makeApp("app", "backend/main.py")),
      "backend",
    )
  })

  test("skips 'src' parent dir", () => {
    assert.strictEqual(
      getAppLabel(makeApp("app", "project/src/main.py")),
      "project/src",
    )
  })

  test("skips 'app' parent dir", () => {
    assert.strictEqual(
      getAppLabel(makeApp("app", "project/app/main.py")),
      "project/app",
    )
  })

  test("falls back to filename when no parent dirs", () => {
    assert.strictEqual(getAppLabel(makeApp("app", "main.py")), "main")
  })
})

suite("getRouterLabel", () => {
  test("uses prefix as label", () => {
    assert.strictEqual(getRouterLabel(makeRouter("/users"), "/"), "/users")
  })

  test("shows relative path under parent", () => {
    assert.strictEqual(
      getRouterLabel(makeRouter("/api/users"), "/api"),
      "/users",
    )
  })

  test("falls back to tag when prefix is /", () => {
    assert.strictEqual(
      getRouterLabel(makeRouter("/", { tags: ["users"] }), "/"),
      "/users",
    )
  })

  test("falls back to filename when no prefix or tag", () => {
    assert.strictEqual(
      getRouterLabel(makeRouter("/", { filePath: "src/users.py" }), "/"),
      "users",
    )
  })

  test("uses parent dir for generic filenames", () => {
    assert.strictEqual(
      getRouterLabel(makeRouter("/", { filePath: "src/users/router.py" }), "/"),
      "users",
    )
  })

  test("uses parent dir for 'routes.py'", () => {
    assert.strictEqual(
      getRouterLabel(makeRouter("/", { filePath: "src/items/routes.py" }), "/"),
      "items",
    )
  })
})

suite("getRouteLabel", () => {
  test("includes method and path", () => {
    assert.strictEqual(getRouteLabel(makeRoute("GET", "/users")), "GET /users")
  })

  test("websocket omits method", () => {
    assert.strictEqual(getRouteLabel(makeRoute("WEBSOCKET", "/ws")), "/ws")
  })
})

suite("EndpointTreeProvider", () => {
  let provider: EndpointTreeProvider

  setup(() => {
    provider = new EndpointTreeProvider(mockApps)
  })

  test("getChildren returns apps at root level", () => {
    const roots = provider.getChildren()
    assert.ok(roots.length > 0, "Should have at least one app")
    assert.strictEqual(roots[0].type, "app")
  })

  test("getChildren returns routers and/or routes for app", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    assert.strictEqual(app.type, "app")

    const children = provider.getChildren(app)
    const routers = children.filter((c) => c.type === "router")
    const routes = children.filter((c) => c.type === "route")

    // App should have at least one router or route
    assert.ok(
      routers.length > 0 || routes.length > 0,
      "App should have routers or routes",
    )
  })

  test("getChildren returns routes for router", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const router = children.find((c) => c.type === "router")

    assert.ok(router, "Should find a router")
    if (router?.type === "router") {
      const routes = provider.getChildren(router)
      assert.ok(routes.length > 0, "Router should have routes")
      assert.ok(
        routes.every((r) => r.type === "route"),
        "All children should be routes",
      )
    }
  })

  test("getChildren returns empty array for route", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const route = children.find((c) => c.type === "route")

    assert.ok(route, "Should find a route")
    if (route) {
      const routeChildren = provider.getChildren(route)
      assert.strictEqual(
        routeChildren.length,
        0,
        "Routes should have no children",
      )
    }
  })

  test("getTreeItem returns correct label for app", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const treeItem = provider.getTreeItem(app)

    assert.ok(treeItem.label, "App should have a label")
  })

  test("getTreeItem returns correct label for route", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const route = children.find((c) => c.type === "route")

    assert.ok(route, "Should find a route")
    if (route?.type === "route") {
      const treeItem = provider.getTreeItem(route)
      const label = treeItem.label as string
      assert.ok(
        label.includes(route.route.method),
        "Label should include method",
      )
      assert.ok(label.includes(route.route.path), "Label should include path")
    }
  })

  test("getTreeItem sets contextValue for route", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const route = children.find((c) => c.type === "route")

    assert.ok(route, "Should find a route")
    if (route) {
      const treeItem = provider.getTreeItem(route)
      assert.strictEqual(treeItem.contextValue, "route")
    }
  })

  test("getTreeItem sets contextValue for router", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const router = children.find((c) => c.type === "router")

    assert.ok(router, "Should find a router")
    if (router) {
      const treeItem = provider.getTreeItem(router)
      assert.strictEqual(treeItem.contextValue, "router")
    }
  })

  test("getTreeItem sets description with route count for router", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const router = children.find((c) => c.type === "router")

    assert.ok(router, "Should find a router")
    if (router?.type === "router") {
      const treeItem = provider.getTreeItem(router)
      assert.ok(
        treeItem.description?.toString().includes("routes"),
        "Description should mention routes",
      )
    }
  })

  test("getTreeItem sets command for route", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const route = children.find((c) => c.type === "route")

    assert.ok(route, "Should find a route")
    if (route) {
      const treeItem = provider.getTreeItem(route)
      assert.ok(treeItem.command, "Route should have a command")
      assert.strictEqual(
        treeItem.command?.command,
        "fastapi-vscode.goToEndpoint",
      )
    }
  })

  test("route tooltip includes file location", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const children = provider.getChildren(app)
    const route = children.find((c) => c.type === "route")

    assert.ok(route, "Should find a route")
    if (route?.type === "route") {
      const treeItem = provider.getTreeItem(route)
      assert.ok(treeItem.tooltip, "Route should have a tooltip")
      // MarkdownString has a .value property with the raw content
      const tooltipValue =
        typeof treeItem.tooltip === "string"
          ? treeItem.tooltip
          : (treeItem.tooltip as { value: string }).value
      assert.ok(
        tooltipValue.includes("File:"),
        "Tooltip should include file info",
      )
      assert.ok(
        tooltipValue.includes(route.route.location.filePath),
        "Tooltip should include file path",
      )
    }
  })

  test("getChildren returns message when no apps", () => {
    const emptyProvider = new EndpointTreeProvider([])
    const roots = emptyProvider.getChildren()
    assert.strictEqual(roots.length, 1, "Should return one message item")
    assert.strictEqual(roots[0].type, "message")
    if (roots[0].type === "message") {
      assert.strictEqual(roots[0].text, "No FastAPI app found")
    }
  })

  test("getTreeItem sets contextValue for app", () => {
    const roots = provider.getChildren()
    const app = roots[0]
    const treeItem = provider.getTreeItem(app)
    assert.strictEqual(treeItem.contextValue, "app")
  })
})
