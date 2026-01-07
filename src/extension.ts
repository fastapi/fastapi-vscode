import * as vscode from "vscode"

export function activate(context: vscode.ExtensionContext) {
  console.log("FastAPI extension is now active!")

  const disposable = vscode.commands.registerCommand(
    "fastapi-vscode.helloWorld",
    () => {
      vscode.window.showInformationMessage(
        "Hello World from FastAPI Extension!",
      )
    },
  )

  context.subscriptions.push(disposable)
}

export function deactivate() {}
