/**
 * Node implementation of the Workspace interface.
 * Used for MCP server, non-VS Code environments.
 */

import fg from "fast-glob"
import path from "path"
import type { Workspace } from "../core/workspace"

export function nodeWorkspace(workspacePath: string): Workspace {
  return {
    get workspaceFolders() {
      return [
        {
          uri: `file://${workspacePath}`,
          name: path.basename(workspacePath),
        },
      ]
    },

    getFastAPIEntrypoint(_folderUri: string): string | undefined {
      return undefined
    },

    async findFiles(
      folderUri: string,
      include: string,
      exclude?: string,
    ): Promise<string[]> {
      const basePath = new URL(folderUri).pathname
      const files = await fg(include, {
        cwd: basePath,
        ignore: exclude ? [exclude] : [],
        absolute: true,
      })

      return files.map((f) => `file://${f}`)
    },

    showWarning(_message: string): void {
      return
    },

    getActiveEditor(): null {
      return null
    },
  }
}
