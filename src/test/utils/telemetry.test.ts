import * as assert from "node:assert"
import { sanitizeError } from "../../utils/telemetry"

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
})
