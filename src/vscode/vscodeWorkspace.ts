import * as vscode from "vscode"
import type { Workspace } from "../core/workspace"

/**
 * VS Code implementation of the Workspace interface.
 * Uses vscode.workspace for virtual filesystem support (vscode.dev, remote containers).
 */

export const vscodeWorkspace: Workspace = {
  get workspaceFolders() {
    return vscode.workspace.workspaceFolders?.map((folder) => ({
      uri: folder.uri.toString(),
      name: folder.name,
    }))
  },

  getFastAPIEntrypoint(folderUri: string): string | undefined {
    const config = vscode.workspace.getConfiguration(
      "fastapi",
      vscode.Uri.parse(folderUri),
    )
    return config.get<string>("entryPoint")
  },

  async findFiles(
    folderUri: string,
    include: string,
    exclude?: string,
  ): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(vscode.Uri.parse(folderUri), include),
      exclude
        ? new vscode.RelativePattern(vscode.Uri.parse(folderUri), exclude)
        : undefined,
    )
    return uris.map((uri) => uri.toString())
  },

  showWarning(message: string): void {
    vscode.window.showWarningMessage(message)
  },

  getActiveEditor(): string | null {
    const editor = vscode.window.activeTextEditor
    if (editor && editor.document.languageId === "python") {
      return editor.document.uri.toString()
    }
    return null
  },
}
