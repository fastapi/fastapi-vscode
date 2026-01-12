import fs from "node:fs"
import type { Tree } from "web-tree-sitter"
import { findNodesByType } from "./astUtils"
import {
  decoratorExtractor,
  type ImportInfo,
  type IncludeRouterInfo,
  importExtractor,
  includeRouterExtractor,
  type MountInfo,
  mountExtractor,
  type RouteInfo,
  type RouterInfo,
  routerExtractor,
} from "./extractors.js"
import type { Parser } from "./parser.js"

export interface FileAnalysis {
  filePath: string
  routes: RouteInfo[]
  routers: RouterInfo[]
  includeRouters: IncludeRouterInfo[]
  mounts: MountInfo[]
  imports: ImportInfo[]
}

// Type guard to filter out nulls
function notNull<T>(value: T | null): value is T {
  return value !== null
}

export function analyzeTree(tree: Tree, filePath: string): FileAnalysis {
  const rootNode = tree.rootNode

  const decoratedDefs = findNodesByType(rootNode, "decorated_definition")
  const routes = decoratedDefs.map(decoratorExtractor).filter(notNull)

  const assignments = findNodesByType(rootNode, "assignment")
  const routers = assignments.map(routerExtractor).filter(notNull)

  const callNodes = findNodesByType(rootNode, "call")
  const includeRouters = callNodes.map(includeRouterExtractor).filter(notNull)
  const mounts = callNodes.map(mountExtractor).filter(notNull)

  const importNodes = findNodesByType(rootNode, "import_statement")
  const importFromNodes = findNodesByType(rootNode, "import_from_statement")
  const imports = [...importNodes, ...importFromNodes]
    .map(importExtractor)
    .filter(notNull)

  return { filePath, routes, routers, includeRouters, mounts, imports }
}

export function analyzeFile(
  filePath: string,
  parser: Parser,
): FileAnalysis | null {
  try {
    const code = fs.readFileSync(filePath, "utf-8")
    const tree = parser.parse(code)
    if (!tree) {
      return null
    }
    return analyzeTree(tree, filePath)
  } catch {
    return null
  }
}
