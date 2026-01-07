import * as vscode from "vscode"
import { EndpointTreeProvider } from "./providers/EndpointTreeProvider"
import type { EndpointTreeItem } from "./types/endpoint"

export function activate(context: vscode.ExtensionContext) {
  const endpointProvider = new EndpointTreeProvider()
  vscode.window.registerTreeDataProvider("endpoint-explorer", endpointProvider)

  context.subscriptions.push(
    vscode.commands.registerCommand("fastapi-vscode.refreshEndpoints", () => {
      endpointProvider.refresh()
    }),

    vscode.commands.registerCommand(
      "fastapi-vscode.goToEndpoint",
      (item: EndpointTreeItem) => {
        if (item.type === "route") {
          const location = item.route.location
          const uri = vscode.Uri.file(location.filePath)
          const position = new vscode.Position(
            location.line - 1,
            location.column,
          )
          vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(position, position),
          })
        }
      },
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.copyEndpointPath",
      (item: EndpointTreeItem) => {
        if (item.type === "route") {
          vscode.env.clipboard.writeText(item.route.path)
          vscode.window.showInformationMessage(`Copied: ${item.route.path}`)
        }
      },
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.goToRouter",
      (item: EndpointTreeItem) => {
        if (item.type === "router") {
          const location = item.router.location
          const uri = vscode.Uri.file(location.filePath)
          const position = new vscode.Position(
            location.line - 1,
            location.column,
          )
          vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(position, position),
          })
        }
      },
    ),

    vscode.commands.registerCommand(
      "fastapi-vscode.copyRouterPrefix",
      (item: EndpointTreeItem) => {
        if (item.type === "router") {
          vscode.env.clipboard.writeText(item.router.prefix)
          vscode.window.showInformationMessage(`Copied: ${item.router.prefix}`)
        }
      },
    ),
  )
}

export function deactivate() {}
