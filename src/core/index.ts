/**
 * Public API for FastAPI path operation discovery.
 * This module can be used independently of VSCode.
 */

export { analyzeFile, analyzeTree } from "./analyzer"
export type { FileSystem } from "./filesystem"
export { clearImportCache } from "./importResolver"
export type { FileAnalysis } from "./internal"
export { Parser } from "./parser"
export { findProjectRoot } from "./pathUtils"
export { buildRouterGraph, type RouterNode } from "./routerResolver"
export { routerNodeToAppDefinition } from "./transformer"
export {
  collectRoutes,
  countRouters,
  countRoutesInRouter,
  findRouter,
} from "./treeUtils"
export type {
  AppDefinition,
  HTTPMethod,
  RouteDefinition,
  RouteMethod,
  RouterDefinition,
  SourceLocation,
} from "./types"
