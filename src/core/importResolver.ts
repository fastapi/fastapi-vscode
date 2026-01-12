import * as fs from "node:fs"
import { analyzeFile } from "./analyzer"
import type { Parser } from "./parser"

export function resolveImport(
  importInfo: { modulePath: string; isRelative: boolean; relativeDots: number },
  currentFilePath: string,
  projectRoot: string,
): string | null {
  let resolvedPath = ""

  if (importInfo.isRelative) {
    // For relative imports, slice off 'relativeDots' path segments:
    // - 1 dot: remove filename → current directory
    // - 2 dots: remove filename + 1 dir → parent directory
    const currentDir = currentFilePath
      .split("/")
      .slice(0, -1 * importInfo.relativeDots)
      .join("/")
    const moduleSuffix = importInfo.modulePath
      ? `/${importInfo.modulePath.replace(/\./g, "/")}`
      : ""
    resolvedPath = `${currentDir}${moduleSuffix}`
  } else {
    resolvedPath = `${projectRoot}/${importInfo.modulePath.replace(/\./g, "/")}`
  }

  // check for .py file
  if (fs.existsSync(`${resolvedPath}.py`)) {
    return `${resolvedPath}.py`
  }

  // check for __init__.py in directory
  if (fs.existsSync(`${resolvedPath}/__init__.py`)) {
    return `${resolvedPath}/__init__.py`
  }

  return null
}

export function resolveNamedImport(
  importInfo: {
    modulePath: string
    names: string[]
    isRelative: boolean
    relativeDots: number
  },
  currentFilePath: string,
  projectRoot: string,
  parser?: Parser,
): string | null {
  const basePath = resolveImport(importInfo, currentFilePath, projectRoot)
  if (!basePath) {
    return null
  }

  for (const name of importInfo.names) {
    const baseDir = basePath.split("/").slice(0, -1).join("/")
    const namedPath = baseDir + "/" + name.replace(/\./g, "/")

    // check for .py file
    if (fs.existsSync(`${namedPath}.py`)) {
      return `${namedPath}.py`
    }

    // check for __init__.py in directory
    if (fs.existsSync(`${namedPath}/__init__.py`)) {
      return `${namedPath}/__init__.py`
    }

    // If the base path is an __init__.py, check for re-exports
    if (basePath.endsWith("__init__.py") && parser) {
      const resolved = resolveReExport(basePath, name, projectRoot, parser)
      if (resolved) {
        return resolved
      }
    }
  }

  return null
}

/**
 * Resolves a re-export from an __init__.py file.
 * For example, if __init__.py contains:
 *   from .users import router as users_router
 * And we're looking for "users_router", this will return the path to users.py
 */
function resolveReExport(
  initFilePath: string,
  exportedName: string,
  projectRoot: string,
  parser: Parser,
): string | null {
  const analysis = analyzeFile(initFilePath, parser)
  if (!analysis) {
    return null
  }

  // Look through imports to find one that exports the name we're looking for
  for (const imp of analysis.imports) {
    for (const namedImport of imp.namedImports) {
      // Check if this import provides the name we're looking for
      // Either as an alias or as the original name
      const providedName = namedImport.alias ?? namedImport.name
      if (providedName === exportedName) {
        // Found it! Now resolve where it comes from
        // The modulePath in the import is relative to the __init__.py location
        const resolved = resolveImport(
          {
            modulePath: imp.modulePath,
            isRelative: imp.isRelative,
            relativeDots: imp.relativeDots,
          },
          initFilePath,
          projectRoot,
        )
        if (resolved) {
          return resolved
        }
      }
    }
  }

  return null
}

/**
 * When an __init__.py has no router definitions but re-exports a router,
 * this function finds the actual file containing the router.
 * For example, if integrations/__init__.py contains:
 *   from .router import router as router
 * This will return the path to integrations/router.py
 */
export function resolveRouterFromInit(
  initFilePath: string,
  projectRoot: string,
  parser: Parser,
): string | null {
  if (!initFilePath.endsWith("__init__.py")) {
    return null
  }

  const analysis = analyzeFile(initFilePath, parser)
  if (!analysis) {
    return null
  }

  // If this file has routers defined, no need to follow re-exports
  if (analysis.routers.length > 0) {
    return null
  }

  // Look for a re-exported "router" variable
  for (const imp of analysis.imports) {
    for (const namedImport of imp.namedImports) {
      // Look for imports that provide a "router" name
      const providedName = namedImport.alias ?? namedImport.name
      if (providedName === "router") {
        // Resolve where the router comes from
        const resolved = resolveImport(
          {
            modulePath: imp.modulePath,
            isRelative: imp.isRelative,
            relativeDots: imp.relativeDots,
          },
          initFilePath,
          projectRoot,
        )
        if (resolved) {
          return resolved
        }
      }
    }
  }

  return null
}
