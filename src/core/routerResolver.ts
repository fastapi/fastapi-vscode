import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { analyzeFile } from "./analyzer"
import { resolveNamedImport, resolveRouterFromInit } from "./importResolver"
import type { FileAnalysis, RouterInfo, RouterNode } from "./internal"
import type { Parser } from "./parser"

export type { RouterNode }

/**
 * Finds the main FastAPI app or APIRouter in the list of routers.
 */
function findAppRouter(routers: RouterInfo[]): RouterInfo | undefined {
  return routers.find((r) => r.type === "FastAPI" || r.type === "APIRouter")
}

/**
 * Builds a router graph starting from the given entry file.
 */
export function buildRouterGraph(
  entryFile: string,
  parser: Parser,
  projectRoot: string,
): RouterNode | null {
  return buildRouterGraphInternal(entryFile, parser, projectRoot, new Set())
}

/**
 * Internal recursive function to build the router graph.
 */
function buildRouterGraphInternal(
  entryFile: string,
  parser: Parser,
  projectRoot: string,
  visited: Set<string>,
): RouterNode | null {
  // Resolve the full path of the entry file if necessary
  let resolvedEntryFile = entryFile
  if (!existsSync(resolvedEntryFile) && !isAbsolute(entryFile)) {
    resolvedEntryFile = join(projectRoot, entryFile)
  }
  if (!existsSync(resolvedEntryFile)) {
    return null
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
  let appRouter = findAppRouter(analysis.routers)

  // If no FastAPI/APIRouter found and this is an __init__.py, check for re-exports
  if (!appRouter && resolvedEntryFile.endsWith("__init__.py")) {
    const actualRouterFile = resolveRouterFromInit(
      resolvedEntryFile,
      projectRoot,
      parser,
    )
    if (actualRouterFile && !visited.has(actualRouterFile)) {
      visited.add(actualRouterFile)
      const actualAnalysis = analyzeFile(actualRouterFile, parser)
      if (actualAnalysis) {
        const actualRouter = findAppRouter(actualAnalysis.routers)
        if (actualRouter) {
          analysis = actualAnalysis
          appRouter = actualRouter
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
    if (!childRouter) {
      continue
    }
    // Merge tags from include_router call with the router's own tags
    if (include.tags.length > 0) {
      childRouter.tags = [...new Set([...childRouter.tags, ...include.tags])]
    }
    rootRouter.children.push({
      router: childRouter,
      prefix: include.prefix,
      tags: include.tags,
    })
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
    if (!childRouter) {
      continue
    }
    rootRouter.children.push({
      router: childRouter,
      prefix: mount.path,
      tags: [],
    })
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

  const importedFilePath = resolveNamedImport(
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
    return null
  }

  return buildRouterGraphInternal(
    importedFilePath,
    parser,
    projectRoot,
    visited,
  )
}
