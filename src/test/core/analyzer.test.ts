import * as assert from "node:assert"
import { analyzeFile, analyzeTree } from "../../core/analyzer"
import { Parser } from "../../core/parser"
import { fixtures, nodeFileSystem, wasmBinaries } from "../testUtils"

suite("analyzer", () => {
  let parser: Parser

  const parse = (code: string) => {
    const tree = parser.parse(code)
    assert.ok(tree, "Failed to parse code")
    return tree
  }

  suiteSetup(async () => {
    parser = new Parser()
    await parser.init(wasmBinaries)
  })

  suiteTeardown(() => {
    parser.dispose()
  })

  suite("analyzeTree", () => {
    test("extracts routes from decorated functions", () => {
      const code = `
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def list_items():
    pass

@router.post("/")
def create_item():
    pass
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routes.length, 2)
      assert.strictEqual(result.routes[0].method, "get")
      assert.strictEqual(result.routes[0].path, "/")
      assert.strictEqual(result.routes[1].method, "post")
    })

    test("extracts routers from assignments", () => {
      const code = `
from fastapi import FastAPI, APIRouter

app = FastAPI()
router = APIRouter(prefix="/api")
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.routers.length, 2)
      assert.strictEqual(result.routers[0].variableName, "app")
      assert.strictEqual(result.routers[0].type, "FastAPI")
      assert.strictEqual(result.routers[1].variableName, "router")
      assert.strictEqual(result.routers[1].type, "APIRouter")
      assert.strictEqual(result.routers[1].prefix, "/api")
    })

    test("extracts include_router calls", () => {
      const code = `
app.include_router(users.router, prefix="/users")
app.include_router(items.router, prefix="/items")
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.includeRouters.length, 2)
      assert.strictEqual(result.includeRouters[0].router, "users.router")
      assert.strictEqual(result.includeRouters[0].prefix, "/users")
      assert.strictEqual(result.includeRouters[1].router, "items.router")
      assert.strictEqual(result.includeRouters[1].prefix, "/items")
    })

    test("extracts imports", () => {
      const code = `
from fastapi import FastAPI
from .routes import users, items
import os
`
      const tree = parse(code)
      const result = analyzeTree(tree, "/test/file.py")

      assert.strictEqual(result.imports.length, 3)

      const fastapiImport = result.imports.find(
        (i) => i.modulePath === "fastapi",
      )
      assert.ok(fastapiImport)
      assert.deepStrictEqual(fastapiImport.names, ["FastAPI"])

      const routesImport = result.imports.find((i) => i.modulePath === "routes")
      assert.ok(routesImport)
      assert.strictEqual(routesImport.isRelative, true)
    })

    test("sets filePath correctly", () => {
      const code = "x = 1"
      const tree = parse(code)
      const result = analyzeTree(tree, "/custom/path.py")

      assert.strictEqual(result.filePath, "/custom/path.py")
    })
  })

  suite("analyzeFile", () => {
    test("analyzes main.py fixture", async () => {
      const result = await analyzeFile(
        fixtures.standard.mainPy,
        parser,
        nodeFileSystem,
      )

      assert.ok(result)
      assert.strictEqual(result.filePath, fixtures.standard.mainPy)

      // Should find FastAPI app
      const fastApiRouter = result.routers.find((r) => r.type === "FastAPI")
      assert.ok(fastApiRouter)
      assert.strictEqual(fastApiRouter.variableName, "app")

      // Should find include_router calls
      assert.ok(result.includeRouters.length > 0)

      // Should find health check route
      const healthRoute = result.routes.find((r) => r.path === "/health")
      assert.ok(healthRoute)
      assert.strictEqual(healthRoute.method, "get")
    })

    test("analyzes users.py fixture", async () => {
      const result = await analyzeFile(
        fixtures.standard.usersPy,
        parser,
        nodeFileSystem,
      )

      assert.ok(result)

      // Should find APIRouter
      const apiRouter = result.routers.find((r) => r.type === "APIRouter")
      assert.ok(apiRouter)

      // Should find routes (users.py has 3 routes: list, get, create)
      assert.ok(result.routes.length >= 3)

      // Check specific routes exist
      const methods = result.routes.map((r) => r.method)
      assert.ok(methods.includes("get"))
      assert.ok(methods.includes("post"))
    })

    test("returns null when parser fails to parse", async () => {
      const nullParser = { parse: () => null } as unknown as Parser
      const mockFs = {
        readFile: async () => new TextEncoder().encode("x = 1"),
        exists: async () => true,
        joinPath: (...parts: string[]) => parts.join("/"),
        dirname: (p: string) => p.split("/").slice(0, -1).join("/"),
      }
      const result = await analyzeFile("file:///test.py", nullParser, mockFs)
      assert.strictEqual(result, null)
    })

    test("returns null for non-existent file", async () => {
      const result = await analyzeFile(
        "file:///nonexistent/file.py",
        parser,
        nodeFileSystem,
      )
      assert.strictEqual(result, null)
    })
  })
})
