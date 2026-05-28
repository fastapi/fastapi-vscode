import * as assert from "node:assert"
import {
  collectUsedDependencies,
  findUnusedDependencies,
  type LocatedDependency,
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

  test("treats usage as global across files (def in one file, used in another)", () => {
    // dep1 is defined in file1 but only imported in file2 -> still considered used
    const definitions: LocatedDependency[] = [
      {
        fileUri: "file1.py",
        definition: { variableName: "dep1", line: 1, column: 0 },
      },
    ]
    const usedNames = collectUsedDependencies([[], ["dep1"]])

    const unused = findUnusedDependencies(definitions, usedNames)

    assert.strictEqual(unused.length, 0)
  })

  test("collects imported names across files and dedupes", () => {
    const used = collectUsedDependencies([
      ["dep1", "dep3"],
      ["dep2", "dep1"], // dep1 repeated across files
    ])

    assert.strictEqual(used.size, 3)
    assert.ok(used.has("dep1"))
    assert.ok(used.has("dep2"))
    assert.ok(used.has("dep3"))
  })
})
