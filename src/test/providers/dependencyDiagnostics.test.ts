import * as assert from "node:assert"
import { DiagnosticSeverity, DiagnosticTag, languages, Uri } from "vscode"
import type { LocatedDependency } from "../../core/dependencyUsage"
import { publishUnusedDependencyDiagnostics } from "../../vscode/dependencyDiagnostics"

suite("dependencyDiagnostics", () => {
  const dep = (
    fileUri: string,
    variableName: string,
    line: number,
    column = 0,
  ): LocatedDependency => ({
    fileUri,
    definition: { variableName, line, column },
  })

  test("maps a definition to an Information diagnostic with the Unnecessary tag", () => {
    const collection = languages.createDiagnosticCollection("test-deps-1")
    try {
      publishUnusedDependencyDiagnostics(collection, [
        dep("file:///proj/deps.py", "CurrentUser", 5, 0),
      ])

      const diags = collection.get(Uri.parse("file:///proj/deps.py"))
      assert.ok(diags, "expected diagnostics for the file")
      assert.strictEqual(diags.length, 1)

      const d = diags[0]
      assert.strictEqual(d.severity, DiagnosticSeverity.Information)
      assert.deepStrictEqual(d.tags, [DiagnosticTag.Unnecessary])
      assert.strictEqual(d.source, "FastAPI")
      assert.ok(d.message.includes("CurrentUser"))
      assert.ok(d.message.includes("referenced"))
    } finally {
      collection.dispose()
    }
  })

  test("converts the 1-based line to a 0-based range spanning the name", () => {
    const collection = languages.createDiagnosticCollection("test-deps-2")
    try {
      publishUnusedDependencyDiagnostics(collection, [
        dep("file:///proj/deps.py", "DbSession", 5, 2),
      ])
      const d = collection.get(Uri.parse("file:///proj/deps.py"))?.[0]
      assert.ok(d)
      assert.strictEqual(d.range.start.line, 4) // 5 - 1
      assert.strictEqual(d.range.start.character, 2)
      assert.strictEqual(d.range.end.line, 4)
      assert.strictEqual(d.range.end.character, 2 + "DbSession".length)
    } finally {
      collection.dispose()
    }
  })

  test("groups multiple unused definitions by file", () => {
    const collection = languages.createDiagnosticCollection("test-deps-3")
    try {
      publishUnusedDependencyDiagnostics(collection, [
        dep("file:///proj/a.py", "X", 1),
        dep("file:///proj/a.py", "Y", 2),
        dep("file:///proj/b.py", "Z", 1),
      ])
      assert.strictEqual(
        collection.get(Uri.parse("file:///proj/a.py"))?.length,
        2,
      )
      assert.strictEqual(
        collection.get(Uri.parse("file:///proj/b.py"))?.length,
        1,
      )
    } finally {
      collection.dispose()
    }
  })

  test("replaces prior diagnostics on each publish", () => {
    const collection = languages.createDiagnosticCollection("test-deps-4")
    try {
      publishUnusedDependencyDiagnostics(collection, [
        dep("file:///proj/a.py", "X", 1),
      ])
      // A later run finds nothing unused — the stale diagnostic must clear.
      publishUnusedDependencyDiagnostics(collection, [])
      assert.strictEqual(
        collection.get(Uri.parse("file:///proj/a.py"))?.length ?? 0,
        0,
      )
    } finally {
      collection.dispose()
    }
  })
})
