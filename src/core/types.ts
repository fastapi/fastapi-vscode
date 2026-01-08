import type { RouterType } from "./extractors"

export interface RouteInfo {
  object: string
  method: string
  path: string
  function: string
  line: number
  column: number
}

export interface RouterInfo {
  variableName: string
  type: RouterType
  prefix: string
  line: number
}

export interface IncludeRouterInfo {
  object: string
  router: string
  prefix: string
  line: number
}

export interface ImportInfo {
  module: string
  names: string[]
  isRelative: boolean
  relativeDots: number
}

export interface FileAnalysis {
  filePath: string
  routes: RouteInfo[]
  routers: RouterInfo[]
  includesRouter: IncludeRouterInfo[]
  imports: ImportInfo[]
}
