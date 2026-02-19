/**
 * Public API types for FastAPI path operation discovery.
 */

export type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD"

export type RouteMethod = HTTPMethod | "WEBSOCKET"

export interface SourceLocation {
  filePath: string
  line: number
  column: number
}

export interface RouteDefinition {
  method: RouteMethod
  path: string
  functionName: string
  location: SourceLocation
  docstring?: string
}

export interface RouterDefinition {
  name: string
  prefix: string
  tags: string[]
  location: SourceLocation
  routes: RouteDefinition[]
  children: RouterDefinition[] // Nested routers (by prefix hierarchy)
}

export interface AppDefinition {
  name: string
  filePath: string
  workspaceFolder: string // Needed for multi-root workspaces
  routers: RouterDefinition[]
  routes: RouteDefinition[] // Direct routes on the app
}
