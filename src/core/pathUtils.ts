/**
 * Pure path utilities that don't require filesystem access.
 * These work with URI strings and path strings.
 */

/**
 * Strips leading dynamic segments (like {settings.API_V1_STR}) from a path.
 *
 * Examples:
 *   "{settings.API_V1_STR}/users/{id}" -> "/users/{id}"
 *   "{BASE}/api/items" -> "/api/items"
 *   "/users/{id}/posts" -> "/users/{id}/posts" (unchanged)
 *   "{settings.API_V1_STR}" -> "/"
 */
export function stripLeadingDynamicSegments(path: string): string {
  return path.replace(/^(\{[^}]+\})+/, "") || "/"
}

/**
 * Gets the directory (parent) of a URI string.
 * Works with any URI scheme (file://, vscode-vfs://, etc.).
 */
export function uriDirname(uri: string): string {
  // Parse the URI to separate scheme/authority from path
  const match = uri.match(/^([^:]+:\/\/[^/]*)(.*)$/)
  if (!match) {
    // Fallback for simple paths
    const lastSlash = uri.lastIndexOf("/")
    return lastSlash <= 0 ? "/" : uri.slice(0, lastSlash)
  }

  const [, prefix, path] = match
  const lastSlash = path.lastIndexOf("/")
  if (lastSlash <= 0) {
    return `${prefix}/`
  }
  return `${prefix}${path.slice(0, lastSlash)}`
}

/**
 * Extracts the path component from a URI string.
 */
export function uriPath(uri: string): string {
  const match = uri.match(/^[^:]+:\/\/[^/]*(.*)$/)
  return match ? match[1] : uri
}

/**
 * Checks if a URI is within or equal to a base directory URI.
 * Uses URI path comparison to work across all platforms.
 */
export function isWithinDirectory(
  fileUri: string,
  baseDirUri: string,
): boolean {
  const filePath = uriPath(fileUri).replace(/\/+$/, "") || "/"
  const basePath = uriPath(baseDirUri).replace(/\/+$/, "") || "/"

  if (filePath === basePath) {
    return true
  }
  return filePath.startsWith(`${basePath}/`)
}

/**
 * Gets the first N segments of a path.
 *
 * Examples:
 *   getPathSegments("/integrations/neon/foo", 2) -> "/integrations/neon"
 *   getPathSegments("/users", 1) -> "/users"
 *   getPathSegments("/a/b/c", 5) -> "/a/b/c" (returns full path if count >= segments)
 */
export function getPathSegments(path: string, count: number): string {
  const segments = path.split("/").filter(Boolean)
  if (count >= segments.length) return path
  return `/${segments.slice(0, count).join("/")}`
}

/**
 * Counts the number of segments in a path.
 *
 * Examples:
 *   countSegments("/integrations/neon") -> 2
 *   countSegments("/") -> 0
 *   countSegments("/users") -> 1
 */
export function countSegments(path: string): number {
  return path.split("/").filter(Boolean).length
}

/**
 * Checks if a test path matches a path operation path pattern.
 * Both paths may contain dynamic segments like {item_id} or {settings.API_V1_STR}
 * which match any segment.
 *
 * Leading dynamic prefixes (like {settings.API_V1_STR}) and query strings are stripped
 * before comparison.
 *
 * Examples:
 *   pathMatchesPathOperation("/items/123", "/items/{item_id}") -> true
 *   pathMatchesPathOperation("/items/123/details", "/items/{item_id}") -> false
 *   pathMatchesPathOperation("/users/abc/posts/456", "/users/{user_id}/posts/{post_id}") -> true
 *   pathMatchesPathOperation("/items/", "/items/{item_id}") -> false
 *   pathMatchesPathOperation("{settings.API}/apps/{id}", "/apps/{app_id}") -> true
 *   pathMatchesPathOperation("{BASE}/users/{id}", "/users/{user_id}") -> true
 *   pathMatchesPathOperation("/teams/?owner=true", "/teams") -> true (query string stripped)
 */
export function pathMatchesPathOperation(
  testPath: string,
  pathOperationPath: string,
): boolean {
  // Strip query string from test path (e.g., "/teams/?owner=true" -> "/teams/")
  const testPathWithoutQuery = testPath.split("?")[0]

  // Strip leading dynamic segments (e.g., {settings.API_V1_STR}) for comparison
  const testSegments = stripLeadingDynamicSegments(testPathWithoutQuery)
    .split("/")
    .filter(Boolean)
  const pathOperationSegments = stripLeadingDynamicSegments(pathOperationPath)
    .split("/")
    .filter(Boolean)

  // Segment counts must match
  if (testSegments.length !== pathOperationSegments.length) {
    return false
  }

  // Compare each segment positionally
  return testSegments.every((testSeg, i) => {
    const pathOperationSeg = pathOperationSegments[i]
    // Dynamic segments (e.g., {id}, {app.id}) match any value
    const testIsDynamic = testSeg.startsWith("{") && testSeg.endsWith("}")
    const pathOperationIsDynamic =
      pathOperationSeg.startsWith("{") && pathOperationSeg.endsWith("}")
    if (testIsDynamic || pathOperationIsDynamic) {
      return true
    }
    return testSeg === pathOperationSeg
  })
}

/**
 * Finds the Python project root (the directory from which absolute imports
 * are resolved) by walking up from the entry file toward the workspace root.
 */
export async function findProjectRoot(
  entryUri: string,
  workspaceRootUri: string,
  fs: {
    exists(uri: string): Promise<boolean>
    joinPath(base: string, ...segments: string[]): string
  },
): Promise<string> {
  let dirUri = uriDirname(entryUri)

  // No __init__.py — could be a namespace package. Walk up toward the
  // workspace root to find a pyproject.toml; if found, that directory is
  // the Python project root. Otherwise fall back to the entry dir.
  if (!(await fs.exists(fs.joinPath(dirUri, "__init__.py")))) {
    let searchDir = dirUri
    while (isWithinDirectory(searchDir, workspaceRootUri)) {
      if (await fs.exists(fs.joinPath(searchDir, "pyproject.toml"))) {
        return searchDir
      }
      if (uriPath(searchDir) === uriPath(workspaceRootUri)) break
      searchDir = uriDirname(searchDir)
    }
    return dirUri
  }

  // __init__.py is present, so this is a traditional package. Walk up until
  // we find a directory whose parent doesn't have __init__.py — that parent
  // is the project root (the directory Python adds to sys.path).
  while (
    isWithinDirectory(dirUri, workspaceRootUri) &&
    uriPath(dirUri) !== uriPath(workspaceRootUri)
  ) {
    const parentUri = uriDirname(dirUri)
    if (!(await fs.exists(fs.joinPath(parentUri, "__init__.py")))) {
      return parentUri
    }
    dirUri = parentUri
  }

  return workspaceRootUri
}
