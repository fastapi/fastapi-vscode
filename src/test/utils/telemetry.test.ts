import * as assert from "node:assert"
import { sanitizeError } from "../../utils/telemetry"

suite("telemetry", () => {
  suite("sanitizeError", () => {
    test("returns file_not_found for ENOENT errors", () => {
      const error = new Error("ENOENT: no such file or directory")
      assert.strictEqual(sanitizeError(error), "file_not_found")
    })

    test("returns wasm_load_error for wasm errors", () => {
      const error = new Error("Failed to load WASM module")
      assert.strictEqual(sanitizeError(error), "wasm_load_error")
    })

    test("returns parse_error for parse errors", () => {
      const error = new Error("Failed to parse Python file")
      assert.strictEqual(sanitizeError(error), "parse_error")
    })

    test("returns timeout_error for timeout errors", () => {
      const error = new Error("Request timeout exceeded")
      assert.strictEqual(sanitizeError(error), "timeout_error")
    })

    test("returns permission_error for permission errors", () => {
      const error = new Error("Permission denied")
      assert.strictEqual(sanitizeError(error), "permission_error")
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

    test("is case insensitive", () => {
      assert.strictEqual(sanitizeError(new Error("WASM")), "wasm_load_error")
      assert.strictEqual(sanitizeError(new Error("Wasm")), "wasm_load_error")
      assert.strictEqual(sanitizeError(new Error("wasm")), "wasm_load_error")
    })
  })
})
