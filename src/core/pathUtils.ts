import { existsSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"

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
 * Checks if a path is within or equal to a base directory.
 * Uses relative path calculation to avoid false positives from string prefix matching.
 */
export function isWithinDirectory(filePath: string, baseDir: string): boolean {
  const rel = relative(baseDir, filePath)
  // If relative path starts with "..", the path is outside baseDir
  return !rel.startsWith("..") && !rel.startsWith(sep)
}

/**
 * Finds the Python project root by walking up from the entry file
 * until we find a directory without __init__.py (or hit the workspace root).
 * This is the directory from which absolute imports are resolved.
 */
export function findProjectRoot(
  entryPath: string,
  workspaceRoot: string,
): string {
  let dir = dirname(entryPath)

  // If the entry file's directory doesn't have __init__.py, it's a top-level script
  if (!existsSync(join(dir, "__init__.py"))) {
    return dir
  }

  // Walk up until we find a directory whose parent doesn't have __init__.py
  while (isWithinDirectory(dir, workspaceRoot) && dir !== workspaceRoot) {
    const parent = dirname(dir)
    if (!existsSync(join(parent, "__init__.py"))) {
      return parent
    }
    dir = parent
  }

  return workspaceRoot
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
