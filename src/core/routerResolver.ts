import { log } from "../utils/logger"
import { analyzeFile } from "./analyzer"
import type { FileSystem } from "./filesystem"
import { resolveNamedImport, resolveRouterFromInit } from "./importResolver"
import type {
  FileAnalysis,
  RouteInfo,
  RouterInfo,
  RouterNode,
} from "./internal"
import type { Parser } from "./parser"

export type { RouterNode }

interface ResolutionContext {
  projectRootUri: string
  fs: FileSystem
  /**
   * Set of file URIs already visited during graph traversal.
   * Prevents infinite recursion on circular imports.
   */
  visited: Set<string>
  /**
   * Cache of already-resolved RouterNodes keyed by "fileUri#variableName".
   * When we resolve a router from a file, we resolve ALL routers in that file
   * in one pass and cache them here. Subsequent requests for other variables
   * from the same file are served from the cache without re-entering the file.
   * This allows multiple routers from the same file (issue #126) while keeping
   * cycle prevention simple — a single whole-file visited set.
   */
  resolvedRouters: Map<string, RouterNode>
  /**
   * Memoized file analyzer shared across the resolution session. Each file is
   * parsed at most once even when referenced from multiple include_router calls.
   */
  analyzeFile: (uri: string) => Promise<FileAnalysis | null>
}

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

function createRouterNode(
  router: RouterInfo,
  routes: RouteInfo[],
  filePath: string,
): RouterNode {
  return {
    filePath,
    variableName: router.variableName,
    type: router.type,
    prefix: router.prefix,
    tags: router.tags,
    line: router.line,
    column: router.column,
    routes: routes.map(({ owner: _, ...rest }) => rest),
    children: [],
  }
}

async function processIncludeRouters(
  analysis: FileAnalysis,
  ownerRouter: RouterNode,
  currentFileUri: string,
  ctx: ResolutionContext,
): Promise<void> {
  const includes = analysis.includeRouters.filter(
    (inc) => inc.owner === ownerRouter.variableName,
  )
  for (const include of includes) {
    log(
      `Resolving include_router: ${include.router} (prefix: ${include.prefix || "none"})`,
    )
    const childRouter = await resolveRouterReference(
      include.router,
      analysis,
      currentFileUri,
      ctx,
    )
    if (childRouter) {
      // Merge tags from include_router call with the router's own tags
      if (include.tags.length > 0) {
        childRouter.tags = [...new Set([...childRouter.tags, ...include.tags])]
      }
      ownerRouter.children.push({
        router: childRouter,
        prefix: include.prefix,
        tags: include.tags,
      })
    }
  }
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
  const cache = new Map<string, Promise<FileAnalysis | null>>()
  const analyzeFileMemo = (uri: string): Promise<FileAnalysis | null> => {
    if (!cache.has(uri)) {
      cache.set(uri, analyzeFile(uri, parser, fs))
    }
    return cache.get(uri)!
  }

  return buildRouterGraphInternal(
    entryFileUri,
    {
      projectRootUri,
      fs,
      visited: new Set(),
      resolvedRouters: new Map(),
      analyzeFile: analyzeFileMemo,
    },
    targetVariable,
  )
}

/**
 * Internal recursive function to build the router graph.
 */
