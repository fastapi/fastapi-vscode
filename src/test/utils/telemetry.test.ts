import * as assert from "node:assert"
import type { AppDefinition, RouterDefinition } from "../../core/types"
import {
  countRouters,
  countRoutes,
  createTimer,
  Events,
  flushSessionSummary,
  incrementCodeLensClicked,
  incrementRouteCopied,
  incrementRouteNavigated,
  sanitizeError,
  trackActivation,
  trackActivationFailed,
  trackCodeLensProvided,
  trackDeactivation,
  trackEntrypointDetected,
  trackSearchExecuted,
  trackTreeViewVisible,
} from "../../utils/telemetry"

// Helper to create mock router
function createRouter(
  routeCount: number,
  children: RouterDefinition[] = [],
): RouterDefinition {
  return {
    name: "router",
    prefix: "/api",
    tags: [],
    location: { filePath: "file:///test.py", line: 1, column: 0 },
    routes: Array.from({ length: routeCount }, (_, i) => ({
      method: "GET" as const,
      path: `/route${i}`,
      functionName: `handler${i}`,
      location: { filePath: "file:///test.py", line: i + 1, column: 0 },
    })),
    children,
  }
}

// Helper to create mock app
function createApp(
  directRouteCount: number,
  routers: RouterDefinition[] = [],
): AppDefinition {
  return {
    name: "app",
    filePath: "file:///test/main.py",
    workspaceFolder: "file:///test",
    routes: Array.from({ length: directRouteCount }, (_, i) => ({
      method: "GET" as const,
      path: `/direct${i}`,
      functionName: `directHandler${i}`,
      location: { filePath: "file:///test/main.py", line: i + 1, column: 0 },
    })),
    routers,
  }
}

