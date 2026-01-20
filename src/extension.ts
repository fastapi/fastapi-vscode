/**
 * VSCode extension entry point for FastAPI endpoint discovery.
 */

import * as vscode from "vscode"
import { discoverFastAPIApps } from "./appDiscovery"
import { clearImportCache } from "./core/importResolver"
import { Parser } from "./core/parser"
import { stripLeadingDynamicSegments } from "./core/pathUtils"
import type { SourceLocation } from "./core/types"
import {
  type EndpointTreeItem,
  EndpointTreeProvider,
} from "./providers/EndpointTreeProvider"
import { TestCodeLensProvider } from "./providers/TestCodeLensProvider"

let parserService: Parser | null = null

function navigateToLocation(location: SourceLocation): void {
  const uri = vscode.Uri.file(location.filePath)
  const position = new vscode.Position(location.line - 1, location.column)
  vscode.window.showTextDocument(uri, {
    selection: new vscode.Range(position, position),
  })
}

export async function activate(context: vscode.ExtensionContext) {
  // Initialize parser
  parserService = new Parser()
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

  // Discover apps and create providers
  const apps = await discoverFastAPIApps(parserService)
  const endpointProvider = new EndpointTreeProvider(apps)
  const codeLensProvider = new TestCodeLensProvider(parserService, apps)

  // File watcher for auto-refresh
  let refreshTimeout: NodeJS.Timeout | null = null
  const triggerRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout)
    refreshTimeout = setTimeout(async () => {
      if (!parserService) return
      const newApps = await discoverFastAPIApps(parserService)
      endpointProvider.setApps(newApps)
      codeLensProvider.setApps(newApps)
    }, 500)
  }

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.py")
  watcher.onDidChange(triggerRefresh)
  watcher.onDidCreate(triggerRefresh)
  watcher.onDidDelete(triggerRefresh)

  // Tree view
  const treeView = vscode.window.createTreeView("endpoint-explorer", {
    treeDataProvider: endpointProvider,
  })

  // CodeLens provider (optional)
  const config = vscode.workspace.getConfiguration("fastapi")
  if (config.get<boolean>("showTestCodeLenses", true)) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: "python", pattern: "**/*test*.py" },
        codeLensProvider,
      ),
    )
  }

  // Register disposables and commands
  context.subscriptions.push(
    watcher,
    treeView,
    registerCommands(endpointProvider, codeLensProvider),
  )
}

function registerCommands(
  endpointProvider: EndpointTreeProvider,
  codeLensProvider: TestCodeLensProvider,
): vscode.Disposable {
  return vscode.Disposable.from(
    vscode.commands.registerCommand(
      "fastapi-vscode.refreshEndpoints",
      async () => {
        if (!parserService) return
        clearImportCache()
        const newApps = await discoverFastAPIApps(parserService)
        endpointProvider.setApps(newApps)
        codeLensProvider.setApps(newApps)
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

    vscode.commands.registerCommand("fastapi-vscode.reportIssue", () => {
      vscode.env.openExternal(
        vscode.Uri.parse(
          "https://github.com/fastapi/fastapi-vscode/issues/new?labels=bug",
        ),
      )
    }),

    vscode.commands.registerCommand("fastapi-vscode.toggleRouters", () => {
      endpointProvider.toggleRouters()
    }),

    vscode.commands.registerCommand(
      "fastapi-vscode.goToDefinition",
      (
        locations: vscode.Location[],
        fromUri: vscode.Uri,
        fromPosition: vscode.Position,
      ) => {
        vscode.commands.executeCommand(
          "editor.action.goToLocations",
          fromUri,
          fromPosition,
          locations,
          locations.length === 1 ? "goto" : "peek",
          "No matching route found",
        )
      },
    ),
  )
}

export function deactivate() {
  parserService?.dispose()
  parserService = null
  clearImportCache()
}
