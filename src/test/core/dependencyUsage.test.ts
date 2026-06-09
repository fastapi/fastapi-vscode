import * as assert from "node:assert"
import {
  collectUsedNames,
  findUnusedDependencies,
  findUnusedDependenciesByScope,
  type LocatedDependency,
  type ScopedFileData,
} from "../../core/dependencyUsage"

suite("Dependency Usage", () => {
  test("flags definitions whose name is not used", () => {
    const definitions: LocatedDependency[] = [
      {
        fileUri: "file1.py",
        definition: { variableName: "dep1", line: 1, column: 0 },
      },
      {
        fileUri: "file2.py",
        definition: { variableName: "dep2", line: 1, column: 0 },
      },
    ]
    const usedNames = new Set(["dep1"])

    const unused = findUnusedDependencies(definitions, usedNames)

    assert.strictEqual(unused.length, 1)
    assert.strictEqual(unused[0].definition.variableName, "dep2")
  })

  test("does not flag a definition whose name is used", () => {
    const definitions: LocatedDependency[] = [
      {
        fileUri: "file1.py",
        definition: { variableName: "dep1", line: 1, column: 0 },
      },
    ]

    const unused = findUnusedDependencies(definitions, new Set(["dep1"]))

    assert.strictEqual(unused.length, 0)
  })

  test("treats usage as global across files (def in one file, referenced in another)", () => {
    // dep1's self-reference is in file1; a second reference in file2 -> used.
    const definitions: LocatedDependency[] = [
      {
        fileUri: "file1.py",
        definition: { variableName: "dep1", line: 1, column: 0 },
      },
    ]
    const usedNames = collectUsedNames([["dep1"], ["dep1"]])

    const unused = findUnusedDependencies(definitions, usedNames)

    assert.strictEqual(unused.length, 0)
  })

  test("flags a name referenced only once (its own definition)", () => {
    const definitions: LocatedDependency[] = [
      {
        fileUri: "file1.py",
        definition: { variableName: "dep1", line: 1, column: 0 },
      },
    ]
    // dep1 appears only at its definition site -> not used.
    const usedNames = collectUsedNames([["dep1"]])

    const unused = findUnusedDependencies(definitions, usedNames)

    assert.strictEqual(unused.length, 1)
    assert.strictEqual(unused[0].definition.variableName, "dep1")
  })

  test("marks a name used only when referenced more than once", () => {
    const used = collectUsedNames([
      ["dep1", "dep3"],
      ["dep2", "dep1"], // dep1 appears twice across files; dep2/dep3 once each
    ])

    assert.strictEqual(used.size, 1)
    assert.ok(used.has("dep1"))
    assert.ok(!used.has("dep2"))
    assert.ok(!used.has("dep3"))
  })

  suite("findUnusedDependenciesByScope", () => {
    test("flags a dead definition, not a used one (single scope)", () => {
      const files: ScopedFileData[] = [
        {
          fileUri: "a/deps.py",
          scopeKey: "a",
          definitions: [
            { variableName: "Used", line: 1, column: 0 },
            { variableName: "Dead", line: 2, column: 0 },
          ],
          referencedNames: ["Used", "Dead"], // each defined once here
        },
        {
          fileUri: "a/routes.py",
          scopeKey: "a",
          definitions: [],
          referencedNames: ["Used"], // second reference -> Used is used
        },
      ]

      const unused = findUnusedDependenciesByScope(files)

      assert.strictEqual(unused.length, 1)
      assert.strictEqual(unused[0].definition.variableName, "Dead")
      assert.strictEqual(unused[0].fileUri, "a/deps.py")
    })

    test("scopes usage per folder — a same-named symbol in another scope does not mask a dead dep", () => {
      const files: ScopedFileData[] = [
        // Scope "a": SessionDep is defined but never referenced again -> dead.
        {
          fileUri: "a/deps.py",
          scopeKey: "a",
          definitions: [{ variableName: "SessionDep", line: 1, column: 0 }],
          referencedNames: ["SessionDep"],
        },
        // Scope "b": an unrelated SessionDep that IS used. Must not rescue a's.
        {
          fileUri: "b/deps.py",
          scopeKey: "b",
          definitions: [{ variableName: "SessionDep", line: 1, column: 0 }],
          referencedNames: ["SessionDep"],
        },
        {
          fileUri: "b/routes.py",
          scopeKey: "b",
          definitions: [],
          referencedNames: ["SessionDep"],
        },
      ]

      const unused = findUnusedDependenciesByScope(files)

      // Only scope a's SessionDep is unused; scope b's is genuinely used.
      assert.strictEqual(unused.length, 1)
      assert.strictEqual(unused[0].fileUri, "a/deps.py")
    })

    test("returns nothing when there are no definitions", () => {
      const files: ScopedFileData[] = [
        {
          fileUri: "a/x.py",
          scopeKey: "a",
          definitions: [],
          referencedNames: ["foo"],
        },
      ]
      assert.deepStrictEqual(findUnusedDependenciesByScope(files), [])
    })
  })
})
