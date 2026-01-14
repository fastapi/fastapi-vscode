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
function extractPathFromNode(node: Node): string {
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

export function decoratorExtractor(node: Node): RouteInfo | null {
  if (node.type !== "decorated_definition") {
    return null
  }

  const decoratorNode = node.firstNamedChild
  const callNodes = decoratorNode ? findNodesByType(decoratorNode, "call") : []
  const callNode = callNodes.length > 0 ? callNodes[0] : null

  if (!callNode) {
    return null
  }

  const functionNameNode = callNode.childForFieldName("function")
  const argumentsNode = callNode.childForFieldName("arguments")

  if (!functionNameNode || !argumentsNode) {
    return null
  }

  const objectNode = functionNameNode.childForFieldName("object")
  const methodNode = functionNameNode.childForFieldName("attribute")

  if (!objectNode || !methodNode) {
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
    object: objectNode.text,
    method: resolvedMethod,
    path,
    function: functionName,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  }
}

export function routerExtractor(node: Node): RouterInfo | null {
  if (node.type !== "assignment") {
    return null
  }

  const variableNameNode = node.childForFieldName("left")
  const valueNode = node.childForFieldName("right")

  if (!variableNameNode || !valueNode) {
    return null
  }

  const variableName = variableNameNode.text

  let type: RouterType = "Unknown"

  if (valueNode.type === "call") {
    const functionNameNode = valueNode.childForFieldName("function")
    const funcName = functionNameNode?.text
    if (funcName === "APIRouter" || funcName === "fastapi.APIRouter") {
      type = "APIRouter"
    } else if (funcName === "FastAPI" || funcName === "fastapi.FastAPI") {
      type = "FastAPI"
    }

    let prefix = ""
    const tags: string[] = []
    const argumentsNode = valueNode.childForFieldName("arguments")
    if (argumentsNode) {
      for (const child of argumentsNode.namedChildren) {
        if (child.type !== "keyword_argument") continue
        const argName = child.childForFieldName("name")?.text
        const argValue = child.childForFieldName("value")

        if (argName === "prefix" && argValue) {
          prefix = extractPathFromNode(argValue)
        } else if (argName === "tags" && argValue?.type === "list") {
          for (const elem of argValue.namedChildren) {
            const tagValue = extractStringValue(elem)
            if (tagValue !== null) {
              tags.push(tagValue)
            }
          }
        }
      }
    }
    if (type !== "Unknown") {
      return {
        variableName,
        type,
        prefix,
        tags,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      }
    }
  }

  return null
}

export function importExtractor(node: Node): ImportInfo | null {
  if (
    node.type !== "import_statement" &&
    node.type !== "import_from_statement"
  ) {
    return null
  }

  let modulePath = ""
  const names: string[] = []
  const namedImports: ImportedName[] = []
  let isRelative = false
  let relativeDots = 0

  if (node.type === "import_statement") {
    const nameNodes = findNodesByType(node, "dotted_name")
    for (const nameNode of nameNodes) {
      modulePath = nameNode.text
      const asNames = nameNode.text.split(".")
      names.push(asNames[0])
      namedImports.push({ name: asNames[0], alias: null })
    }
  } else if (node.type === "import_from_statement") {
    const moduleNode = node.childForFieldName("module_name")
    if (moduleNode) {
      const rawPath = moduleNode.text
      const matches = rawPath.match(/^(\.+)(.*)/)
      if (matches) {
        isRelative = true
        relativeDots = matches[1].length
        modulePath = matches[2]
      } else {
        modulePath = rawPath
      }
    }

    // Look for aliased_import nodes (e.g., "router as users_router")
    const aliasedImports = findNodesByType(node, "aliased_import")
    for (const aliased of aliasedImports) {
      const nameNode = aliased.childForFieldName("name")
      const aliasNode = aliased.childForFieldName("alias")
      if (nameNode) {
        const originalName = nameNode.text
        const aliasName = aliasNode?.text ?? null
        names.push(aliasName ?? originalName)
        namedImports.push({ name: originalName, alias: aliasName })
      }
    }
  }

  // Get non-aliased imports (dotted_name nodes not inside aliased_import)
  if (node.type === "import_from_statement") {
    const nameNodes = findNodesByType(node, "dotted_name")
    for (let i = 1; i < nameNodes.length; i++) {
      const nameNode = nameNodes[i]
      // Check if this node is inside an aliased_import
      let parent = nameNode.parent
      let isAliased = false
      while (parent) {
        if (parent.type === "aliased_import") {
          isAliased = true
          break
        }
        parent = parent.parent
      }
      if (!isAliased) {
        names.push(nameNode.text)
        namedImports.push({ name: nameNode.text, alias: null })
      }
    }
  }

  return { modulePath, names, namedImports, isRelative, relativeDots }
}

export function includeRouterExtractor(node: Node): IncludeRouterInfo | null {
  if (node.type !== "call") {
    return null
  }

  const functionNameNode = node.childForFieldName("function")
  if (!functionNameNode || functionNameNode.type !== "attribute") {
    return null
  }

  const objectNode = functionNameNode.childForFieldName("object")
  const methodNode = functionNameNode.childForFieldName("attribute")
  if (!objectNode || !methodNode || methodNode.text !== "include_router") {
    return null
  }

  const argumentsNode = node.childForFieldName("arguments")
  if (!argumentsNode) {
    return null
  }

  const routerArg = argumentsNode.namedChildren[0]
  const router = routerArg ? routerArg.text : ""

  let prefix = ""
  const tags: string[] = []
  for (const argNode of argumentsNode.namedChildren) {
    if (argNode.type === "keyword_argument") {
      const nameNode = argNode.childForFieldName("name")
      const valueNode = argNode.childForFieldName("value")
      if (nameNode?.text === "prefix" && valueNode) {
        prefix = extractPathFromNode(valueNode)
      } else if (nameNode?.text === "tags" && valueNode?.type === "list") {
        for (const elem of valueNode.namedChildren) {
          const tagValue = extractStringValue(elem)
          if (tagValue !== null) {
            tags.push(tagValue)
          }
        }
      }
    }
  }

  return {
    object: objectNode.text,
    router,
    prefix,
    tags,
  }
}

/**
 * Extracts mount() calls for subapps.
 * Pattern: app.mount("/path", subapp)
 */
export function mountExtractor(node: Node): MountInfo | null {
  if (node.type !== "call") {
    return null
  }

  const functionNameNode = node.childForFieldName("function")
  if (!functionNameNode || functionNameNode.type !== "attribute") {
    return null
  }

  const objectNode = functionNameNode.childForFieldName("object")
  const methodNode = functionNameNode.childForFieldName("attribute")
  if (!objectNode || !methodNode || methodNode.text !== "mount") {
    return null
  }

  const argumentsNode = node.childForFieldName("arguments")
  if (!argumentsNode) {
    return null
  }

  // Skip comment nodes to find actual arguments
  const args = argumentsNode.namedChildren.filter(
    (child) => child.type !== "comment",
  )

  // First arg is path, second is app
  const pathArg = args[0]
  const appArg = args[1]

  if (!pathArg || !appArg) {
    return null
  }

  return {
    object: objectNode.text,
    path: extractPathFromNode(pathArg),
    app: appArg.text,
  }
}
