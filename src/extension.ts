/**
 * VSCode extension entry point for FastAPI endpoint discovery.
 */

import * as vscode from "vscode"
import { Parser } from "./core/parser"
import { stripLeadingDynamicSegments } from "./core/pathUtils"
import { buildRouterGraph } from "./core/routerResolver"
import { routerNodeToAppDefinition } from "./core/transformer"
import type { AppDefinition, SourceLocation } from "./core/types"
import {
  type EndpointTreeItem,
  EndpointTreeProvider,
} from "./providers/EndpointTreeProvider"

async function discoverFastAPIApps(parser: Parser): Promise<AppDefinition[]> {
  const apps: AppDefinition[] = []
  const workspaceFolders = vscode.workspace.workspaceFolders

  if (!workspaceFolders) {
    return apps
  }

  const defaultPatterns = [
    "main.py",
    "app/main.py",
    "api/main.py",
    "src/main.py",
    "backend/app/main.py",
  ]

  for (const folder of workspaceFolders) {
    const config = vscode.workspace.getConfiguration("fastapi", folder.uri)
    const customEntryPoint = config.get<string>("entryPoint")
    const patterns = customEntryPoint ? [customEntryPoint] : defaultPatterns

    for (const pattern of patterns) {
      // Handle both relative patterns and absolute paths
      const entryPath = pattern.startsWith("/")
        ? pattern
        : vscode.Uri.joinPath(folder.uri, pattern).fsPath
      const projectRoot = entryPath.split("/").slice(0, -2).join("/")
      const routerNode = buildRouterGraph(entryPath, parser, projectRoot)

      if (routerNode) {
        apps.push(routerNodeToAppDefinition(routerNode, folder.uri.fsPath))
        break
      }
    }
  }

  return apps
}

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

export async function activate(context: vscode.ExtensionContext) {
  const parserService = new Parser()
  await parserService.init({
    core: vscode.Uri.joinPath(
      context.extensionUri,
      "dist",
      "wasm",
      "web-tree-sitter.wasm",
    ).fsPath,
    python: vscode.Uri.joinPath(
      context.extensionUri,
      "dist",
      "wasm",
      "tree-sitter-python.wasm",
    ).fsPath,
  })

  // Discover FastAPI endpoints from workspace
  const apps = await discoverFastAPIApps(parserService)
  const endpointProvider = new EndpointTreeProvider(apps)

  const treeView = vscode.window.createTreeView("endpoint-explorer", {
    treeDataProvider: endpointProvider,
  })

  context.subscriptions.push(
    treeView,

    vscode.commands.registerCommand(
      "fastapi-vscode.refreshEndpoints",
      async () => {
        const newApps = await discoverFastAPIApps(parserService)
        endpointProvider.setApps(newApps)
      },
    ),

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
          vscode.env.clipboard.writeText(
            stripLeadingDynamicSegments(item.route.path),
          )
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
          vscode.env.clipboard.writeText(
            stripLeadingDynamicSegments(item.router.prefix),
          )
        }
      },
    ),

    vscode.commands.registerCommand("fastapi-vscode.toggleRouters", () => {
      endpointProvider.toggleRouters()
    }),
  )
}

export function deactivate() {}
