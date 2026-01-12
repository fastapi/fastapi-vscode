import fs from "node:fs"
import path from "node:path"
import { analyzeFile, type FileAnalysis } from "./analyzer"
import type { RouterType } from "./extractors"
import {
  resolveImport,
  resolveNamedImport,
  resolveRouterFromInit,
} from "./importResolver"
import type { Parser } from "./parser"

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
  children: { router: RouterNode; prefix: string }[]
}

export function buildRouterGraph(
  entryFile: string,
  parser: Parser,
  projectRoot: string,
): RouterNode | null {
  return buildRouterGraphInternal(entryFile, parser, projectRoot, new Set())
}

function buildRouterGraphInternal(
  entryFile: string,
  parser: Parser,
  projectRoot: string,
  visited: Set<string>,
): RouterNode | null {
  // Resolve the full path of the entry file if necessary
  let resolvedEntryFile = entryFile
  if (!fs.existsSync(resolvedEntryFile)) {
    // Only try joining if entryFile is not already absolute
    if (!path.isAbsolute(entryFile)) {
      resolvedEntryFile = path.join(projectRoot, entryFile)
    }
    if (!fs.existsSync(resolvedEntryFile)) {
      return null
    }
  }

  // Prevent infinite recursion on circular imports
  if (visited.has(resolvedEntryFile)) {
    return null
  }
  visited.add(resolvedEntryFile)

  // Analyze the entry file
  let analysis = analyzeFile(resolvedEntryFile, parser)
  if (!analysis) {
    return null
  }

  // Find FastAPI instantiation
  let appRouter = analysis.routers.find(
    (r) => r.type === "FastAPI" || r.type === "APIRouter",
  )

  // If no router found and this is an __init__.py, check for re-exports
  if (!appRouter && resolvedEntryFile.endsWith("__init__.py")) {
    const actualRouterFile = resolveRouterFromInit(
      resolvedEntryFile,
      projectRoot,
      parser,
    )
    if (actualRouterFile && !visited.has(actualRouterFile)) {
      visited.add(actualRouterFile)
      // Re-analyze the actual file containing the router
      analysis = analyzeFile(actualRouterFile, parser)
      if (analysis) {
        appRouter = analysis.routers.find(
          (r) => r.type === "FastAPI" || r.type === "APIRouter",
        )
        // Update the resolved path to the actual file
        if (appRouter) {
          resolvedEntryFile = actualRouterFile
        }
      }
    }
  }

  if (!appRouter || !analysis) {
    return null
  }

  // Find all routers included in the app
  const rootRouter: RouterNode = {
    filePath: resolvedEntryFile,
    variableName: appRouter.variableName,
    type: appRouter.type,
    prefix: appRouter.prefix,
    tags: appRouter.tags,
    line: appRouter.line,
    column: appRouter.column,
    routes: analysis.routes.map((r) => ({
      method: r.method,
      path: r.path,
      function: r.function,
      line: r.line,
      column: r.column,
    })),
    children: [],
  }

  // Process include_router calls to find child routers
  for (const include of analysis.includeRouters) {
    const childRouter = resolveRouterReference(
      include.router,
      analysis,
      resolvedEntryFile,
      projectRoot,
      parser,
      visited,
    )
    if (childRouter) {
      rootRouter.children.push({
        router: childRouter,
        prefix: include.prefix,
      })
    }
  }

  // Process mount() calls for subapps
  for (const mount of analysis.mounts) {
    const childRouter = resolveRouterReference(
      mount.app,
      analysis,
      resolvedEntryFile,
      projectRoot,
      parser,
      visited,
    )
    if (childRouter) {
      rootRouter.children.push({
        router: childRouter,
        prefix: mount.path,
      })
    }
  }

  return rootRouter
}

/**
 * Resolves a router/app reference to its RouterNode.
 */
function resolveRouterReference(
  reference: string,
  analysis: FileAnalysis,
  currentFile: string,
  projectRoot: string,
  parser: Parser,
  visited: Set<string>,
): RouterNode | null {
  const parts = reference.split(".")
  const moduleName = parts[0]

  const matchingImport = analysis.imports.find((imp) =>
    imp.names.includes(moduleName),
  )

  if (!matchingImport) {
    return null
  }

  let importedFilePath = resolveNamedImport(
    {
      modulePath: matchingImport.modulePath,
      names: [moduleName],
      isRelative: matchingImport.isRelative,
      relativeDots: matchingImport.relativeDots,
    },
    currentFile,
    projectRoot,
    parser,
  )

  if (!importedFilePath) {
    importedFilePath = resolveImport(
      {
        modulePath: matchingImport.modulePath,
        isRelative: matchingImport.isRelative,
        relativeDots: matchingImport.relativeDots,
      },
      currentFile,
      projectRoot,
    )
  }

  if (importedFilePath) {
    return buildRouterGraphInternal(
      importedFilePath,
      parser,
      projectRoot,
      visited,
    )
  }

  return null
}
