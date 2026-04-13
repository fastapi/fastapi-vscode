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

import type { FileSystem } from "./filesystem"
import type { ImportInfo } from "./internal"
import { uriDirname } from "./pathUtils"

/**
 * Cache for file existence checks to avoid repeated filesystem calls.
 * Maps URI string -> exists (true/false).
 */
const fileExistsCache = new Map<string, boolean>()

async function cachedExists(uri: string, fs: FileSystem): Promise<boolean> {
  const cached = fileExistsCache.get(uri)
  if (cached !== undefined) {
    return cached
  }
  const exists = await fs.exists(uri)
  fileExistsCache.set(uri, exists)
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
async function resolvePythonModule(
  baseUri: string,
  fs: FileSystem,
): Promise<string | null> {
  // Try module.py
  const pyUri = `${baseUri}.py`
  if (await cachedExists(pyUri, fs)) {
    return pyUri
  }
  // Try module/__init__.py
  const initUri = fs.joinPath(baseUri, "__init__.py")
  if (await cachedExists(initUri, fs)) {
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
  currentFileUri: string,
  projectRootUri: string,
  fs: FileSystem,
): string {
  let baseDirUri: string
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
    return fs.joinPath(baseDirUri, ...importInfo.modulePath.split("."))
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
  currentFileUri: string,
  projectRootUri: string,
  fs: FileSystem,
): Promise<string | null> {
  const resolvedUri = modulePathToDir(
    importInfo,
    currentFileUri,
    projectRootUri,
    fs,
  )
  const result = await resolvePythonModule(resolvedUri, fs)
  if (result) {
    return result
  }

  // Fallback for src layout: if the module wasn't found under the
  // project root, try under projectRoot/src/. This handles projects where
  // pyproject.toml is at the root but source lives under src/.
  // Only applies to absolute imports — relative imports already resolve
  // relative to the current file, not the project root.
  if (!importInfo.isRelative) {
    const srcRootUri = fs.joinPath(projectRootUri, "src")
    const srcResolvedUri = modulePathToDir(
      importInfo,
      currentFileUri,
      srcRootUri,
      fs,
    )
    return resolvePythonModule(srcResolvedUri, fs)
  }

  return null
}

/**
 * Resolves a named import to its file URI.
 * For example, from .routes import users
 * will try to resolve to routes/users.py
 *
 * @param analyzeFileFn - Function to analyze a file (injected to avoid circular dependency)
 */
export async function resolveNamedImport(
  importInfo: Pick<
    ImportInfo,
    "modulePath" | "names" | "isRelative" | "relativeDots"
  >,
  currentFileUri: string,
  projectRootUri: string,
  fs: FileSystem,
  analyzeFileFn?: (uri: string) => Promise<{ imports: ImportInfo[] } | null>,
): Promise<string | null> {
  const baseUri = await resolveImport(
    importInfo,
    currentFileUri,
    projectRootUri,
    fs,
  )

  // Calculate base directory for named import resolution.
  // For namespace packages (directories without __init__.py), baseUri will be null,
  // so we compute the directory path directly from the module path.
  const baseDirUri = baseUri
    ? uriDirname(baseUri)
    : modulePathToDir(importInfo, currentFileUri, projectRootUri, fs)

  for (const name of importInfo.names) {
    // Only try submodule resolution if baseUri is a package (__init__.py) or namespace package (null).
    // For regular .py files, the name is a variable inside the file, not a submodule.
    // Example: "from .neon import router" where neon.py defines router
    // should resolve to neon.py, not look for router.py
    const isPackage = baseUri === null || baseUri.endsWith("__init__.py")
    if (isPackage) {
      // Try direct file: from .routes import users -> routes/users.py
      const namedUri = fs.joinPath(baseDirUri, ...name.split("."))
      const resolved = await resolvePythonModule(namedUri, fs)
      if (resolved) {
        return resolved
      }
    }

    // Try re-exports: from .routes import users where routes/__init__.py re-exports users
    if (baseUri?.endsWith("__init__.py") && analyzeFileFn) {
      const analysis = await analyzeFileFn(baseUri)
      const imp = analysis && findImportByExportedName(analysis.imports, name)
      if (imp) {
        const reExportResolved = await resolveImport(
          imp,
          baseUri,
          projectRootUri,
          fs,
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
 *
 * @param analyzeFileFn - Function to analyze a file (injected to avoid circular dependency)
 */
export async function resolveRouterFromInit(
  initFileUri: string,
  projectRootUri: string,
  fs: FileSystem,
  analyzeFileFn: (uri: string) => Promise<{
    imports: ImportInfo[]
    routers: { variableName: string }[]
  } | null>,
): Promise<string | null> {
  if (!initFileUri.endsWith("__init__.py")) {
    return null
  }

  const analysis = await analyzeFileFn(initFileUri)
  // If file has routers defined, no need to follow re-exports
  if (!analysis || analysis.routers.length > 0) {
    return null
  }

  const imp = findImportByExportedName(analysis.imports, "router")
  return imp ? resolveImport(imp, initFileUri, projectRootUri, fs) : null
}
