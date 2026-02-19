import * as assert from "node:assert"
import {
  decoratorExtractor,
  extractPathFromNode,
  extractStringValue,
  findNodesByType,
  importExtractor,
  includeRouterExtractor,
  mountExtractor,
  routerExtractor,
} from "../../core/extractors"
import { Parser } from "../../core/parser"
import { wasmBinaries } from "../testUtils"

suite("Extractors", () => {
  let parser: Parser

  // Helper to parse code and assert tree is not null
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

  suite("decoratorExtractor", () => {
    test("extracts simple route decorator", () => {
      const code = `
@router.get("/users")
def list_users():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      assert.strictEqual(decoratedDefs.length, 1)

      const result = decoratorExtractor(decoratedDefs[0])
      assert.ok(result)
      assert.strictEqual(result.owner, "router")
      assert.strictEqual(result.method, "get")
      assert.strictEqual(result.path, "/users")
      assert.strictEqual(result.function, "list_users")
    })

    test("extracts route with path parameter", () => {
      const code = `
@router.get("/users/{user_id}")
def get_user(user_id: int):
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "/users/{user_id}")
    })

    test("extracts POST route", () => {
      const code = `
@app.post("/items")
def create_item():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "app")
      assert.strictEqual(result.method, "post")
      assert.strictEqual(result.path, "/items")
    })

    test("extracts websocket route", () => {
      const code = `
@router.websocket("/ws")
def websocket_handler(websocket: WebSocket):
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.method, "websocket")
      assert.strictEqual(result.path, "/ws")
    })

    test("handles dynamic path with variable", () => {
      const code = `
@router.get(BASE_PATH)
def handler():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "{BASE_PATH}")
    })

    test("handles dynamic path with attribute", () => {
      const code = `
@router.get(settings.API_PREFIX)
def handler():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "{settings.API_PREFIX}")
    })

    test("handles path concatenation", () => {
      const code = `
@router.get(BASE + "/users")
def handler():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "{BASE}/users")
    })

    test("returns null for simple decorator without call", () => {
      const code = `
@staticmethod
def handler():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])
      assert.strictEqual(result, null)
    })

    test("returns null for non-route decorator", () => {
      const code = `
@app.exception_handler(404)
def not_found(request, exc):
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])
      assert.strictEqual(result, null)
    })

    test("extracts api_route decorator", () => {
      const code = `
@router.api_route("/items", methods=["POST"])
def handle_items():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.method, "POST")
      assert.strictEqual(result.path, "/items")
    })

    test("extracts api_route with default GET when no methods specified", () => {
      const code = `
@router.api_route("/items")
def handle_items():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.method, "GET")
    })

    test("returns null for non-decorated definition", () => {
      const code = `
def regular_function():
    pass
`
      const tree = parse(code)
      const funcDefs = findNodesByType(tree.rootNode, "function_definition")
      const result = decoratorExtractor(funcDefs[0])

      assert.strictEqual(result, null)
    })

    test("includes line and column information", () => {
      const code = `
@router.get("/test")
def handler():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.line, 2) // 1-indexed
      assert.strictEqual(result.column, 0)
    })

    test("extracts single-line docstring", () => {
      const code = `
@router.get("/users")
def list_users():
    """List all users."""
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.docstring, "List all users.")
    })

    test("extracts multi-line docstring and dedents", () => {
      const code = `
@router.get("/users")
def list_users():
    """
    List all users.

    Returns a list of user objects.
    """
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(
        result.docstring,
        "List all users.\n\nReturns a list of user objects.",
      )
    })

    test("extracts single-quote docstring", () => {
      const code = `
@router.get("/users")
def list_users():
    '''List all users.'''
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.docstring, "List all users.")
    })

    test("returns undefined docstring when none present", () => {
      const code = `
@router.get("/users")
def list_users():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.docstring, undefined)
    })
  })

  suite("routerExtractor", () => {
    test("extracts FastAPI app instantiation", () => {
      const code = "app = FastAPI()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.prefix, "")
    })

    test("extracts APIRouter instantiation", () => {
      const code = "router = APIRouter()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "APIRouter")
    })

    test("extracts APIRouter with prefix", () => {
      const code = `router = APIRouter(prefix="/users")`
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "/users")
    })

    test("extracts APIRouter with tags", () => {
      const code = `router = APIRouter(tags=["users", "admin"])`
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.deepStrictEqual(result.tags, ["users", "admin"])
    })

    test("extracts APIRouter with prefix and tags", () => {
      const code = `router = APIRouter(prefix="/api", tags=["api"])`
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "/api")
      assert.deepStrictEqual(result.tags, ["api"])
    })

    test("ignores positional arguments in router constructor", () => {
      const code = "router = APIRouter(some_config)"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "")
      assert.deepStrictEqual(result.tags, [])
    })

    test("handles dynamic prefix", () => {
      const code = "router = APIRouter(prefix=settings.API_PREFIX)"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "{settings.API_PREFIX}")
    })

    test("returns null for non-router assignment", () => {
      const code = "x = 5"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })

    test("returns null for other function call", () => {
      const code = "result = some_function()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })

    test("extracts qualified fastapi.FastAPI() call", () => {
      const code = "app = fastapi.FastAPI()"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.type, "FastAPI")
    })

    test("extracts qualified fastapi.APIRouter() call", () => {
      const code = "router = fastapi.APIRouter(prefix='/api')"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.prefix, "/api")
    })
  })

  suite("importExtractor", () => {
    test("extracts simple import", () => {
      const code = "import fastapi"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "fastapi")
      assert.deepStrictEqual(result.names, ["fastapi"])
      assert.strictEqual(result.isRelative, false)
    })

    test("extracts from import", () => {
      const code = "from fastapi import FastAPI"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "fastapi")
      assert.deepStrictEqual(result.names, ["FastAPI"])
      assert.strictEqual(result.isRelative, false)
    })

    test("extracts relative import with single dot", () => {
      const code = "from .routes import users"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "routes")
      assert.strictEqual(result.isRelative, true)
      assert.strictEqual(result.relativeDots, 1)
    })

    test("extracts relative import with double dot", () => {
      const code = "from ..api import router"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "api")
      assert.strictEqual(result.isRelative, true)
      assert.strictEqual(result.relativeDots, 2)
    })

    test("extracts import with alias", () => {
      const code = "from .users import router as users_router"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.deepStrictEqual(result.names, ["users_router"])
      assert.deepStrictEqual(result.namedImports, [
        { name: "router", alias: "users_router" },
      ])
    })

    test("extracts multiple imports", () => {
      const code = "from fastapi import FastAPI, APIRouter"
      const tree = parse(code)
      const imports = findNodesByType(tree.rootNode, "import_from_statement")
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.ok(result.names.includes("FastAPI"))
      assert.ok(result.names.includes("APIRouter"))
    })

    test("returns null for non-import node", () => {
      const code = "x = 5"
      const tree = parse(code)
      const assignments = findNodesByType(tree.rootNode, "assignment")
      const result = importExtractor(assignments[0])

      assert.strictEqual(result, null)
    })
  })

  suite("includeRouterExtractor", () => {
    test("extracts include_router call", () => {
      const code = "app.include_router(users.router)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "app")
      assert.strictEqual(result.router, "users.router")
      assert.strictEqual(result.prefix, "")
    })

    test("extracts include_router with prefix", () => {
      const code = `app.include_router(users.router, prefix="/users")`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "/users")
    })

    test("extracts include_router with dynamic prefix", () => {
      const code = "app.include_router(router, prefix=settings.PREFIX)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "{settings.PREFIX}")
    })

    test("extracts include_router with tags", () => {
      const code = `app.include_router(router, tags=["users", "admin"])`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.deepStrictEqual(result.tags, ["users", "admin"])
    })

    test("returns null for non-include_router call", () => {
      const code = "app.some_method(arg)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeRouterExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("returns null for function call (not method)", () => {
      const code = "include_router(router)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = includeRouterExtractor(calls[0])

      assert.strictEqual(result, null)
    })
  })

  suite("mountExtractor", () => {
    test("extracts mount call", () => {
      const code = `app.mount("/static", static_app)`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "app")
      assert.strictEqual(result.path, "/static")
      assert.strictEqual(result.app, "static_app")
    })

    test("extracts mount with dynamic path", () => {
      const code = "app.mount(settings.STATIC_PATH, static_app)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.path, "{settings.STATIC_PATH}")
    })

    test("returns null for non-mount call", () => {
      const code = "app.some_method(arg1, arg2)"
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("returns null for mount with missing arguments", () => {
      const code = `app.mount("/static")`
      const tree = parse(code)
      const calls = findNodesByType(tree.rootNode, "call")
      const result = mountExtractor(calls[0])

      assert.strictEqual(result, null)
    })
  })

  suite("extractStringValue", () => {
    test("returns null for non-string node", () => {
      const code = "x = 42"
      const tree = parse(code)
      const nodes = findNodesByType(tree.rootNode, "integer")
      assert.strictEqual(extractStringValue(nodes[0]), null)
    })
  })

  suite("extractPathFromNode", () => {
    test("returns dynamic placeholder for non-plus binary operator", () => {
      const code = "x = a - b"
      const tree = parse(code)
      const ops = findNodesByType(tree.rootNode, "binary_operator")
      const result = extractPathFromNode(ops[0])
      assert.strictEqual(result, "{a - b}")
    })
  })

  suite("decoratorExtractor path handling", () => {
    test("handles concatenated strings", () => {
      const code = `
@router.get("/api" "/v1" "/users")
def handler():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "/api/v1/users")
    })

    test("handles function call as path", () => {
      const code = `
@router.get(get_path())
def handler():
    pass
`
      const tree = parse(code)
      const decoratedDefs = findNodesByType(
        tree.rootNode,
        "decorated_definition",
      )
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "{get_path()}")
    })
  })
})
