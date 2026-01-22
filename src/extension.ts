/**
 * VSCode extension entry point for FastAPI endpoint discovery.
 */

import * as vscode from "vscode"
import { discoverFastAPIApps } from "./appDiscovery"
import { clearImportCache } from "./core/importResolver"
import { Parser } from "./core/parser"
import { stripLeadingDynamicSegments } from "./core/pathUtils"
import type { AppDefinition, SourceLocation } from "./core/types"
import {
  type EndpointTreeItem,
  EndpointTreeProvider,
  METHOD_ICONS,
} from "./providers/endpointTreeProvider"
import { TestCodeLensProvider } from "./providers/testCodeLensProvider"
import { disposeLogger, log } from "./utils/logger"

let parserService: Parser | null = null

function navigateToLocation(location: SourceLocation): void {
  const uri = vscode.Uri.parse(location.filePath)
  const position = new vscode.Position(location.line - 1, location.column)
  vscode.window.showTextDocument(uri, {
    selection: new vscode.Range(position, position),
  })
}

export async function activate(context: vscode.ExtensionContext) {
  const extensionVersion =
    vscode.extensions.getExtension("FastAPILabs.fastapi-vscode")?.packageJSON
      ?.version ?? "unknown"
  log(
    `FastAPI extension ${extensionVersion} activated (VS Code ${vscode.version})`,
  )

  parserService = new Parser()

  // Read Wasm files via VS Code's virtual filesystem API
  const [coreWasm, pythonWasm] = await Promise.all([
    vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "dist",
        "wasm",
        "web-tree-sitter.wasm",
      ),
    ),
    vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(
        context.extensionUri,
        "dist",
        "wasm",
        "tree-sitter-python.wasm",
      ),
    ),
  ])

  await parserService.init({
    core: coreWasm,
    python: pythonWasm,
  })

  // Discover apps and create providers
  const apps = await discoverFastAPIApps(parserService)

  // Create grouping function that groups by workspace folder if there are multiple folders
  const groupApps = (apps: AppDefinition[]) => {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length <= 1) {
      // Single workspace folder: show apps directly at root
      return apps.map((app) => ({ type: "app" as const, app }))
    }

    // Multi-root workspace: group by workspace folder
    const grouped = apps.reduce((acc, app) => {
      const existing = acc.get(app.workspaceFolder) ?? []
      acc.set(app.workspaceFolder, [...existing, app])
      return acc
    }, new Map<string, AppDefinition[]>())

    // Create workspace items with folder names
    return Array.from(grouped.entries()).map(([folderPath, apps]) => {
      const folder = workspaceFolders.find((f) => f.uri.fsPath === folderPath)
      const label = folder?.name ?? folderPath.split("/").pop() ?? folderPath
      return { type: "workspace" as const, label, apps }
    })
  }

  const endpointProvider = new EndpointTreeProvider(apps, groupApps)
  const codeLensProvider = new TestCodeLensProvider(parserService, apps)

  // File watcher for auto-refresh
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null
  const triggerRefresh = () => {
    if (refreshTimeout) clearTimeout(refreshTimeout)
    refreshTimeout = setTimeout(async () => {
      if (!parserService) return
      const newApps = await discoverFastAPIApps(parserService)
      endpointProvider.setApps(newApps, groupApps)
      codeLensProvider.setApps(newApps)
    }, 300)
  }

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.py")
  watcher.onDidChange(triggerRefresh)
  watcher.onDidCreate(triggerRefresh)
  watcher.onDidDelete(triggerRefresh)

  // Re-discover when workspace folders change (handles late folder availability in browser)
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(triggerRefresh),
  )

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
      "fastapi-vscode.searchEndpoints",
      async () => {
        const workspacePrefix =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ""
        const items = endpointProvider
          .getAllRoutes()
          .map((route) => {
            const path = stripLeadingDynamicSegments(route.path)
            return {
              label: `$(${METHOD_ICONS[route.method]}) ${route.method.toUpperCase()} ${path}`,
              description: route.functionName,
              detail: vscode.Uri.parse(route.location.filePath)
                .fsPath.replace(workspacePrefix, "")
                .replace(/^\//, ""),
              route,
              sortKey: `${path} ${route.method}`,
            }
          })
          .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

        if (items.length === 0) {
          vscode.window.showInformationMessage(
            "No FastAPI endpoints found in the workspace.",
          )
          return
        }

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: "Search FastAPI endpoints...",
        })
        if (selected) {
          navigateToLocation(selected.route.location)
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
  log("Extension deactivated")
  parserService?.dispose()
  parserService = null
  clearImportCache()
  disposeLogger()
}
