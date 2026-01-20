/**
 * Utility functions to extract FastAPI-related information from AST nodes.
 */

import type { Node } from "web-tree-sitter"
import type {
  ImportedName,
  ImportInfo,
  IncludeRouterInfo,
  MountInfo,
  RouteInfo,
  RouterInfo,
  RouterType,
} from "./internal"
import { ROUTE_METHODS } from "./internal"

/** Recursively finds all nodes of a given type within a subtree */
export function findNodesByType(node: Node, type: string): Node[] {
  const results: Node[] = []
  collectNodesByType(node, type, results)
  return results
}

function collectNodesByType(node: Node, type: string, results: Node[]): void {
  if (node.type === type) {
    results.push(node)
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      collectNodesByType(child, type, results)
    }
  }
}

/**
 * Extracts the string value from a string AST node, handling quotes and f-string prefix.
 * Returns null if the node is not a string.
 *
 * Examples:
 *   '"/users"' -> "/users"
 *   "'/users'" -> "/users"
 *   'f"/users/{id}"' -> "/users/{id}"
 */
export function extractStringValue(node: Node): string | null {
  if (node.type !== "string") {
    return null
  }
  const text = node.text
  // Handle f-string prefix: f"..." or f'...'
  if (text.startsWith('f"') || text.startsWith("f'")) {
    return text.slice(2, -1)
  }
  // Regular string: "..." or '...'
  return text.slice(1, -1)
}

/**
 * Extracts a path string from various AST node types.
 * Handles: plain strings, f-strings, concatenation, identifiers.
 */
export function extractPathFromNode(node: Node): string {
  switch (node.type) {
    case "string":
      return extractStringValue(node) ?? ""

    case "concatenated_string":
      // Adjacent strings: "/api" "/v1" -> "/api/v1"
      return node.namedChildren
        .map((child) => extractPathFromNode(child))
        .join("")

    case "binary_operator": {
      // Concatenation: BASE + "/users"
      const left = node.childForFieldName("left")
      const right = node.childForFieldName("right")
      const operator = node.childForFieldName("operator")
      if (operator?.text === "+" && left && right) {
        return extractPathFromNode(left) + extractPathFromNode(right)
      }
      // For other operators, just return the raw text
      return `{${node.text}}`
    }

    case "identifier":
    case "attribute":
    case "call":
      // Dynamic values: variable, attribute access, or function call
      return `{${node.text}}`

    default:
      // Fallback: wrap unknown types in braces to indicate dynamic
      return node.text ? `{${node.text}}` : ""
  }
}

/**
 * Extracts from route decorators like @app.get("/path"), @router.post("/path"), etc.
 */
export function decoratorExtractor(node: Node): RouteInfo | null {
  if (node.type !== "decorated_definition") {
    return null
  }

  const decoratorNode = node.firstNamedChild
  if (!decoratorNode) {
    return null
  }

  const callNode = findNodesByType(decoratorNode, "call")[0]
  const functionNode = callNode?.childForFieldName("function")
  const argumentsNode = callNode?.childForFieldName("arguments")
  const objectNode = functionNode?.childForFieldName("object")
  const methodNode = functionNode?.childForFieldName("attribute")

  if (!objectNode || !methodNode || !argumentsNode) {
    return null
  }

  // Filter out non-route decorators (exception_handler, middleware, on_event)
  const method = methodNode.text.toLowerCase()
  const isApiRoute = method === "api_route"
  if (!ROUTE_METHODS.has(method) && !isApiRoute) {
    return null
  }

  // Skip comment nodes to find the actual first argument
  const pathArgNode = argumentsNode.namedChildren.find(
    (child) => child.type !== "comment",
  )
  const path = pathArgNode ? extractPathFromNode(pathArgNode) : ""

  // For api_route, extract methods from keyword argument
  let resolvedMethod = methodNode.text
  if (isApiRoute) {
    // Default to GET if no methods specified
    resolvedMethod = "GET"
    for (const argNode of argumentsNode.namedChildren) {
      if (argNode.type === "keyword_argument") {
        const nameNode = argNode.childForFieldName("name")
        const valueNode = argNode.childForFieldName("value")
        if (nameNode?.text === "methods" && valueNode) {
          // Extract first method from list
          const listItems = valueNode.namedChildren
          const firstMethod =
            listItems.length > 0 ? extractStringValue(listItems[0]) : null
          if (firstMethod) {
            resolvedMethod = firstMethod
          }
        }
      }
    }
  }

  const functionDefNode = node.childForFieldName("definition")
  const functionNameDefNode = functionDefNode
    ? functionDefNode.childForFieldName("name")
    : null
  const functionName = functionNameDefNode ? functionNameDefNode.text : ""

  return {
    owner: objectNode.text,
    method: resolvedMethod,
    path,
    function: functionName,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  }
}

/** Extracts tags from a list node like ["users", "admin"] */
function extractTags(listNode: Node): string[] {
  return listNode.namedChildren
    .map((elem) => extractStringValue(elem))
    .filter((v): v is string => v !== null)
}

