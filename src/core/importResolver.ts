/**
 * Python import resolution for static analysis.
 *
 * Resolves Python import statements to file paths without executing code.
 * Handles relative imports, absolute imports, namespace packages (PEP 420),
 * and re-exports from __init__.py files.
 *
 * Resolution order (matching Python):
 * 1. module.py (direct file)
 * 2. module/__init__.py (package)
 * 3. module/ without __init__.py (namespace package)
 */

import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { analyzeFile } from "./analyzer"
import type { ImportInfo } from "./internal"
import type { Parser } from "./parser"

/**
 * Cache for file existence checks to avoid repeated filesystem calls.
 * Maps file path -> exists (true/false).
 */
const fileExistsCache = new Map<string, boolean>()

function cachedExistsSync(path: string): boolean {
  if (fileExistsCache.has(path)) {
    return fileExistsCache.get(path)!
  }
  const exists = existsSync(path)
  fileExistsCache.set(path, exists)
  return exists
}

/** Clears the file existence cache. Call when files may have changed. */
export function clearImportCache(): void {
  fileExistsCache.clear()
}

/**
 * Resolves a module path to its Python file.
 * Checks for direct .py file first, then package __init__.py
 * (matching Python's import resolution order).
 */
function resolvePythonModule(basePath: string): string | null {
  const pyPath = `${basePath}.py`
  if (cachedExistsSync(pyPath)) {
    return pyPath
  }
  const initPath = join(basePath, "__init__.py")
  if (cachedExistsSync(initPath)) {
    return initPath
  }
  return null
}

/** Finds an import that provides a given exported name (for re-exports in __init__.py) */
function findImportByExportedName(
  imports: ImportInfo[],
  name: string,
): ImportInfo | undefined {
  return imports.find((imp) =>
    imp.namedImports.some(
      (namedImport) => (namedImport.alias ?? namedImport.name) === name,
    ),
  )
}

/**
 * Converts a Python module path to a filesystem directory path.
 *
 * Examples (modulePath, relativeDots → result):
 *   Absolute: ("app.api.routes", 0) from projectRoot="/project" → "/project/app/api/routes"
 *   Relative: ("routes", 1) from "/project/app/api/main.py" → "/project/app/api/routes"
 *   Relative: ("routes", 2) from "/project/app/api/main.py" → "/project/app/routes"
 */
function modulePathToDir(
  importInfo: Pick<ImportInfo, "modulePath" | "isRelative" | "relativeDots">,
  currentFilePath: string,
  projectRoot: string,
): string {
  let baseDir: string
  if (importInfo.isRelative) {
    // For relative imports, go up 'relativeDots' directories from current file
    baseDir = dirname(currentFilePath)
    for (let i = 1; i < importInfo.relativeDots; i++) {
      baseDir = dirname(baseDir)
    }
  } else {
    baseDir = projectRoot
  }

  if (importInfo.modulePath) {
    return join(baseDir, ...importInfo.modulePath.split("."))
  }
  return baseDir
}

/**
 * Resolves a module import to its file path.
 *
 * Examples:
 *   "from app.api import routes" → "/project/app/api/routes.py" or "/project/app/api/routes/__init__.py"
 *   "from .routes import users" → "/project/app/api/routes.py" or "/project/app/api/routes/__init__.py"
 *
 * Returns null if the module doesn't exist (may be a namespace package).
 */
export function resolveImport(
  importInfo: Pick<ImportInfo, "modulePath" | "isRelative" | "relativeDots">,
  currentFilePath: string,
  projectRoot: string,
): string | null {
  const resolvedPath = modulePathToDir(importInfo, currentFilePath, projectRoot)
  return resolvePythonModule(resolvedPath)
}

/**
 * Resolves a named import to its file path.
 * For example, from .routes import users
 * will try to resolve to routes/users.py
 */
export function resolveNamedImport(
  importInfo: Pick<
    ImportInfo,
    "modulePath" | "names" | "isRelative" | "relativeDots"
  >,
  currentFilePath: string,
  projectRoot: string,
  parser?: Parser,
): string | null {
  const basePath = resolveImport(importInfo, currentFilePath, projectRoot)

  // Calculate base directory for named import resolution.
  // For namespace packages (directories without __init__.py), basePath will be null,
  // so we compute the directory path directly from the module path.
  const baseDir = basePath
    ? dirname(basePath)
    : modulePathToDir(importInfo, currentFilePath, projectRoot)

  for (const name of importInfo.names) {
    // Try direct file: from .routes import users -> routes/users.py
    const namedPath = join(baseDir, ...name.split("."))
    const resolved = resolvePythonModule(namedPath)
    if (resolved) {
      return resolved
    }

    // Try re-exports: from .routes import users where routes/__init__.py re-exports users
    if (basePath?.endsWith("__init__.py") && parser) {
      const analysis = analyzeFile(basePath, parser)
      const imp = analysis && findImportByExportedName(analysis.imports, name)
      if (imp) {
        const reExportResolved = resolveImport(imp, basePath, projectRoot)
        if (reExportResolved) {
          return reExportResolved
        }
      }
    }
  }

  // Fall back to base module resolution
  return basePath
}

/**
 * When an __init__.py has no router definitions but re-exports a router,
 * this function finds the actual file containing the router.
 *
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
  // If file has routers defined, no need to follow re-exports
  if (!analysis || analysis.routers.length > 0) {
    return null
  }

  const imp = findImportByExportedName(analysis.imports, "router")
  return imp ? resolveImport(imp, initFilePath, projectRoot) : null
}
