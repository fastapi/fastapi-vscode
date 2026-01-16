/**
 * Analyzer module to extract FastAPI-related information from syntax trees.
 */

import * as vscode from "vscode"
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

/** Analyze a file given its URI and a parser instance */
export async function analyzeFile(
  fileUri: vscode.Uri,
  parser: Parser,
): Promise<FileAnalysis | null> {
  try {
    const content = await vscode.workspace.fs.readFile(fileUri)
    const code = new TextDecoder().decode(content)
    const tree = parser.parse(code)
    if (!tree) {
      logError(`Failed to parse file: "${fileUri.fsPath}"`)
      return null
    }
    return analyzeTree(tree, fileUri.fsPath)
  } catch (error) {
    logError(`Error reading file: "${fileUri.fsPath}"`, error)
    return null
  }
}
