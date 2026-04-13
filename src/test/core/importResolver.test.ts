import * as assert from "node:assert"
import { analyzeFile } from "../../core/analyzer"
import { resolveImport, resolveNamedImport } from "../../core/importResolver"
import { Parser } from "../../core/parser"
import { fixtures, nodeFileSystem, wasmBinaries } from "../testUtils"

const standardRoot = fixtures.standard.root

suite("importResolver", () => {
  let parser: Parser

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("resolveImport", () => {
    test("resolves relative import to .py file", async () => {
      const currentFile = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "main.py",
      )
      const projectRoot = standardRoot

      const result = await resolveImport(
        { modulePath: "routes.users", isRelative: true, relativeDots: 1 },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("resolves relative import to __init__.py", async () => {
      const currentFile = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "main.py",
      )
      const projectRoot = standardRoot

      const result = await resolveImport(
        { modulePath: "routes", isRelative: true, relativeDots: 1 },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.ok(result.endsWith("__init__.py"))
    })

    test("resolves double-dot relative import", async () => {
      // from .. import something (2 dots, no module name)
      // From app/routes/users.py, this goes to parent package (app)
      const currentFile = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "routes",
        "users.py",
      )
      const projectRoot = standardRoot

      const result = await resolveImport(
        { modulePath: "", isRelative: true, relativeDots: 2 },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      // 2 dots from routes/users.py goes to app/
      assert.ok(result)
      assert.ok(result.endsWith("app/__init__.py"))
    })

    test("resolves absolute import", async () => {
      const currentFile = nodeFileSystem.joinPath(standardRoot, "main.py")
      const projectRoot = standardRoot

      const result = await resolveImport(
        {
          modulePath: "app.routes.users",
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("falls back to src/ for absolute imports in src layout", async () => {
      // Project root is the pyproject.toml dir, but source is under src/
      const currentFile = fixtures.srcLayout.mainPy
      const projectRoot = fixtures.srcLayout.workspaceRoot

      const result = await resolveImport(
        { modulePath: "app.api", isRelative: false, relativeDots: 0 },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.ok(result.endsWith("api/__init__.py"))
    })

    test("returns null for non-existent module", async () => {
      const currentFile = nodeFileSystem.joinPath(standardRoot, "main.py")
      const projectRoot = standardRoot

      const result = await resolveImport(
        {
          modulePath: "nonexistent.module",
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.strictEqual(result, null)
    })
  })

  suite("resolveNamedImport", () => {
    test("resolves named import to .py file", async () => {
      const currentFile = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "main.py",
      )
      const projectRoot = standardRoot

      const result = await resolveNamedImport(
        {
          modulePath: "routes",
          names: ["users"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("resolves re-exported name from __init__.py", async () => {
      const currentFile = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "main.py",
      )
      const projectRoot = standardRoot

      // The __init__.py has: from .users import router as users_router
      const result = await resolveNamedImport(
        {
          modulePath: "routes",
          names: ["users_router"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
        (uri) => analyzeFile(uri, parser, nodeFileSystem),
      )

      assert.ok(result)
      assert.ok(result.endsWith("users.py"))
    })

    test("falls back to base module for non-existent named import", async () => {
      const currentFile = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "main.py",
      )
      const projectRoot = standardRoot

      const result = await resolveNamedImport(
        {
          modulePath: "routes",
          names: ["nonexistent"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      // Falls back to the base module when named import not found
      assert.ok(result)
      assert.ok(
        result.endsWith("routes/__init__.py") || result.endsWith("routes.py"),
      )
    })

    test("resolves relative named import from namespace package (no __init__.py)", async () => {
      const currentFile = nodeFileSystem.joinPath(
        standardRoot,
        "app",
        "main.py",
      )
      const projectRoot = standardRoot

      // namespace_routes has no __init__.py, but api_routes.py exists
      const result = await resolveNamedImport(
        {
          modulePath: "namespace_routes",
          names: ["api_routes"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.ok(result.endsWith("api_routes.py"))
    })

    test("resolves absolute named import from namespace package (no __init__.py)", async () => {
      const currentFile = nodeFileSystem.joinPath(standardRoot, "main.py")
      const projectRoot = standardRoot

      // app.namespace_routes has no __init__.py, but api_routes.py exists
      const result = await resolveNamedImport(
        {
          modulePath: "app.namespace_routes",
          names: ["api_routes"],
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.ok(result.endsWith("api_routes.py"))
    })

    test("resolves named import via src/ fallback for src layout", async () => {
      const currentFile = fixtures.srcLayout.mainPy
      const projectRoot = fixtures.srcLayout.workspaceRoot

      // "from app.api import api_router" — the actual import from the issue
      const result = await resolveNamedImport(
        {
          modulePath: "app.api",
          names: ["api_router"],
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
        nodeFileSystem,
        (uri) => analyzeFile(uri, parser, nodeFileSystem),
      )

      assert.ok(result)
      assert.ok(result.endsWith("api/__init__.py"))
    })

    test("resolves variable import from .py file (not submodule)", async () => {
      // This tests "from .neon import router" where router is a variable in neon.py,
      // NOT a submodule. Should return neon.py, not look for router.py
      const reexportRoot = fixtures.reexport.root
      const currentFile = nodeFileSystem.joinPath(
        reexportRoot,
        "app",
        "integrations",
        "router.py",
      )

      const result = await resolveNamedImport(
        {
          modulePath: "neon",
          names: ["router"],
          isRelative: true,
          relativeDots: 1,
        },
        currentFile,
        reexportRoot,
        nodeFileSystem,
      )

      assert.ok(result, "Should resolve import")
      assert.ok(result.endsWith("neon.py"), `Expected neon.py, got ${result}`)
    })
  })
})
