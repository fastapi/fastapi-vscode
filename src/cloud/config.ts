import * as vscode from "vscode"
import type { Config } from "./types"

// README content aligned with fastapi-cloud-cli
const README_CONTENT = `> Why do I have a folder named ".fastapicloud" in my project? 🤔
The ".fastapicloud" folder is created when you link a directory to a FastAPI Cloud project.

> What does the "cloud.json" file contain?
The "cloud.json" file contains:
- The ID of the FastAPI app that you linked ("app_id")
- The ID of the team your FastAPI Cloud project is owned by ("team_id")

> Should I commit the ".fastapicloud" folder?
No, you should not commit the ".fastapicloud" folder to your version control system.
That's why there's a ".gitignore" file in this folder.
`

export class ConfigService {
  private static CONFIG_DIR = ".fastapicloud"
  private static CONFIG_FILE = "cloud.json"
  private fileWatcher?: vscode.FileSystemWatcher

  private _onConfigStateChanged = new vscode.EventEmitter<Config | null>()
  readonly onConfigStateChanged = this._onConfigStateChanged.event

  startWatching(workspaceRoot: vscode.Uri) {
    const pattern = new vscode.RelativePattern(
      workspaceRoot,
      `${ConfigService.CONFIG_DIR}/${ConfigService.CONFIG_FILE}`,
    )
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern)
    this.fileWatcher.onDidChange(async () => {
      const config = await this.getConfig(workspaceRoot)
      this._onConfigStateChanged.fire(config)
    })
    this.fileWatcher.onDidCreate(async () => {
      const config = await this.getConfig(workspaceRoot)
      this._onConfigStateChanged.fire(config)
    })
    this.fileWatcher.onDidDelete(() => this._onConfigStateChanged.fire(null))
  }

  async getConfig(workspaceRoot: vscode.Uri): Promise<Config | null> {
    try {
      const uri = vscode.Uri.joinPath(
        workspaceRoot,
        ConfigService.CONFIG_DIR,
        ConfigService.CONFIG_FILE,
      )
      const data = await vscode.workspace.fs.readFile(uri)
      return JSON.parse(new TextDecoder().decode(data))
    } catch (err) {
      console.error("[FastAPI Cloud] Failed to read config:", err)
      return null
    }
  }

  async writeConfig(workspaceRoot: vscode.Uri, config: Config) {
    try {
      const dirUri = vscode.Uri.joinPath(
        workspaceRoot,
        ConfigService.CONFIG_DIR,
      )
      await vscode.workspace.fs.createDirectory(dirUri)

      // cloud.json
      const configUri = vscode.Uri.joinPath(dirUri, ConfigService.CONFIG_FILE)
      await vscode.workspace.fs.writeFile(
        configUri,
        new TextEncoder().encode(JSON.stringify(config)),
      )

      // README.md
      const readmeUri = vscode.Uri.joinPath(dirUri, "README.md")
      await vscode.workspace.fs.writeFile(
        readmeUri,
        new TextEncoder().encode(README_CONTENT),
      )

      // .gitignore
      const gitignoreUri = vscode.Uri.joinPath(dirUri, ".gitignore")
      await vscode.workspace.fs.writeFile(
        gitignoreUri,
        new TextEncoder().encode("*"),
      )
    } catch {
      // Failed to write config
    }
  }

  async deleteConfig(workspaceRoot: vscode.Uri) {
    try {
      const dirUri = vscode.Uri.joinPath(
        workspaceRoot,
        ConfigService.CONFIG_DIR,
      )
      await vscode.workspace.fs.delete(dirUri, { recursive: true })
    } catch {
      // No project linked
    }
  }
  dispose() {
    this.fileWatcher?.dispose()
    this._onConfigStateChanged.dispose()
  }
}