async function buildRouterGraphInternal(
  entryFileUri: string,
  ctx: ResolutionContext,
  targetVariable?: string,
): Promise<RouterNode | null> {
  const { projectRootUri, fs, visited, analyzeFile: analyzeFileFn } = ctx

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

  // Factory function: if the entrypoint variable (e.g. "app" from "main:app")
  // is assigned via a factory function (`app = create_app()`) rather than a direct
  // FastAPI() constructor call, static analysis can't determine the type. If routes
  // are decorated with @app.get(...) etc. though, we know it must be a FastAPI instance.
  if (
    !appRouter &&
    targetVariable &&
    analysis.routes.some((r) => r.owner === targetVariable)
  ) {
    appRouter = {
      variableName: targetVariable,
      type: "FastAPI",
      prefix: "",
      tags: [],
      line: 0,
      column: 0,
    }
  }

  // Factory function in another module: if the entrypoint variable is assigned via
  // `app = create_app()` where `create_app` is imported, follow the import to the
  // factory file and build the router graph from there. This works because
  // routerExtractor and includeRouterExtractor recurse into function bodies, so
  // `app = FastAPI()` and `app.include_router(...)` inside `create_app` are visible
  // when analyzing the factory file directly.
  if (!appRouter && targetVariable) {
    const factoryCall = analysis.factoryCalls.find(
      (fc) => fc.variableName === targetVariable,
    )
    if (factoryCall) {
      const matchingImport = analysis.imports.find((imp) =>
        imp.names.includes(factoryCall.functionName),
      )
      if (matchingImport) {
        const namedImport = matchingImport.namedImports.find(
          (ni) => (ni.alias ?? ni.name) === factoryCall.functionName,
        )
        const originalName = namedImport?.name ?? factoryCall.functionName
        const factoryFileUri = await resolveNamedImport(
          {
            modulePath: matchingImport.modulePath,
            names: [originalName],
            isRelative: matchingImport.isRelative,
            relativeDots: matchingImport.relativeDots,
          },
          entryFileUri,
          projectRootUri,
          fs,
          analyzeFileFn,
        )
        if (factoryFileUri && !visited.has(factoryFileUri)) {
          const factoryGraph = await buildRouterGraphInternal(
            factoryFileUri,
            ctx,
          )
          if (factoryGraph) {
            factoryGraph.variableName = targetVariable
            return factoryGraph
          }
        }
      }
    }
  }

  if (!appRouter) {
    return null
  }

  // Find all routers included in the app
  // Only include routes that belong directly to the app (not to local APIRouters)
  const appRoutes = analysis.routes.filter(
    (r) => r.owner === appRouter.variableName,
  )
  const rootRouter = createRouterNode(appRouter, appRoutes, resolvedEntryUri)

  // Process include_router calls to find child routers
  await processIncludeRouters(analysis, rootRouter, resolvedEntryUri, ctx)

  // Process mount() calls for subapps
  for (const mount of analysis.mounts) {
    const childRouter = await resolveRouterReference(
      mount.app,
      analysis,
      resolvedEntryUri,
      ctx,
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
 * Resolves all routers in a file and caches them. When we first encounter a
 * file through a named import or dotted reference, we resolve every router
 * defined in it in one pass. This lets multiple imports from the same file
 * (issue #126) be served from the cache without re-entering the file, keeping
 * the visited guard as a simple whole-file set.
 */
async function resolveAllRoutersInFile(
  importedFileUri: string,
  ctx: ResolutionContext,
): Promise<void> {
  const { visited, analyzeFile: analyzeFileFn } = ctx

  // Mark the file as visited so recursive include_router calls inside these
  // routers cannot re-enter it.
  visited.add(importedFileUri)

  const importedAnalysis = await analyzeFileFn(importedFileUri)
  if (!importedAnalysis) {
    return
  }

  for (const router of importedAnalysis.routers) {
    const cacheKey = `${importedFileUri}#${router.variableName}`
    // Skip if already resolved (shouldn't happen, but be safe)
    if (ctx.resolvedRouters.has(cacheKey)) {
      continue
    }

    const routerRoutes = importedAnalysis.routes.filter(
      (r) => r.owner === router.variableName,
    )
    const routerNode = createRouterNode(router, routerRoutes, importedFileUri)

    // Process include_router calls owned by this router (nested routers).
    // This may recursively resolve other files, which is safe because we
    // already added importedFileUri to visited above.
    await processIncludeRouters(
      importedAnalysis,
      routerNode,
      importedFileUri,
      ctx,
    )

    ctx.resolvedRouters.set(cacheKey, routerNode)
  }
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
  ctx: ResolutionContext,
): Promise<RouterNode | null> {
  const { projectRootUri, fs, visited, analyzeFile: analyzeFileFn } = ctx
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
    const routerNode = createRouterNode(
      localRouter,
      routerRoutes,
      currentFileUri,
    )

    // Process include_router calls owned by this router (nested routers)
    await processIncludeRouters(analysis, routerNode, currentFileUri, ctx)

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

  // Find the original import name (in case moduleName is an alias)
  // e.g., "from .api_tokens import router as api_tokens_router"
  // moduleName = "api_tokens_router", originalName = "router"
  //
  // namedImport is undefined for bare module imports (e.g. "import routers"),
  // where the module itself is referenced rather than a named symbol.
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

  // When we know the specific variable name to look for — either via a dotted
  // reference (e.g. "mod.router1") or a named import (e.g. "from x import router1")
  // — check the cache first, then resolve all routers in the file in one pass.
  const targetVariableName =
    attributeName ?? (namedImport !== undefined ? originalName : null)
  if (targetVariableName) {
    const cacheKey = `${importedFileUri}#${targetVariableName}`

    // Return from cache if already resolved
    const cached = ctx.resolvedRouters.get(cacheKey)
    if (cached) {
      return cached
    }

    // If the file hasn't been visited yet, resolve all its routers in one pass
    if (!visited.has(importedFileUri)) {
      await resolveAllRoutersInFile(importedFileUri, ctx)

      // Check cache again after resolving
      const resolved = ctx.resolvedRouters.get(cacheKey)
      if (resolved) {
        return resolved
      }
    }

    // targetRouter not found as a recognized router — fall through to
    // buildRouterGraphInternal with the known target variable so it can handle
    // factory functions, __init__.py re-exports, and other non-trivial patterns.
    return buildRouterGraphInternal(importedFileUri, ctx, targetVariableName)
  }

  return buildRouterGraphInternal(importedFileUri, ctx)
}
