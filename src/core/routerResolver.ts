import { log } from "../utils/logger"
import { analyzeFile } from "./analyzer"
import type { FileSystem } from "./filesystem"
import { resolveNamedImport, resolveRouterFromInit } from "./importResolver"
import type { FileAnalysis, RouterInfo, RouterNode } from "./internal"
import type { Parser } from "./parser"

export type { RouterNode }

/**
 * Finds the main FastAPI app or APIRouter in the list of routers.
 * If targetVariable is specified, only returns the router with that variable name.
 * Otherwise, prioritizes FastAPI apps over APIRouters.
 */
function findAppRouter(
  routers: RouterInfo[],
  targetVariable?: string,
): RouterInfo | undefined {
  if (targetVariable) {
    return routers.find((r) => r.variableName === targetVariable)
  }
  return (
    routers.find((r) => r.type === "FastAPI") ??
    routers.find((r) => r.type === "APIRouter")
  )
}

/**
 * Builds a router graph starting from the given entry file.
 * If targetVariable is specified, only that specific app/router will be used.
 */
export async function buildRouterGraph(
  entryFileUri: string,
  parser: Parser,
  projectRootUri: string,
  fs: FileSystem,
  targetVariable?: string,
): Promise<RouterNode | null> {
  return buildRouterGraphInternal(
    entryFileUri,
    parser,
    projectRootUri,
    fs,
    new Set(),
    targetVariable,
  )
}

/**
 * Internal recursive function to build the router graph.
 */
