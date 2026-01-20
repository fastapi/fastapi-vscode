/**
 * Abstract filesystem interface for platform-agnostic file operations.
 * This allows the core logic to work with any filesystem implementation
 * (VS Code virtual filesystem, Node.js fs, Zed, etc.).
 */

/**
 * Filesystem abstraction for reading files and checking existence.
 * Implementations should use URI strings as identifiers.
 */
export interface FileSystem {
  /** Read a file's contents as bytes */
  readFile(uri: string): Promise<Uint8Array>

  /** Check if a file or directory exists */
  exists(uri: string): Promise<boolean>

  /** Join path segments to a base URI */
  joinPath(base: string, ...segments: string[]): string

  /** Get the parent directory of a URI */
  dirname(uri: string): string
}
