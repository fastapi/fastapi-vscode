import * as assert from "node:assert"
import { createTimer, Events, sanitizeError } from "../../utils/telemetry"

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
})
