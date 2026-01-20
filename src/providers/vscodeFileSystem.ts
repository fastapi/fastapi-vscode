/**
 * VS Code implementation of the FileSystem interface.
 * Uses vscode.workspace.fs for virtual filesystem support (vscode.dev, remote containers).
 */

import * as vscode from "vscode"
import type { FileSystem } from "../core/filesystem"

export const vscodeFileSystem: FileSystem = {
  async readFile(uri: string): Promise<Uint8Array> {
    return vscode.workspace.fs.readFile(vscode.Uri.parse(uri))
  },

  async exists(uri: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.parse(uri))
      return true
    } catch {
      return false
    }
  },

  joinPath(base: string, ...segments: string[]): string {
    return vscode.Uri.joinPath(vscode.Uri.parse(base), ...segments).toString()
  },

  dirname(uri: string): string {
    const parsed = vscode.Uri.parse(uri)
    const path = parsed.path
    const lastSlash = path.lastIndexOf("/")
    if (lastSlash <= 0) {
      return parsed.with({ path: "/" }).toString()
    }
    return parsed.with({ path: path.slice(0, lastSlash) }).toString()
  },
}
