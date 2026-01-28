import * as assert from "node:assert"
import {
  createTimer,
  flushSessionSummary,
  incrementCodeLensClicked,
  incrementRouteCopied,
  incrementRouteNavigated,
  sanitizeError,
} from "../../utils/telemetry/events"

suite("telemetry/events", () => {
  suite("sanitizeError", () => {
    test("returns unknown_error for non-Error values", () => {
      assert.strictEqual(sanitizeError("string error"), "unknown_error")
      assert.strictEqual(sanitizeError(42), "unknown_error")
      assert.strictEqual(sanitizeError(null), "unknown_error")
      assert.strictEqual(sanitizeError(undefined), "unknown_error")
    })

    test("returns lowercase code for Node.js errors", () => {
      const error = new Error("file not found") as NodeJS.ErrnoException
      error.code = "ENOENT"
      assert.strictEqual(sanitizeError(error), "enoent")
    })

    test("returns snake_case for typed errors", () => {
      assert.strictEqual(sanitizeError(new TypeError("bad")), "type")
      assert.strictEqual(sanitizeError(new RangeError("out")), "range")
      assert.strictEqual(sanitizeError(new SyntaxError("bad")), "syntax")
    })

    test("returns unknown_error for plain Error", () => {
      assert.strictEqual(sanitizeError(new Error("generic")), "unknown_error")
    })
  })

  suite("createTimer", () => {
    test("returns elapsed milliseconds", () => {
      const elapsed = createTimer()
      const ms = elapsed()
      assert.strictEqual(typeof ms, "number")
      assert.ok(ms >= 0)
    })
  })

  suite("session counters", () => {
    test("increment functions do not throw", () => {
      incrementRouteNavigated()
      incrementRouteCopied()
      incrementCodeLensClicked()
    })

    test("flushSessionSummary does not throw when counters have values", () => {
      incrementRouteNavigated()
      incrementRouteCopied()
      incrementCodeLensClicked()
      // Client is not initialized, so capture is a no-op, but flush should not throw
      assert.doesNotThrow(() => flushSessionSummary())
    })

    test("flushSessionSummary is idempotent when no new increments", () => {
      // Second flush with no new increments should also be fine
      assert.doesNotThrow(() => flushSessionSummary())
    })
  })
})
