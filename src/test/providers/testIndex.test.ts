import * as assert from "node:assert"
import { shouldIgnoreTestIndexFile } from "../../vscode/testIndex"

suite("shouldIgnoreTestIndexFile", () => {
  const ignored = [
    "file:///project/.venv/lib/python3.13/site-packages/pandas/tests/test_frame.py",
    "file:///project/venv/lib/python3.12/site-packages/sympy/core/tests/test_expr.py",
    "file:///project/src/__pycache__/test_cached.py",
    "file:///project/node_modules/pkg/test_index.py",
    "file:///project/.git/hooks/test_hook.py",
    "file:///project/.mypy_cache/test_stale.py",
    "file:///project/.pytest_cache/test_lastfailed.py",
  ]
  for (const uri of ignored) {
    test(`ignores ${uri}`, () => {
      assert.strictEqual(shouldIgnoreTestIndexFile(uri), true)
    })
  }

  const kept = [
    "file:///project/tests/test_app.py",
    "file:///project/test/test_routes.py",
    "file:///project/src/app/test_main.py",
    "file:///project/test_smoke.py",
  ]
  for (const uri of kept) {
    test(`keeps ${uri}`, () => {
      assert.strictEqual(shouldIgnoreTestIndexFile(uri), false)
    })
  }

  test("does not match folder names as substrings of other segments", () => {
    // a folder literally named "myvenv" or "venvtools" should not be excluded
    assert.strictEqual(
      shouldIgnoreTestIndexFile("file:///project/myvenv/test_x.py"),
      false,
    )
    assert.strictEqual(
      shouldIgnoreTestIndexFile("file:///project/venvtools/test_x.py"),
      false,
    )
  })
})
