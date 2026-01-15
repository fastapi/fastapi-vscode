/**
 * Internal types and utilities for AST analysis.
 * These are implementation details not exposed in the public API.
 */

import type { RouteMethod } from "./types"

/**
 * Valid HTTP methods plus WEBSOCKET, used for decorator validation.
 * Lowercase for case-insensitive comparison during extraction.
 */
export const ROUTE_METHODS: ReadonlySet<string> = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "websocket",
])

/** Normalizes a method string to a valid RouteMethod. Returns "GET" for invalid methods. */
export function normalizeMethod(method: string): RouteMethod {
  return ROUTE_METHODS.has(method.toLowerCase())
    ? (method.toUpperCase() as RouteMethod)
    : "GET"
}

export interface RouteInfo {
  // The router or app that owns this route
  owner: string
  method: string
  path: string
  function: string
  line: number
  column: number
}

export type RouterType = "APIRouter" | "FastAPI" | "Unknown"

export interface RouterInfo {
  variableName: string
  type: RouterType
  prefix: string
  tags: string[]
  line: number
  column: number
}

export interface ImportedName {
  name: string
  alias: string | null
}

export interface ImportInfo {
  modulePath: string
  names: string[]
  namedImports: ImportedName[]
  isRelative: boolean
  relativeDots: number
}

export interface IncludeRouterInfo {
  // The app or router with the include_router call
  owner: string
  router: string
  prefix: string
  tags: string[]
}

export interface MountInfo {
  // The app that owns this sub application mount
  owner: string
  path: string
  app: string
}

export interface FileAnalysis {
  filePath: string
  routes: RouteInfo[]
  routers: RouterInfo[]
  includeRouters: IncludeRouterInfo[]
  mounts: MountInfo[]
  imports: ImportInfo[]
}

export interface RouterNode {
  filePath: string
  variableName: string
  type: RouterType
  prefix: string
  tags: string[]
  line: number
  column: number
  routes: {
    method: string
    path: string
    function: string
    line: number
    column: number
  }[]
  children: { router: RouterNode; prefix: string; tags: string[] }[]
}

export interface EntryPoint {
  filePath: string
  variableName?: string
}
