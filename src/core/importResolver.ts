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

import * as vscode from "vscode"
import { analyzeFile } from "./analyzer"
import type { ImportInfo } from "./internal"
import type { Parser } from "./parser"
import { uriDirname } from "./pathUtils"

/**
 * Cache for file existence checks to avoid repeated filesystem calls.
 * Maps URI string -> exists (true/false).
 */
const fileExistsCache = new Map<string, boolean>()

async function cachedExists(uri: vscode.Uri): Promise<boolean> {
  const key = uri.toString()
  const cached = fileExistsCache.get(key)
  if (cached !== undefined) {
    return cached
  }
  try {
    await vscode.workspace.fs.stat(uri)
    fileExistsCache.set(key, true)
    return true
  } catch {
    fileExistsCache.set(key, false)
    return false
  }
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
async function resolvePythonModule(
  baseUri: vscode.Uri,
): Promise<vscode.Uri | null> {
  // Try module.py
  const pyUri = baseUri.with({ path: `${baseUri.path}.py` })
  if (await cachedExists(pyUri)) {
    return pyUri
  }
  // Try module/__init__.py
  const initUri = vscode.Uri.joinPath(baseUri, "__init__.py")
  if (await cachedExists(initUri)) {
    return initUri
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
 * Converts a Python module path to a filesystem directory URI.
 *
 * Examples (modulePath, relativeDots → result):
 *   Absolute: ("app.api.routes", 0) from projectRoot="/project" → "/project/app/api/routes"
 *   Relative: ("routes", 1) from "/project/app/api/main.py" → "/project/app/api/routes"
 *   Relative: ("routes", 2) from "/project/app/api/main.py" → "/project/app/routes"
 */
function modulePathToDir(
  importInfo: Pick<ImportInfo, "modulePath" | "isRelative" | "relativeDots">,
  currentFileUri: vscode.Uri,
  projectRootUri: vscode.Uri,
): vscode.Uri {
  let baseDirUri: vscode.Uri
  if (importInfo.isRelative) {
    // For relative imports, go up 'relativeDots' directories from current file
    baseDirUri = uriDirname(currentFileUri)
    for (let i = 1; i < importInfo.relativeDots; i++) {
      baseDirUri = uriDirname(baseDirUri)
    }
  } else {
    baseDirUri = projectRootUri
  }

  if (importInfo.modulePath) {
    return vscode.Uri.joinPath(baseDirUri, ...importInfo.modulePath.split("."))
  }
  return baseDirUri
}

/**
 * Resolves a module import to its file URI.
 *
 * Examples:
 *   "from app.api import routes" → "/project/app/api/routes.py" or "/project/app/api/routes/__init__.py"
 *   "from .routes import users" → "/project/app/api/routes.py" or "/project/app/api/routes/__init__.py"
 *
 * Returns null if the module doesn't exist (may be a namespace package).
 */
export async function resolveImport(
  importInfo: Pick<ImportInfo, "modulePath" | "isRelative" | "relativeDots">,
  currentFileUri: vscode.Uri,
  projectRootUri: vscode.Uri,
): Promise<vscode.Uri | null> {
  const resolvedUri = modulePathToDir(
    importInfo,
    currentFileUri,
    projectRootUri,
  )
  return resolvePythonModule(resolvedUri)
}

/**
 * Resolves a named import to its file URI.
 * For example, from .routes import users
 * will try to resolve to routes/users.py
 */
export async function resolveNamedImport(
  importInfo: Pick<
    ImportInfo,
    "modulePath" | "names" | "isRelative" | "relativeDots"
  >,
  currentFileUri: vscode.Uri,
  projectRootUri: vscode.Uri,
  parser?: Parser,
): Promise<vscode.Uri | null> {
  const baseUri = await resolveImport(
    importInfo,
    currentFileUri,
    projectRootUri,
  )

  // Calculate base directory for named import resolution.
  // For namespace packages (directories without __init__.py), baseUri will be null,
  // so we compute the directory path directly from the module path.
  const baseDirUri = baseUri
    ? uriDirname(baseUri)
    : modulePathToDir(importInfo, currentFileUri, projectRootUri)

  for (const name of importInfo.names) {
    // Try direct file: from .routes import users -> routes/users.py
    const namedUri = vscode.Uri.joinPath(baseDirUri, ...name.split("."))
    const resolved = await resolvePythonModule(namedUri)
    if (resolved) {
      return resolved
    }

    // Try re-exports: from .routes import users where routes/__init__.py re-exports users
    if (baseUri?.path.endsWith("__init__.py") && parser) {
      const analysis = await analyzeFile(baseUri, parser)
      const imp = analysis && findImportByExportedName(analysis.imports, name)
      if (imp) {
        const reExportResolved = await resolveImport(
          imp,
          baseUri,
          projectRootUri,
        )
        if (reExportResolved) {
          return reExportResolved
        }
      }
    }
  }

  // Fall back to base module resolution
  return baseUri
}

/**
 * When an __init__.py has no router definitions but re-exports a router,
 * this function finds the actual file containing the router.
 *
 * For example, if integrations/__init__.py contains:
 *   from .router import router as router
 * This will return the path to integrations/router.py
 */
export async function resolveRouterFromInit(
  initFileUri: vscode.Uri,
  projectRootUri: vscode.Uri,
  parser: Parser,
): Promise<vscode.Uri | null> {
  if (!initFileUri.path.endsWith("__init__.py")) {
    return null
  }

  const analysis = await analyzeFile(initFileUri, parser)
  // If file has routers defined, no need to follow re-exports
  if (!analysis || analysis.routers.length > 0) {
    return null
  }

  const imp = findImportByExportedName(analysis.imports, "router")
  return imp ? resolveImport(imp, initFileUri, projectRootUri) : null
}