async function buildRouterGraphInternal(
  entryFileUri: string,
  parser: Parser,
  projectRootUri: string,
  fs: FileSystem,
  visited: Set<string>,
  targetVariable?: string,
): Promise<RouterNode | null> {
  // Check if file exists
  if (!(await fs.exists(entryFileUri))) {
    log(`File not found: "${entryFileUri}"`)
    return null
  }

  // Prevent infinite recursion on circular imports
  if (visited.has(entryFileUri)) {
    log(`Skipping already visited file: "${entryFileUri}"`)
    return null
  }

  visited.add(entryFileUri)

  // Helper to analyze a file with the filesystem
  const analyzeFileFn = (uri: string) => analyzeFile(uri, parser, fs)

  // Analyze the entry file
  let analysis = await analyzeFileFn(entryFileUri)
  if (!analysis) {
    log(`Failed to analyze file: "${entryFileUri}"`)
    return null
  }

  // Track current resolved URI (may change if following re-exports)
  let resolvedEntryUri = entryFileUri

  log(
    `Analyzed "${resolvedEntryUri}": ${analysis.routes.length} routes, ${analysis.routers.length} routers, ${analysis.includeRouters.length} include_router calls`,
  )

  // Find FastAPI instantiation (filter by targetVariable if specified)
  let appRouter = findAppRouter(analysis.routers, targetVariable)

  // If no FastAPI/APIRouter found and this is an __init__.py, check for re-exports
  if (!appRouter && entryFileUri.endsWith("__init__.py")) {
    const actualRouterUri = await resolveRouterFromInit(
      entryFileUri,
      projectRootUri,
      fs,
      analyzeFileFn,
    )
    if (actualRouterUri && !visited.has(actualRouterUri)) {
      visited.add(actualRouterUri)
      const actualAnalysis = await analyzeFileFn(actualRouterUri)
      if (actualAnalysis) {
        const actualRouter = findAppRouter(actualAnalysis.routers)
        if (actualRouter) {
          analysis = actualAnalysis
          appRouter = actualRouter
          resolvedEntryUri = actualRouterUri
        }
      }
    }
  }

  if (!appRouter || !analysis) {
    return null
  }

  // Find all routers included in the app
  // Only include routes that belong directly to the app (not to local APIRouters)
  const appRoutes = analysis.routes.filter(
    (r) => r.owner === appRouter.variableName,
  )
  const rootRouter: RouterNode = {
    filePath: resolvedEntryUri,
    variableName: appRouter.variableName,
    type: appRouter.type,
    prefix: appRouter.prefix,
    tags: appRouter.tags,
    line: appRouter.line,
    column: appRouter.column,
    routes: appRoutes.map((r) => ({
      method: r.method,
      path: r.path,
      function: r.function,
      line: r.line,
      column: r.column,
      docstring: r.docstring,
    })),
    children: [],
  }

  // Process include_router calls to find child routers
  for (const include of analysis.includeRouters) {
    log(
      `Resolving include_router: ${include.router} (prefix: ${include.prefix || "none"})`,
    )
    const childRouter = await resolveRouterReference(
      include.router,
      analysis,
      resolvedEntryUri,
      projectRootUri,
      parser,
      fs,
      visited,
    )
    if (childRouter) {
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
  }

  // Process mount() calls for subapps
  for (const mount of analysis.mounts) {
    const childRouter = await resolveRouterReference(
      mount.app,
      analysis,
      resolvedEntryUri,
      projectRootUri,
      parser,
      fs,
      visited,
    )
    if (childRouter) {
      rootRouter.children.push({
        router: childRouter,
        prefix: mount.path,
        tags: [],
      })
    }
  }

  return rootRouter
}

/**
 * Resolves a router/app reference to its RouterNode.
 * Used for include_router and mount calls.
 *
 * Handles both simple references (e.g., "router") and dotted references
 * (e.g., "api_routes.router" where api_routes is an imported module).
 */
async function resolveRouterReference(
  reference: string,
  analysis: FileAnalysis,
  currentFileUri: string,
  projectRootUri: string,
  parser: Parser,
  fs: FileSystem,
  visited: Set<string>,
): Promise<RouterNode | null> {
  const parts = reference.split(".")
  const moduleName = parts[0]
  // For dotted references like "api_routes.router", extract the attribute name
  const attributeName = parts.length > 1 ? parts.slice(1).join(".") : null

  // First, check if this is a local router defined in the same file
  const localRouter = analysis.routers.find(
    (r) => r.variableName === moduleName && r.type === "APIRouter",
  )
  if (localRouter) {
    // Filter routes that belong to this router (decorated with @router.method)
    const routerRoutes = analysis.routes.filter((r) => r.owner === moduleName)
    const routerNode: RouterNode = {
      filePath: currentFileUri,
      variableName: localRouter.variableName,
      type: localRouter.type,
      prefix: localRouter.prefix,
      tags: localRouter.tags,
      line: localRouter.line,
      column: localRouter.column,
      routes: routerRoutes.map((r) => ({
        method: r.method,
        path: r.path,
        function: r.function,
        line: r.line,
        column: r.column,
        docstring: r.docstring,
      })),
      children: [],
    }

    // Process include_router calls owned by this router (nested routers)
    const routerIncludes = analysis.includeRouters.filter(
      (inc) => inc.owner === moduleName,
    )
    for (const include of routerIncludes) {
      log(
        `Resolving nested include_router: ${include.router} (owner: ${moduleName}, prefix: ${include.prefix || "none"})`,
      )
      const childRouter = await resolveRouterReference(
        include.router,
        analysis,
        currentFileUri,
        projectRootUri,
        parser,
        fs,
        visited,
      )
      if (childRouter) {
        if (include.tags.length > 0) {
          childRouter.tags = [
            ...new Set([...childRouter.tags, ...include.tags]),
          ]
        }
        routerNode.children.push({
          router: childRouter,
          prefix: include.prefix,
          tags: include.tags,
        })
      }
    }

    return routerNode
  }

  // Otherwise, look for an imported router
  const matchingImport = analysis.imports.find((imp) =>
    imp.names.includes(moduleName),
  )

  if (!matchingImport) {
    log(`No import found for router reference: ${reference}`)
    return null
  }

  // Helper to analyze a file with the filesystem
  const analyzeFileFn = (uri: string) => analyzeFile(uri, parser, fs)

  // Find the original import name (in case moduleName is an alias)
  // e.g., "from .api_tokens import router as api_tokens_router"
  // moduleName = "api_tokens_router", originalName = "router"
  const namedImport = matchingImport.namedImports.find(
    (ni) => (ni.alias ?? ni.name) === moduleName,
  )
  const originalName = namedImport?.name ?? moduleName

  // Resolve the imported module to a file URI
  const importedFileUri = await resolveNamedImport(
    {
      modulePath: matchingImport.modulePath,
      names: [originalName],
      isRelative: matchingImport.isRelative,
      relativeDots: matchingImport.relativeDots,
    },
    currentFileUri,
    projectRootUri,
    fs,
    analyzeFileFn,
  )

  if (!importedFileUri) {
    log(`Could not resolve import: ${matchingImport.modulePath}`)
    return null
  }

  // For dotted references (e.g., "api_routes.router"), we need to find
  // the specific attribute within the resolved module
  if (attributeName) {
    // Analyze the imported file to find the router by attribute name
    const importedAnalysis = await analyzeFileFn(importedFileUri)
    if (!importedAnalysis) {
      return null
    }

    // Find the router with the matching variable name
    const targetRouter = importedAnalysis.routers.find(
      (r) => r.variableName === attributeName,
    )
    if (targetRouter) {
      // Mark as visited to prevent infinite recursion
      if (visited.has(importedFileUri)) {
        return null
      }
      visited.add(importedFileUri)

      // Get routes belonging to this router
      const routerRoutes = importedAnalysis.routes.filter(
        (r) => r.owner === attributeName,
      )
      const routerNode: RouterNode = {
        filePath: importedFileUri,
        variableName: targetRouter.variableName,
        type: targetRouter.type,
        prefix: targetRouter.prefix,
        tags: targetRouter.tags,
        line: targetRouter.line,
        column: targetRouter.column,
        routes: routerRoutes.map((r) => ({
          method: r.method,
          path: r.path,
          function: r.function,
          line: r.line,
          column: r.column,
          docstring: r.docstring,
        })),
        children: [],
      }

      // Process include_router calls owned by this router (nested routers)
      const routerIncludes = importedAnalysis.includeRouters.filter(
        (inc) => inc.owner === attributeName,
      )
      for (const include of routerIncludes) {
        log(
          `Resolving nested include_router: ${include.router} (owner: ${attributeName}, prefix: ${include.prefix || "none"})`,
        )
        const childRouter = await resolveRouterReference(
          include.router,
          importedAnalysis,
          importedFileUri,
          projectRootUri,
          parser,
          fs,
          visited,
        )
        if (childRouter) {
          if (include.tags.length > 0) {
            childRouter.tags = [
              ...new Set([...childRouter.tags, ...include.tags]),
            ]
          }
          routerNode.children.push({
            router: childRouter,
            prefix: include.prefix,
            tags: include.tags,
          })
        }
      }

      return routerNode
    }
    // If not found as a router, fall through to try building from file
  }

  return buildRouterGraphInternal(
    importedFileUri,
    parser,
    projectRootUri,
    fs,
    visited,
  )
}
