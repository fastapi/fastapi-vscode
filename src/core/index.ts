// Public API for FastAPI endpoint discovery
// This module can be used independently of VSCode

// Re-export core types
export type {
  AppDefinition,
  HTTPMethod,
  RouteDefinition,
  RouteMethod,
  RouterDefinition,
  SourceLocation,
} from "../types/endpoint"
export { analyzeFile, analyzeTree, type FileAnalysis } from "./analyzer"
export { Parser } from "./parser"
export { buildRouterGraph, type RouterNode } from "./routerResolver"
export { routerNodeToAppDefinition } from "./transformer"
