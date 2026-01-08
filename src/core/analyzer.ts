import fs from "fs"
import type { Tree } from "web-tree-sitter"
import { findNodesByType } from "./astUtils"
import {
  decoratorExtractor,
  importExtractor,
  includeRouterExtractor,
  routerExtractor,
} from "./extractors.js"
import type { Parser } from "./parser.js"

export interface FileAnalysis {
  filePath: string
  routes: NonNullable<ReturnType<typeof decoratorExtractor>>[]
  routers: NonNullable<ReturnType<typeof routerExtractor>>[]
  includeRouters: NonNullable<ReturnType<typeof includeRouterExtractor>>[]
  imports: NonNullable<ReturnType<typeof importExtractor>>[]
}

export function analyzeTree(tree: Tree, filePath: string): FileAnalysis {
  const rootNode = tree.rootNode

  const decoratedDefs = findNodesByType(rootNode, "decorated_definition")
  const routes = decoratedDefs
    .map((node) => decoratorExtractor(node))
    .filter((r) => r !== null)

  // Extract router/app instantiations from assignments
  const assignments = findNodesByType(rootNode, "assignment")
  const routers = assignments
    .map((node) => routerExtractor(node))
    .filter((r) => r !== null)

  // Extract include_router calls
  const callNodes = findNodesByType(rootNode, "call")
  const includeRouters = callNodes
    .map((node) => includeRouterExtractor(node))
    .filter((r) => r !== null)

  // Extract imports
  const importNodes = findNodesByType(rootNode, "import_statement")
  const importFromNodes = findNodesByType(rootNode, "import_from_statement")
  const allImportNodes = importNodes.concat(importFromNodes)
  const imports = allImportNodes
    .map((node) => importExtractor(node))
    .filter((r) => r !== null)

  return {
    filePath,
    routes: routes as NonNullable<ReturnType<typeof decoratorExtractor>>[],
    routers: routers as NonNullable<ReturnType<typeof routerExtractor>>[],
    includeRouters: includeRouters as NonNullable<
      ReturnType<typeof includeRouterExtractor>
    >[],
    imports: imports as NonNullable<ReturnType<typeof importExtractor>>[],
  }
}

export function analyzeFile(
  filePath: string,
  parser: Parser,
): FileAnalysis | null {
  try {
    const code = fs.readFileSync(filePath, "utf-8")
    const tree = parser.parse(code)
    if (!tree) {
      console.error(`Failed to parse file: ${filePath}`)
      return null
    }
    return analyzeTree(tree, filePath)
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error)
    return null
  }
}
