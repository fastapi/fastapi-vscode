import * as assert from "node:assert"
import {
  collectRecognizedNames,
  collectStringVariables,
  decoratorExtractor,
  extractPathFromNode,
  extractStringValue,
  getNodesByType,
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "\uE000BASE_PATH\uE000")
    })

    test("handles dynamic path with attribute", () => {
      const code = `
@router.get(settings.API_PREFIX)
def handler():
    pass
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "\uE000settings.API_PREFIX\uE000")
    })

    test("handles path concatenation", () => {
      const code = `
@router.get(BASE + "/users")
def handler():
    pass
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "\uE000BASE\uE000/users")
    })

    test("returns null for simple decorator without call", () => {
      const code = `
@staticmethod
def handler():
    pass
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.method, "GET")
    })

    test("extracts route with 'path' keyword argument", () => {
      const code = `
@app.get(path="/users/{user_id}", include_in_schema=False)
def get_user(user_id: int):
    pass
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "/users/{user_id}")
    })

    test("returns null for non-decorated definition", () => {
      const code = `
def regular_function():
    pass
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const funcDefs = nodesByType.get("function_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.docstring, undefined)
    })
  })

  suite("routerExtractor", () => {
    test("extracts FastAPI app instantiation", () => {
      const code = "app = FastAPI()"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.type, "FastAPI")
      assert.strictEqual(result.prefix, "")
    })

    test("extracts APIRouter instantiation", () => {
      const code = "router = APIRouter()"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "APIRouter")
    })

    test("extracts APIRouter with prefix", () => {
      const code = `router = APIRouter(prefix="/users")`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "/users")
    })

    test("extracts APIRouter with tags", () => {
      const code = `router = APIRouter(tags=["users", "admin"])`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.deepStrictEqual(result.tags, ["users", "admin"])
    })

    test("extracts APIRouter with prefix and tags", () => {
      const code = `router = APIRouter(prefix="/api", tags=["api"])`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "/api")
      assert.deepStrictEqual(result.tags, ["api"])
    })

    test("ignores positional arguments in router constructor", () => {
      const code = "router = APIRouter(some_config)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "")
      assert.deepStrictEqual(result.tags, [])
    })

    test("handles dynamic prefix", () => {
      const code = "router = APIRouter(prefix=settings.API_PREFIX)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "\uE000settings.API_PREFIX\uE000")
    })

    test("returns null for non-router assignment", () => {
      const code = "x = 5"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })

    test("returns null for other function call", () => {
      const code = "result = some_function()"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })

    test("extracts qualified fastapi.FastAPI() call", () => {
      const code = "app = fastapi.FastAPI()"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.type, "FastAPI")
    })

    test("extracts qualified fastapi.APIRouter() call", () => {
      const code = "router = fastapi.APIRouter(prefix='/api')"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.prefix, "/api")
    })

    test("returns null for custom subclass without subclasses set", () => {
      const code = "admin_router = AdminAPIRouter(prefix='/admin')"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0])

      assert.strictEqual(result, null)
    })

    test("recognizes custom APIRouter subclass", () => {
      const code = `
class AdminAPIRouter(APIRouter):
    pass

admin_router = AdminAPIRouter(prefix="/admin")
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const { apiRouterNames } = collectRecognizedNames(nodesByType)
      assert.ok(apiRouterNames.has("AdminAPIRouter"))

      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0], apiRouterNames)

      assert.ok(result)
      assert.strictEqual(result.variableName, "admin_router")
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.prefix, "/admin")
    })

    test("recognizes FastAPI subclass", () => {
      const code = `
class MyApp(FastAPI):
    pass

app = MyApp()
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const { fastAPINames, apiRouterNames } =
        collectRecognizedNames(nodesByType)
      assert.ok(fastAPINames.has("MyApp"))
      assert.ok(!apiRouterNames.has("MyApp"))

      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(
        assignments[0],
        apiRouterNames,
        fastAPINames,
      )

      assert.ok(result)
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.type, "FastAPI")
    })

    test("recognizes aliased FastAPI import (FastAPI as FA)", () => {
      const code = `
from fastapi import FastAPI as FA

app = FA()
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const { fastAPINames, apiRouterNames } =
        collectRecognizedNames(nodesByType)
      assert.ok(fastAPINames.has("FA"))

      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(
        assignments[0],
        apiRouterNames,
        fastAPINames,
      )

      assert.ok(result)
      assert.strictEqual(result.variableName, "app")
      assert.strictEqual(result.type, "FastAPI")
    })

    test("recognizes aliased APIRouter import (APIRouter as AR)", () => {
      const code = `
from fastapi import APIRouter as AR

router = AR(prefix="/items")
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const { apiRouterNames } = collectRecognizedNames(nodesByType)
      assert.ok(apiRouterNames.has("AR"))

      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0], apiRouterNames)

      assert.ok(result)
      assert.strictEqual(result.variableName, "router")
      assert.strictEqual(result.type, "APIRouter")
      assert.strictEqual(result.prefix, "/items")
    })

    test("recognizes subclass of aliased APIRouter (class MyRouter(AR))", () => {
      const code = `
from fastapi import APIRouter as AR

class MyRouter(AR):
    pass

router = MyRouter(prefix="/items")
`
      const tree = parse(code)

      const nodesByType = getNodesByType(tree.rootNode)
      const { apiRouterNames } = collectRecognizedNames(nodesByType)
      assert.ok(apiRouterNames.has("AR"))
      assert.ok(apiRouterNames.has("MyRouter"))

      const assignments = nodesByType.get("assignment") ?? []
      const result = routerExtractor(assignments[0], apiRouterNames)

      assert.ok(result)
      assert.strictEqual(result.type, "APIRouter")
    })

    test("collectRecognizedNames ignores non-aliased imports", () => {
      const code = "from fastapi import FastAPI, APIRouter"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const { fastAPINames, apiRouterNames } =
        collectRecognizedNames(nodesByType)
      // Only the defaults — no extras from non-aliased imports
      assert.strictEqual(fastAPINames.size, 2) // "FastAPI", "fastapi.FastAPI"
      assert.strictEqual(apiRouterNames.size, 2) // "APIRouter", "fastapi.APIRouter"
    })

    test("recognizes module alias (import fastapi as f)", () => {
      const code = `
import fastapi as f

app = f.FastAPI()
router = f.APIRouter(prefix="/items")
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const { fastAPINames, apiRouterNames } =
        collectRecognizedNames(nodesByType)
      assert.ok(fastAPINames.has("f.FastAPI"))
      assert.ok(apiRouterNames.has("f.APIRouter"))

      const assignments = nodesByType.get("assignment") ?? []
      const appResult = routerExtractor(
        assignments[0],
        apiRouterNames,
        fastAPINames,
      )
      assert.ok(appResult)
      assert.strictEqual(appResult.variableName, "app")
      assert.strictEqual(appResult.type, "FastAPI")

      const routerResult = routerExtractor(
        assignments[1],
        apiRouterNames,
        fastAPINames,
      )
      assert.ok(routerResult)
      assert.strictEqual(routerResult.variableName, "router")
      assert.strictEqual(routerResult.type, "APIRouter")
      assert.strictEqual(routerResult.prefix, "/items")
    })
  })

  suite("importExtractor", () => {
    test("extracts simple import", () => {
      const code = "import fastapi"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_statement") ?? []
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "fastapi")
      assert.deepStrictEqual(result.names, ["fastapi"])
      assert.deepStrictEqual(result.namedImports, [
        { name: "fastapi", alias: null },
      ])
      assert.strictEqual(result.isRelative, false)
    })

    test("preserves full dotted modulePath for import fastapi.routing", () => {
      const code = "import fastapi.routing"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_statement") ?? []
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "fastapi.routing")
      assert.deepStrictEqual(result.names, ["fastapi"])
      assert.deepStrictEqual(result.namedImports, [
        { name: "fastapi", alias: null },
      ])
    })

    test("extracts aliased module import (import fastapi as f)", () => {
      const code = "import fastapi as f"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_statement") ?? []
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "fastapi")
      assert.deepStrictEqual(result.names, ["f"])
      assert.deepStrictEqual(result.namedImports, [
        { name: "fastapi", alias: "f" },
      ])
      assert.strictEqual(result.isRelative, false)
    })

    test("extracts from import", () => {
      const code = "from fastapi import FastAPI"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_from_statement") ?? []
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "fastapi")
      assert.deepStrictEqual(result.names, ["FastAPI"])
      assert.strictEqual(result.isRelative, false)
    })

    test("extracts relative import with single dot", () => {
      const code = "from .routes import users"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_from_statement") ?? []
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "routes")
      assert.strictEqual(result.isRelative, true)
      assert.strictEqual(result.relativeDots, 1)
    })

    test("extracts relative import with double dot", () => {
      const code = "from ..api import router"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_from_statement") ?? []
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.strictEqual(result.modulePath, "api")
      assert.strictEqual(result.isRelative, true)
      assert.strictEqual(result.relativeDots, 2)
    })

    test("extracts import with alias", () => {
      const code = "from .users import router as users_router"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_from_statement") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const imports = nodesByType.get("import_from_statement") ?? []
      const result = importExtractor(imports[0])

      assert.ok(result)
      assert.ok(result.names.includes("FastAPI"))
      assert.ok(result.names.includes("APIRouter"))
    })

    test("returns null for non-import node", () => {
      const code = "x = 5"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const assignments = nodesByType.get("assignment") ?? []
      const result = importExtractor(assignments[0])

      assert.strictEqual(result, null)
    })
  })

  suite("includeRouterExtractor", () => {
    test("extracts include_router call", () => {
      const code = "app.include_router(users.router)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "app")
      assert.strictEqual(result.router, "users.router")
      assert.strictEqual(result.prefix, "")
    })

    test("extracts include_router with prefix", () => {
      const code = `app.include_router(users.router, prefix="/users")`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "/users")
    })

    test("extracts include_router with dynamic prefix", () => {
      const code = "app.include_router(router, prefix=settings.PREFIX)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.prefix, "\uE000settings.PREFIX\uE000")
    })

    test("extracts include_router with tags", () => {
      const code = `app.include_router(router, tags=["users", "admin"])`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.deepStrictEqual(result.tags, ["users", "admin"])
    })

    test("extracts include_router with 'router' keyword argument", () => {
      const code = `app.include_router(router=users_router, prefix="/api")`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = includeRouterExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.router, "users_router")
      assert.strictEqual(result.prefix, "/api")
    })

    test("returns null for non-include_router call", () => {
      const code = "app.some_method(arg)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = includeRouterExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("returns null for function call (not method)", () => {
      const code = "include_router(router)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = includeRouterExtractor(calls[0])

      assert.strictEqual(result, null)
    })
  })

  suite("mountExtractor", () => {
    test("extracts mount call", () => {
      const code = `app.mount("/static", static_app)`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = mountExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.owner, "app")
      assert.strictEqual(result.path, "/static")
      assert.strictEqual(result.app, "static_app")
    })

    test("extracts mount with dynamic path", () => {
      const code = "app.mount(settings.STATIC_PATH, static_app)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = mountExtractor(calls[0])

      assert.ok(result)
      assert.strictEqual(result.path, "\uE000settings.STATIC_PATH\uE000")
    })

    test("returns null for non-mount call", () => {
      const code = "app.some_method(arg1, arg2)"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = mountExtractor(calls[0])

      assert.strictEqual(result, null)
    })

    test("returns null for mount with missing arguments", () => {
      const code = `app.mount("/static")`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const calls = nodesByType.get("call") ?? []
      const result = mountExtractor(calls[0])

      assert.strictEqual(result, null)
    })
  })

  suite("collectStringVariables", () => {
    test("collects module-level string assignments", () => {
      const code = `
PREFIX = "/api"
VERSION = "/v1"
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const vars = collectStringVariables(nodesByType)
      assert.strictEqual(vars.get("PREFIX"), "/api")
      assert.strictEqual(vars.get("VERSION"), "/v1")
    })

    test("ignores function-local variables", () => {
      const code = `
PREFIX = "/api"

def handler():
    PREFIX = "/local"
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const vars = collectStringVariables(nodesByType)
      assert.strictEqual(vars.get("PREFIX"), "/api")
    })

    test("ignores class-level variables", () => {
      const code = `
PREFIX = "/api"

class Config:
    PREFIX = "/class-level"
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const vars = collectStringVariables(nodesByType)
      assert.strictEqual(vars.get("PREFIX"), "/api")
    })

    test("ignores non-string assignments", () => {
      const code = `
COUNT = 42
FLAG = True
`
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const vars = collectStringVariables(nodesByType)
      assert.strictEqual(vars.size, 0)
    })
  })

  suite("extractStringValue", () => {
    test("returns null for non-string node", () => {
      const code = "x = 42"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const nodes = nodesByType.get("integer") ?? []
      assert.strictEqual(extractStringValue(nodes[0]), null)
    })
  })

  suite("extractPathFromNode", () => {
    test("returns dynamic placeholder for non-plus binary operator", () => {
      const code = "x = a - b"
      const tree = parse(code)
      const nodesByType = getNodesByType(tree.rootNode)
      const ops = nodesByType.get("binary_operator") ?? []
      const result = extractPathFromNode(ops[0])
      assert.strictEqual(result, "\uE000a - b\uE000")
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
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
      const nodesByType = getNodesByType(tree.rootNode)
      const decoratedDefs = nodesByType.get("decorated_definition") ?? []
      const result = decoratorExtractor(decoratedDefs[0])

      assert.ok(result)
      assert.strictEqual(result.path, "\uE000get_path()\uE000")
    })
  })
})
