import * as vscode from "vscode"
import { EndpointTreeProvider } from "./providers/EndpointTreeProvider"
// TODO: Replace with real endpoint discovery service
import {
  groupAppsByWorkspace,
  mockApps,
} from "./test/fixtures/mockEndpointData"
import type { EndpointTreeItem, SourceLocation } from "./types/endpoint"

function navigateToLocation(location: SourceLocation): void {
  if (!location.filePath) {
    vscode.window.showErrorMessage("File path is missing for the endpoint.")
    return
  }
  const uri = vscode.Uri.file(location.filePath)
  const position = new vscode.Position(location.line - 1, location.column)
  vscode.window.showTextDocument(uri, {
    selection: new vscode.Range(position, position),
  })
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  const endpointProvider = new EndpointTreeProvider(
    mockApps,
    groupAppsByWorkspace,
  )

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "endpoint-explorer",
      endpointProvider,
    ),

    vscode.commands.registerCommand("fastapi-vscode.refreshEndpoints", () => {
      endpointProvider.refresh()
    }),

    vscode.commands.registerCommand(
      "fastapi-vscode.goToEndpoint",
      (item: EndpointTreeItem) => {
        if (item.type === "route") {
          navigateToLocation(item.route.location)
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
          navigateToLocation(item.router.location)
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

    vscode.commands.registerCommand("fastapi-vscode.reportIssue", () => {
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://github.com/fastapi/fastapi-vscode/issues/new?labels=bug",
        ),
      )
    }),
  )
}

export function deactivate() {}
