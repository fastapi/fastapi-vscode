/**
 * Analyzer module to extract FastAPI-related information from syntax trees.
 */

import type { Tree } from "web-tree-sitter"
import { logError } from "../utils/logger"
import {
  collectRecognizedNames,
  collectStringVariables,
  decoratorExtractor,
  getNodesByType,
  importExtractor,
  includeRouterExtractor,
  mountExtractor,
  routerExtractor,
} from "./extractors.js"
import type { FileSystem } from "./filesystem"
import type { FileAnalysis } from "./internal"
import type { Parser } from "./parser.js"

function notNull<T>(value: T | null): value is T {
  return value !== null
}

function resolveVariables(
  path: string,
  variables: Map<string, string>,
): string {
  // Match sentinel-wrapped names produced by extractPathFromNode for identifiers.
  // Using \uE000 (Unicode private use) as sentinel ensures FastAPI path parameters
  // like {id} are never substituted — only actual identifier references are resolved.
  return path.replace(
    /\uE000([^\uE000]+)\uE000/g,
    (_, name) => variables.get(name) ?? `{${name}}`,
  )
}

/** Analyze a syntax tree and extract FastAPI-related information */
export function analyzeTree(tree: Tree, filePath: string): FileAnalysis {
  const nodesByType = getNodesByType(tree.rootNode)

  // Get all decorated definitions (functions and classes with decorators)
  const decoratedDefs = nodesByType.get("decorated_definition") ?? []
  const routes = decoratedDefs.map(decoratorExtractor).filter(notNull)

  // Get all router assignments
  const assignments = nodesByType.get("assignment") ?? []
  const { fastAPINames, apiRouterNames } = collectRecognizedNames(nodesByType)
  const routers = assignments
    .map((node) => routerExtractor(node, apiRouterNames, fastAPINames))
    .filter(notNull)

  // Get all include_router and mount calls
  const callNodes = nodesByType.get("call") ?? []
  const includeRouters = callNodes.map(includeRouterExtractor).filter(notNull)
  const mounts = callNodes.map(mountExtractor).filter(notNull)

  // Get all import statements
  const importNodes = nodesByType.get("import_statement") ?? []
  const importFromNodes = nodesByType.get("import_from_statement") ?? []
  const imports = [...importNodes, ...importFromNodes]
    .map(importExtractor)
    .filter(notNull)

  const stringVariables = collectStringVariables(nodesByType)

  for (const route of routes) {
    route.path = resolveVariables(route.path, stringVariables)
  }
  for (const router of routers) {
    router.prefix = resolveVariables(router.prefix, stringVariables)
  }
  for (const ir of includeRouters) {
    ir.prefix = resolveVariables(ir.prefix, stringVariables)
  }
  for (const mount of mounts) {
    mount.path = resolveVariables(mount.path, stringVariables)
  }

  return {
    filePath,
    routes,
    routers,
    includeRouters,
    mounts,
    imports,
  }
}

/** Analyze a file given its URI string and a parser instance */
export async function analyzeFile(
  fileUri: string,
  parser: Parser,
  fs: FileSystem,
): Promise<FileAnalysis | null> {
  try {
    const content = await fs.readFile(fileUri)
    const code = new TextDecoder().decode(content)
    const tree = parser.parse(code)
    if (!tree) {
      logError(`Failed to parse file: "${fileUri}"`)
      return null
    }
    return analyzeTree(tree, fileUri)
  } catch (error) {
    logError(`Error reading file: "${fileUri}"`, error)
    return null
  }
}
