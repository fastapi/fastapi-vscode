import * as vscode from "vscode"

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
 * Gets the directory (parent) of a URI.
 * Equivalent to path.dirname() but works with URIs in all environments.
 */
export function uriDirname(uri: vscode.Uri): vscode.Uri {
  const path = uri.path
  const lastSlash = path.lastIndexOf("/")
  if (lastSlash <= 0) {
    return uri.with({ path: "/" })
  }
  return uri.with({ path: path.slice(0, lastSlash) })
}

/**
 * Checks if a URI is within or equal to a base directory URI.
 * Uses URI path comparison to work across all platforms.
 */
export function isWithinDirectory(
  fileUri: vscode.Uri,
  baseDirUri: vscode.Uri,
): boolean {
  const normalizedFile = fileUri.path.replace(/\/+$/, "") || "/"
  const normalizedBase = baseDirUri.path.replace(/\/+$/, "") || "/"

  if (normalizedFile === normalizedBase) {
    return true
  }
  return normalizedFile.startsWith(`${normalizedBase}/`)
}

export async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch {
    return false
  }
}

/**
 * Finds the Python project root by walking up from the entry file
 * until we find a directory without __init__.py (or hit the workspace root).
 * This is the directory from which absolute imports are resolved.
 */
export async function findProjectRoot(
  entryUri: vscode.Uri,
  workspaceRootUri: vscode.Uri,
): Promise<vscode.Uri> {
  let dirUri = uriDirname(entryUri)

  // If the entry file's directory doesn't have __init__.py, it's a top-level script
  if (!(await fileExists(vscode.Uri.joinPath(dirUri, "__init__.py")))) {
    return dirUri
  }

  // Walk up until we find a directory whose parent doesn't have __init__.py
  while (
    isWithinDirectory(dirUri, workspaceRootUri) &&
    dirUri.path !== workspaceRootUri.path
  ) {
    const parentUri = uriDirname(dirUri)
    if (!(await fileExists(vscode.Uri.joinPath(parentUri, "__init__.py")))) {
      return parentUri
    }
    dirUri = parentUri
  }

  return workspaceRootUri
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