suite("telemetry", () => {
  suite("sanitizeError", () => {
    test("returns enoent for ENOENT errors", () => {
      const error = Object.assign(
        new Error("ENOENT: no such file or directory"),
        { code: "ENOENT" },
      )
      assert.strictEqual(sanitizeError(error), "enoent")
    })

    test("returns etimedout for timeout errors", () => {
      const error = Object.assign(new Error("Request timeout exceeded"), {
        code: "ETIMEDOUT",
      })
      assert.strictEqual(sanitizeError(error), "etimedout")
    })

    test("returns eacces for permission errors", () => {
      const error = Object.assign(new Error("Permission denied"), {
        code: "EACCES",
      })
      assert.strictEqual(sanitizeError(error), "eacces")
    })

    test("returns eperm for operation not permitted errors", () => {
      const error = Object.assign(new Error("Operation not permitted"), {
        code: "EPERM",
      })
      assert.strictEqual(sanitizeError(error), "eperm")
    })

    test("returns econnrefused for connection errors", () => {
      const error = Object.assign(new Error("Connection refused"), {
        code: "ECONNREFUSED",
      })
      assert.strictEqual(sanitizeError(error), "econnrefused")
    })

    test("returns syntax for SyntaxError", () => {
      const error = new SyntaxError("Unexpected token")
      assert.strictEqual(sanitizeError(error), "syntax")
    })

    test("returns type for TypeError", () => {
      const error = new TypeError("Cannot read property")
      assert.strictEqual(sanitizeError(error), "type")
    })

    test("returns range for RangeError", () => {
      const error = new RangeError("Invalid array length")
      assert.strictEqual(sanitizeError(error), "range")
    })

    test("returns reference for ReferenceError", () => {
      const error = new ReferenceError("x is not defined")
      assert.strictEqual(sanitizeError(error), "reference")
    })

    test("returns unknown_error for other errors", () => {
      const error = new Error("Something unexpected happened")
      assert.strictEqual(sanitizeError(error), "unknown_error")
    })

    test("returns unknown_error for non-Error values", () => {
      assert.strictEqual(sanitizeError("string error"), "unknown_error")
      assert.strictEqual(sanitizeError(null), "unknown_error")
      assert.strictEqual(sanitizeError(undefined), "unknown_error")
      assert.strictEqual(sanitizeError(42), "unknown_error")
    })
  })

  suite("createTimer", () => {
    test("returns elapsed time in milliseconds", async () => {
      const getElapsed = createTimer()
      // Wait a small amount of time
      await new Promise((resolve) => setTimeout(resolve, 10))
      const elapsed = getElapsed()
      assert.ok(elapsed >= 5, `Expected elapsed >= 5, got ${elapsed}`)
      assert.ok(elapsed < 1000, `Expected elapsed < 1000, got ${elapsed}`)
    })

    test("returns integer value", () => {
      const getElapsed = createTimer()
      const elapsed = getElapsed()
      assert.strictEqual(elapsed, Math.round(elapsed))
    })
  })

  suite("Events", () => {
    test("has all expected event names", () => {
      assert.strictEqual(Events.ACTIVATED, "extension_activated")
      assert.strictEqual(
        Events.ACTIVATION_FAILED,
        "extension_activation_failed",
      )
      assert.strictEqual(Events.DEACTIVATED, "extension_deactivated")
      assert.strictEqual(
        Events.ENTRYPOINT_DETECTED,
        "extension_entrypoint_detected",
      )
      assert.strictEqual(
        Events.CODELENS_PROVIDED,
        "extension_codelens_provided",
      )
      assert.strictEqual(Events.CODELENS_CLICKED, "extension_codelens_clicked")
      assert.strictEqual(
        Events.TREE_VIEW_VISIBLE,
        "extension_tree_view_visible",
      )
      assert.strictEqual(Events.SEARCH_EXECUTED, "extension_search_executed")
      assert.strictEqual(Events.ROUTE_NAVIGATED, "extension_route_navigated")
      assert.strictEqual(Events.ROUTE_COPIED, "extension_route_copied")
    })
  })

  suite("countRoutes", () => {
    test("returns 0 for empty apps array", () => {
      assert.strictEqual(countRoutes([]), 0)
    })

    test("counts direct routes on app", () => {
      const app = createApp(3)
      assert.strictEqual(countRoutes([app]), 3)
    })

    test("counts routes in routers", () => {
      const router = createRouter(5)
      const app = createApp(0, [router])
      assert.strictEqual(countRoutes([app]), 5)
    })

    test("counts routes in nested routers", () => {
      const childRouter = createRouter(2)
      const parentRouter = createRouter(3, [childRouter])
      const app = createApp(1, [parentRouter])
      // 1 direct + 3 in parent + 2 in child = 6
      assert.strictEqual(countRoutes([app]), 6)
    })

    test("counts routes across multiple apps", () => {
      const app1 = createApp(2)
      const app2 = createApp(3)
      assert.strictEqual(countRoutes([app1, app2]), 5)
    })
  })

  suite("countRouters", () => {
    test("returns 0 for empty apps array", () => {
      assert.strictEqual(countRouters([]), 0)
    })

    test("returns 0 for app with no routers", () => {
      const app = createApp(5)
      assert.strictEqual(countRouters([app]), 0)
    })

    test("counts routers on app", () => {
      const router1 = createRouter(0)
      const router2 = createRouter(0)
      const app = createApp(0, [router1, router2])
      assert.strictEqual(countRouters([app]), 2)
    })

    test("counts nested routers", () => {
      const childRouter = createRouter(0)
      const parentRouter = createRouter(0, [childRouter])
      const app = createApp(0, [parentRouter])
      // parent + child = 2
      assert.strictEqual(countRouters([app]), 2)
    })

    test("counts deeply nested routers", () => {
      const level3 = createRouter(0)
      const level2 = createRouter(0, [level3])
      const level1 = createRouter(0, [level2])
      const app = createApp(0, [level1])
      assert.strictEqual(countRouters([app]), 3)
    })
  })

  suite("session counters", () => {
    test("incrementRouteNavigated does not throw", () => {
      assert.doesNotThrow(() => {
        incrementRouteNavigated()
      })
    })

    test("incrementRouteCopied does not throw", () => {
      assert.doesNotThrow(() => {
        incrementRouteCopied()
      })
    })

    test("incrementCodeLensClicked does not throw", () => {
      assert.doesNotThrow(() => {
        incrementCodeLensClicked()
      })
    })

    test("flushSessionSummary does not throw", () => {
      // Increment some counters first
      incrementRouteNavigated()
      incrementRouteCopied()
      incrementCodeLensClicked()
      assert.doesNotThrow(() => {
        flushSessionSummary()
      })
    })

    test("flushSessionSummary handles no changes", () => {
      // Flush without any increments should not throw
      assert.doesNotThrow(() => {
        flushSessionSummary()
        flushSessionSummary() // Second flush with no new changes
      })
    })
  })

  suite("tracking functions", () => {
    test("trackActivation does not throw", () => {
      assert.doesNotThrow(() => {
        trackActivation({
          duration_ms: 100,
          success: true,
          routes_count: 10,
          routers_count: 2,
          apps_count: 1,
          workspace_folder_count: 1,
        })
      })
    })

    test("trackActivationFailed does not throw", () => {
      assert.doesNotThrow(() => {
        trackActivationFailed(new Error("Test error"), "parser_init")
        trackActivationFailed(new Error("Test error"), "discovery")
      })
    })

    test("trackEntrypointDetected does not throw", () => {
      assert.doesNotThrow(() => {
        trackEntrypointDetected({
          duration_ms: 50,
          method: "config",
          success: true,
          routes_count: 5,
          routers_count: 1,
        })
      })
    })

    test("trackTreeViewVisible does not throw", () => {
      assert.doesNotThrow(() => {
        trackTreeViewVisible()
      })
    })

    test("trackSearchExecuted does not throw", () => {
      assert.doesNotThrow(() => {
        trackSearchExecuted(10, true)
        trackSearchExecuted(0, false)
      })
    })

    test("trackCodeLensProvided does not throw", () => {
      assert.doesNotThrow(() => {
        trackCodeLensProvided(5, 3)
        trackCodeLensProvided(0, 0) // Edge case: no test calls
      })
    })

    test("trackDeactivation does not throw", () => {
      assert.doesNotThrow(() => {
        trackDeactivation()
      })
    })
  })
})