export function routerExtractor(node: Node): RouterInfo | null {
  if (node.type !== "assignment") {
    return null
  }

  const variableNameNode = node.childForFieldName("left")
  const valueNode = node.childForFieldName("right")
  if (!variableNameNode || valueNode?.type !== "call") {
    return null
  }

  const funcName = valueNode.childForFieldName("function")?.text
  let type: RouterType
  if (funcName === "APIRouter" || funcName === "fastapi.APIRouter") {
    type = "APIRouter"
  } else if (funcName === "FastAPI" || funcName === "fastapi.FastAPI") {
    type = "FastAPI"
  } else {
    return null
  }

  let prefix = ""
  let tags: string[] = []
  const argumentsNode = valueNode.childForFieldName("arguments")
  for (const child of argumentsNode?.namedChildren ?? []) {
    if (child.type !== "keyword_argument") {
      continue
    }
    const argName = child.childForFieldName("name")?.text
    const argValue = child.childForFieldName("value")

    if (argName === "prefix" && argValue) {
      prefix = extractPathFromNode(argValue)
    } else if (argName === "tags" && argValue?.type === "list") {
      tags = extractTags(argValue)
    }
  }

  return {
    variableName: variableNameNode.text,
    type,
    prefix,
    tags,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  }
}

/** Checks if a node is inside an ancestor of a given type */
function hasAncestor(node: Node, ancestorType: string): boolean {
  let parent = node.parent
  while (parent) {
    if (parent.type === ancestorType) {
      return true
    }
    parent = parent.parent
  }
  return false
}

/** Parses a module path, extracting relative dots if present */
function parseModulePath(rawPath: string): {
  modulePath: string
  isRelative: boolean
  relativeDots: number
} {
  const matches = rawPath.match(/^(\.+)(.*)/)
  if (matches) {
    return {
      modulePath: matches[2],
      isRelative: true,
      relativeDots: matches[1].length,
    }
  }
  return { modulePath: rawPath, isRelative: false, relativeDots: 0 }
}

export function importExtractor(node: Node): ImportInfo | null {
  if (
    node.type !== "import_statement" &&
    node.type !== "import_from_statement"
  ) {
    return null
  }

  const names: string[] = []
  const namedImports: ImportedName[] = []

  if (node.type === "import_statement") {
    const nameNodes = findNodesByType(node, "dotted_name")
    for (const nameNode of nameNodes) {
      const firstName = nameNode.text.split(".")[0]
      names.push(firstName)
      namedImports.push({ name: firstName, alias: null })
    }
    const modulePath = nameNodes[0]?.text ?? ""
    return {
      modulePath,
      names,
      namedImports,
      isRelative: false,
      relativeDots: 0,
    }
  }

  // import_from_statement
  const moduleNode = node.childForFieldName("module_name")
  const { modulePath, isRelative, relativeDots } = parseModulePath(
    moduleNode?.text ?? "",
  )

  // Aliased imports (e.g., "router as users_router")
  for (const aliased of findNodesByType(node, "aliased_import")) {
    const nameNode = aliased.childForFieldName("name")
    const aliasNode = aliased.childForFieldName("alias")
    if (nameNode) {
      const alias = aliasNode?.text ?? null
      names.push(alias ?? nameNode.text)
      namedImports.push({ name: nameNode.text, alias })
    }
  }

  // Non-aliased imports (skip first dotted_name which is the module path)
  const nameNodes = findNodesByType(node, "dotted_name")
  for (let i = 1; i < nameNodes.length; i++) {
    const nameNode = nameNodes[i]
    if (!hasAncestor(nameNode, "aliased_import")) {
      names.push(nameNode.text)
      namedImports.push({ name: nameNode.text, alias: null })
    }
  }

  return { modulePath, names, namedImports, isRelative, relativeDots }
}

/** Extracts method call info: object.method(args) */
function extractMethodCall(
  node: Node,
  methodName: string,
): { object: string; args: Node[] } | null {
  if (node.type !== "call") {
    return null
  }

  const functionNode = node.childForFieldName("function")
  if (functionNode?.type !== "attribute") {
    return null
  }

  const objectNode = functionNode.childForFieldName("object")
  const methodNode = functionNode.childForFieldName("attribute")
  if (!objectNode || methodNode?.text !== methodName) {
    return null
  }

  const argumentsNode = node.childForFieldName("arguments")
  const args =
    argumentsNode?.namedChildren.filter((c) => c.type !== "comment") ?? []

  return { object: objectNode.text, args }
}

export function includeRouterExtractor(node: Node): IncludeRouterInfo | null {
  const call = extractMethodCall(node, "include_router")
  if (!call) {
    return null
  }

  let prefix = ""
  let tags: string[] = []
  for (const arg of call.args) {
    if (arg.type !== "keyword_argument") {
      continue
    }
    const name = arg.childForFieldName("name")?.text
    const value = arg.childForFieldName("value")

    if (name === "prefix" && value) {
      prefix = extractPathFromNode(value)
    } else if (name === "tags" && value?.type === "list") {
      tags = extractTags(value)
    }
  }

  return {
    owner: call.object,
    router: call.args[0]?.text ?? "",
    prefix,
    tags,
  }
}

/** Extracts mount() calls for subapps: app.mount("/path", subapp) */
export function mountExtractor(node: Node): MountInfo | null {
  const call = extractMethodCall(node, "mount")
  if (!call || call.args.length < 2) {
    return null
  }

  return {
    owner: call.object,
    path: extractPathFromNode(call.args[0]),
    app: call.args[1].text,
  }
}
