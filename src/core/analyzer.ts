/**
 * Analyzer module to extract FastAPI-related information from syntax trees.
 */

import type { Tree } from "web-tree-sitter"
import { logError } from "../utils/logger"
import {
  decoratorExtractor,
  findNodesByType,
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

/** Analyze a syntax tree and extract FastAPI-related information */
export function analyzeTree(tree: Tree, filePath: string): FileAnalysis {
  const rootNode = tree.rootNode

  // Get all decorated definitions (functions and classes with decorators)
  const decoratedDefs = findNodesByType(rootNode, "decorated_definition")
  const routes = decoratedDefs.map(decoratorExtractor).filter(notNull)

  // Get all router assignments
  const assignments = findNodesByType(rootNode, "assignment")
  const routers = assignments.map(routerExtractor).filter(notNull)

  // Get all include_router and mount calls
  const callNodes = findNodesByType(rootNode, "call")
  const includeRouters = callNodes.map(includeRouterExtractor).filter(notNull)
  const mounts = callNodes.map(mountExtractor).filter(notNull)

  // Get all import statements
  const importNodes = findNodesByType(rootNode, "import_statement")
  const importFromNodes = findNodesByType(rootNode, "import_from_statement")
  const imports = [...importNodes, ...importFromNodes]
    .map(importExtractor)
    .filter(notNull)

  return { filePath, routes, routers, includeRouters, mounts, imports }
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
