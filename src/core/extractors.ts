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

function stripDocstring(raw: string): string {
  let content: string
  if (
    (raw.startsWith('"""') && raw.endsWith('"""')) ||
    (raw.startsWith("'''") && raw.endsWith("'''"))
  ) {
    content = raw.slice(3, -3)
  } else {
    content = raw.slice(1, -1)
  }

  // Dedent: strip common leading whitespace (like Python's textwrap.dedent)
  const lines = content.split("\n")
  // First line is either empty or unindented (follows opening quotes), so skip it
  const indentedLines = lines.slice(1).filter((l) => l.trim().length > 0)
  if (indentedLines.length === 0) {
    return content.trim()
  }

  // Find minimum indentation of all non-empty lines (except first) so we can
  // remove it from all lines, preserving relative indentation
  const minIndent = Math.min(
    ...indentedLines.map((l) => l.length - l.trimStart().length),
  )
  const dedented = lines.map((l, i) => (i === 0 ? l : l.slice(minIndent)))
  return dedented.join("\n").trim()
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
 * Collects string variable assignments from the AST for path resolution.
 * Only resolves simple assignments (e.g. `WEBHOOK_PATH = "/webhook"`).
 *
 * Examples:
 *   WEBHOOK_PATH = "/webhook"  -> Map { "WEBHOOK_PATH" => "/webhook" }
 *   BASE = "/api"              -> Map { "BASE" => "/api" }
 *   settings.PREFIX = "/api"   -> (skipped, not a simple identifier)
 */
export function collectStringVariables(rootNode: Node): Map<string, string> {
  const variables = new Map<string, string>()
  const assignmentNodes = findNodesByType(rootNode, "assignment")

  for (const assign of assignmentNodes) {
    const left = assign.childForFieldName("left")
    const right = assign.childForFieldName("right")
    if (
      left &&
      right &&
      left.type === "identifier" &&
      right.type === "string"
    ) {
      const varName = left.text
      const value = extractStringValue(right)
      if (value !== null) {
        variables.set(varName, value)
      }
    }
  }

  return variables
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
    default:
      // Dynamic values: variable, attribute access, or function call
      return `{${node.text}}`
  }
}

/**
 * Extracts from route decorators like @app.get("/path"), @router.post("/path"), etc.
 */
export function decoratorExtractor(node: Node): RouteInfo | null {
  if (node.type !== "decorated_definition") {
    return null
  }

  // Grammar guarantees: decorated_definition always has a first child (the decorator)
  const decoratorNode = node.firstNamedChild!

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

  // Grammar guarantees: decorated_definition always has a definition field with a name
  const functionDefNode = node.childForFieldName("definition")!
  const functionName = functionDefNode.childForFieldName("name")?.text ?? ""
  const functionBody = functionDefNode.childForFieldName("body")
  const firstStatement = functionBody?.namedChildren[0]
  let docstring: string | undefined
  if (firstStatement?.type === "expression_statement") {
    const expr = firstStatement.firstNamedChild
    if (expr?.type === "string") {
      docstring = stripDocstring(expr.text)
    }
  }
  return {
    owner: objectNode.text,
    method: resolvedMethod,
    path,
    function: functionName,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
    docstring,
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
