import * as vscode from "vscode"

/**
 * UI dialog wrappers to avoid overload complexity in tests.
 * These wrap VS Code's window methods with simpler signatures that are easier to stub.
 */
export const ui = {
  showErrorMessage: async (
    message: string,
    ...items: string[]
  ): Promise<string | undefined> => {
    return vscode.window.showErrorMessage(message, ...items)
  },

  showInformationMessage: async (
    message: string,
    ...items: string[]
  ): Promise<string | undefined> => {
    return vscode.window.showInformationMessage(message, ...items)
  },

  showQuickPick: async <T extends vscode.QuickPickItem>(
    items: readonly T[],
    options?: vscode.QuickPickOptions,
  ): Promise<T | undefined> => {
    return vscode.window.showQuickPick(items, options)
  },

  showWarningMessage: async (
    message: string,
    options: vscode.MessageOptions,
    ...items: string[]
  ): Promise<string | undefined> => {
    return vscode.window.showWarningMessage(message, options, ...items)
  },
}
