import * as vscode from "vscode"
import { log } from "../../utils/logger"
import { AUTH_PROVIDER_ID } from "../auth"
import { StatusBar } from "../constants"
import type { WorkspaceState } from "../types"

const STATUS_BAR_UPDATE_DEBOUNCE_MS = 100

export class StatusBarManager {
  private activeEditorListener?: vscode.Disposable
  private statusBarUpdateTimeout?: NodeJS.Timeout

  constructor(
    private statusBarItem: vscode.StatusBarItem,
    private getState: (uri: vscode.Uri) => WorkspaceState,
    private getActiveWorkspaceFolder: () => vscode.Uri | null,
  ) {}

  show(): void {
    this.statusBarItem.text = StatusBar.DEFAULT
    this.statusBarItem.show()

    if (!this.activeEditorListener) {
      this.activeEditorListener = vscode.window.onDidChangeActiveTextEditor(
        () => {
          // Debounce status bar updates to avoid excessive auth calls
          if (this.statusBarUpdateTimeout) {
            clearTimeout(this.statusBarUpdateTimeout)
          }
          this.statusBarUpdateTimeout = setTimeout(() => {
            this.update()
          }, STATUS_BAR_UPDATE_DEBOUNCE_MS)
        },
      )
    }
  }

  async update(): Promise<void> {
    try {
      const session = await vscode.authentication.getSession(
        AUTH_PROVIDER_ID,
        [],
        { silent: true },
      )

      if (!session) {
        this.statusBarItem.text = StatusBar.SIGN_IN
        return
      }

      const activeFolder = this.getActiveWorkspaceFolder()
      if (!activeFolder) {
        this.statusBarItem.text = StatusBar.SETUP
        return
      }

      const state = this.getState(activeFolder)

      switch (state.status) {
        case "not_configured":
        case "error":
        case "refreshing":
          this.statusBarItem.text = StatusBar.SETUP
          break
        case "linked":
          this.statusBarItem.text = `$(cloud) ${state.app.slug}`
          break
        case "not_found":
          this.statusBarItem.text = StatusBar.WARNING
          break
      }
    } catch (err) {
      // Auth provider may not be ready yet
      log(`Failed to update status bar: ${err}`)
      this.statusBarItem.text = StatusBar.SIGN_IN
    }
  }

  dispose(): void {
    this.activeEditorListener?.dispose()
    if (this.statusBarUpdateTimeout) {
      clearTimeout(this.statusBarUpdateTimeout)
    }
    this.statusBarItem.dispose()
  }
}
