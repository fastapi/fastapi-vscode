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
}

export interface RouterDefinition {
  name: string
  prefix: string
  location: SourceLocation
  routes: RouteDefinition[]
}

export interface AppDefinition {
  name: string
  filePath: string
  workspaceFolder: string // Needed for multi-root workspaces
  routers: RouterDefinition[]
  routes: RouteDefinition[] // Direct routes on the app
}

export type EndpointTreeItem =
  | { type: "workspace"; label: string; apps: AppDefinition[] }
  | { type: "app"; app: AppDefinition }
  | { type: "router"; router: RouterDefinition }
  | { type: "route"; route: RouteDefinition }
