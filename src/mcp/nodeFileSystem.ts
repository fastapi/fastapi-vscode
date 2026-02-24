/**
 *  Node.js implementation of the FileSystem interface for use in the MCP.
 *  This allows the MCP to perform file operations in a Node.js environment,
 *  such as when running as a separate process or in a non-VS Code context.
 */

import * as fs from "fs/promises"
import * as path from "path"
import type { FileSystem } from "../core/filesystem"

export const nodeFileSystem: FileSystem = {
  async readFile(uri: string): Promise<Uint8Array> {
    const file = new URL(uri).pathname
    return fs.readFile(file)
  },

  async exists(uri: string): Promise<boolean> {
    const file = new URL(uri).pathname
    try {
      await fs.access(file)
      return true
    } catch {
      return false
    }
  },

  joinPath(base: string, ...segments: string[]): string {
    const basePath = new URL(base).pathname
    return `file://${path.join(basePath, ...segments)}`
  },

  dirname(uri: string): string {
    const dirPath = new URL(uri).pathname
    return `file://${path.dirname(dirPath)}`
  },
}
