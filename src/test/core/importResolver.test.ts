import * as assert from "node:assert"
import * as vscode from "vscode"
import { resolveImport, resolveNamedImport } from "../../core/importResolver"
import { Parser } from "../../core/parser"
import { fixtures, wasmPaths } from "../testUtils"

const standardRoot = fixtures.standard.root

suite("importResolver", () => {
  let parser: Parser

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmPaths)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("resolveImport", () => {
    test("resolves relative import to .py file", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "app", "main.py")
      const projectRoot = standardRoot

      const result = await resolveImport(
        { modulePath: "routes.users", isRelative: true, relativeDots: 1 },
        currentFile,
        projectRoot,
      )

      assert.ok(result)
      assert.ok(result.path.endsWith("users.py"))
    })

    test("resolves relative import to __init__.py", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "app", "main.py")
      const projectRoot = standardRoot

      const result = await resolveImport(
        { modulePath: "routes", isRelative: true, relativeDots: 1 },
        currentFile,
        projectRoot,
      )

      assert.ok(result)
      assert.ok(result.path.endsWith("__init__.py"))
    })

    test("resolves double-dot relative import", async () => {
      // from .. import something (2 dots, no module name)
      // From app/routes/users.py, this goes to parent package (app)
      const currentFile = vscode.Uri.joinPath(
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
      )

      // 2 dots from routes/users.py goes to app/
      assert.ok(result)
      assert.ok(result.path.endsWith("app/__init__.py"))
    })

    test("resolves absolute import", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "main.py")
      const projectRoot = standardRoot

      const result = await resolveImport(
        {
          modulePath: "app.routes.users",
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
      )

      assert.ok(result)
      assert.ok(result.path.endsWith("users.py"))
    })

    test("returns null for non-existent module", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "main.py")
      const projectRoot = standardRoot

      const result = await resolveImport(
        {
          modulePath: "nonexistent.module",
          isRelative: false,
          relativeDots: 0,
        },
        currentFile,
        projectRoot,
      )

      assert.strictEqual(result, null)
    })
  })

  suite("resolveNamedImport", () => {
    test("resolves named import to .py file", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "app", "main.py")
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
        parser,
      )

      assert.ok(result)
      assert.ok(result.path.endsWith("users.py"))
    })

    test("resolves re-exported name from __init__.py", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "app", "main.py")
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
        parser,
      )

      assert.ok(result)
      assert.ok(result.path.endsWith("users.py"))
    })

    test("falls back to base module for non-existent named import", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "app", "main.py")
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
        parser,
      )

      // Falls back to the base module when named import not found
      assert.ok(result)
      assert.ok(
        result.path.endsWith("routes/__init__.py") ||
          result.path.endsWith("routes.py"),
      )
    })

    test("resolves relative named import from namespace package (no __init__.py)", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "app", "main.py")
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
        parser,
      )

      assert.ok(result)
      assert.ok(result.path.endsWith("api_routes.py"))
    })

    test("resolves absolute named import from namespace package (no __init__.py)", async () => {
      const currentFile = vscode.Uri.joinPath(standardRoot, "main.py")
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
        parser,
      )

      assert.ok(result)
      assert.ok(result.path.endsWith("api_routes.py"))
    })
  })
})
