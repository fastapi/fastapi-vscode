const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
  "HEAD",
] as const

export type HTTPMethod = (typeof HTTP_METHODS)[number]
export type RouteMethod = HTTPMethod | "WEBSOCKET"

// Set of valid route methods for validation (lowercase for comparison)
export const ROUTE_METHODS = new Set(
  [...HTTP_METHODS, "WEBSOCKET"].map((m) => m.toLowerCase()),
)

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
