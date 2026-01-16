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
 * Checks if a test path matches an endpoint path pattern.
 * Endpoint paths may contain path parameters like {item_id} which match any segment.
 *
 * Examples:
 *   pathMatchesEndpoint("/items/123", "/items/{item_id}") -> true
 *   pathMatchesEndpoint("/items/123/details", "/items/{item_id}") -> false
 *   pathMatchesEndpoint("/users/abc/posts/456", "/users/{user_id}/posts/{post_id}") -> true
 *   pathMatchesEndpoint("/items/", "/items/{item_id}") -> false
 */
export function pathMatchesEndpoint(
  testPath: string,
  endpointPath: string,
): boolean {
  const testSegments = testPath.split("/").filter(Boolean)
  const endpointSegments = endpointPath.split("/").filter(Boolean)

  // Segment counts must match
  if (testSegments.length !== endpointSegments.length) {
    return false
  }

  return endpointSegments.every((seg, index) => {
    // Path parameter (e.g., {item_id}) matches any segment
    if (seg.startsWith("{") && seg.endsWith("}")) {
      return true
    }
    // Literal segments must match exactly
    return seg === testSegments[index]
  })
}

/**
 * Finds the Python project root by walking up from the entry file
 * until we find a directory without __init__.py (or hit the workspace root).
 * This is the directory from which absolute imports are resolved.
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

  // If the entry file's directory doesn't have __init__.py, it's a top-level script
  if (!(await fs.exists(fs.joinPath(dirUri, "__init__.py")))) {
    return dirUri
  }

  // Walk up until we find a directory whose parent doesn't have __init__.py
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
