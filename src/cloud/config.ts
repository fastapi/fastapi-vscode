import * as vscode from "vscode"
import { log } from "../utils/logger"
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

const CONFIG_DIR = ".fastapicloud"
const CONFIG_FILE = "cloud.json"

export class ConfigService {
  private fileWatcher?: vscode.FileSystemWatcher

  private _onConfigStateChanged = new vscode.EventEmitter<Config | null>()
  readonly onConfigStateChanged = this._onConfigStateChanged.event

  startWatching(workspaceRoot: vscode.Uri) {
    const pattern = new vscode.RelativePattern(
      workspaceRoot,
      `${CONFIG_DIR}/${CONFIG_FILE}`,
    )
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern)
    const fireConfig = async () => {
      const config = await this.getConfig(workspaceRoot)
      this._onConfigStateChanged.fire(config)
    }
    this.fileWatcher.onDidChange(fireConfig)
    this.fileWatcher.onDidCreate(fireConfig)
    this.fileWatcher.onDidDelete(() => this._onConfigStateChanged.fire(null))
  }

  async getConfig(workspaceRoot: vscode.Uri): Promise<Config | null> {
    try {
      const uri = vscode.Uri.joinPath(workspaceRoot, CONFIG_DIR, CONFIG_FILE)
      const data = await vscode.workspace.fs.readFile(uri)
      return JSON.parse(new TextDecoder().decode(data))
    } catch (err) {
      log(`Failed to read config: ${err}`)
      return null
    }
  }

  async writeConfig(workspaceRoot: vscode.Uri, config: Config) {
    try {
      const dirUri = vscode.Uri.joinPath(workspaceRoot, CONFIG_DIR)
      await vscode.workspace.fs.createDirectory(dirUri)

      const configUri = vscode.Uri.joinPath(dirUri, CONFIG_FILE)
      await vscode.workspace.fs.writeFile(
        configUri,
        new TextEncoder().encode(JSON.stringify(config)),
      )

      const readmeUri = vscode.Uri.joinPath(dirUri, "README.md")
      await vscode.workspace.fs.writeFile(
        readmeUri,
        new TextEncoder().encode(README_CONTENT),
      )

      const gitignoreUri = vscode.Uri.joinPath(dirUri, ".gitignore")
      await vscode.workspace.fs.writeFile(
        gitignoreUri,
        new TextEncoder().encode("*"),
      )
    } catch (err) {
      log(`Failed to write config: ${err}`)
    }
  }

  async deleteConfig(workspaceRoot: vscode.Uri) {
    try {
      const dirUri = vscode.Uri.joinPath(workspaceRoot, CONFIG_DIR)
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
