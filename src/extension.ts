/**
 * VSCode extension entry point for FastAPI endpoint discovery.
 */

import { existsSync } from "node:fs"
import { sep } from "node:path"
import * as vscode from "vscode"
import { clearImportCache } from "./core/importResolver"
import { Parser } from "./core/parser"
import { findProjectRoot, stripLeadingDynamicSegments } from "./core/pathUtils"
import { buildRouterGraph } from "./core/routerResolver"
import { routerNodeToAppDefinition } from "./core/transformer"
import type { AppDefinition, SourceLocation } from "./core/types"
import {
  type EndpointTreeItem,
  EndpointTreeProvider,
} from "./providers/EndpointTreeProvider"
import { TestCodeLensProvider } from "./providers/TestCodeLensProvider"

async function discoverFastAPIApps(parser: Parser): Promise<AppDefinition[]> {
  const apps: AppDefinition[] = []
  const workspaceFolders = vscode.workspace.workspaceFolders

  if (!workspaceFolders) {
    return apps
  }

  for (const folder of workspaceFolders) {
    const config = vscode.workspace.getConfiguration("fastapi", folder.uri)
    const customEntryPoint = config.get<string>("entryPoint")

    let candidates: string[] = []

    if (customEntryPoint) {
      // Use custom entry point if specified
      const entryPath = customEntryPoint.startsWith("/")
        ? customEntryPoint
        : vscode.Uri.joinPath(folder.uri, customEntryPoint).fsPath

      if (!existsSync(entryPath)) {
        vscode.window.showWarningMessage(
          `FastAPI entry point not found: ${customEntryPoint}`,
        )
        continue
      }

      candidates = [entryPath]
    } else {
      // Scan for main.py and __init__.py files (likely FastAPI entry points)
      const mainFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, "**/main.py"),
      )
      const initFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, "**/__init__.py"),
      )
      // Prefer main.py, then __init__.py, sorted by path depth (shallower first)
      candidates = [...mainFiles, ...initFiles]
        .map((uri) => uri.fsPath)
        .sort((a, b) => a.split(sep).length - b.split(sep).length)
    }

    for (const entryPath of candidates) {
      const projectRoot = findProjectRoot(entryPath, folder.uri.fsPath)
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
  const uri = vscode.Uri.file(location.filePath)
  const position = new vscode.Position(location.line - 1, location.column)
  vscode.window.showTextDocument(uri, {
    selection: new vscode.Range(position, position),
  })
}

let parserService: Parser | null = null

export async function activate(context: vscode.ExtensionContext) {
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

  // Discover FastAPI endpoints from workspace
  const apps = await discoverFastAPIApps(parserService)
  const endpointProvider = new EndpointTreeProvider(apps)

  let refreshTimeout: NodeJS.Timeout | null = null

  // Register CodeLens provider for test files
  const codeLensProvider = new TestCodeLensProvider(parserService, apps)

  const triggerRefresh = () => {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout)
    }
    refreshTimeout = setTimeout(async () => {
      const newApps = await discoverFastAPIApps(parserService)
      endpointProvider.setApps(newApps)
      codeLensProvider.setApps(newApps)
    }, 500) // Debounce for 500ms
  }

  // Watch for changes in Python files to refresh endpoints
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.py")
  watcher.onDidChange(triggerRefresh)
  watcher.onDidCreate(triggerRefresh)
  watcher.onDidDelete(triggerRefresh)
  context.subscriptions.push(watcher)

  const treeView = vscode.window.createTreeView("endpoint-explorer", {
    treeDataProvider: endpointProvider,
  })
  context.subscriptions.push(treeView)

  const config = vscode.workspace.getConfiguration("fastapi")
  if (config.get<boolean>("showTestCodeLenses", true)) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: "python", pattern: "**/test*.py" },
        codeLensProvider,
      ),
    )
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "fastapi-vscode.refreshEndpoints",
      async () => {
        if (!parserService) {
          return
        }
        clearImportCache()
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

    vscode.commands.registerCommand("fastapi-vscode.toggleRouters", () => {
      endpointProvider.toggleRouters()
    }),

    vscode.commands.registerCommand(
      "fastapi-vscode.goToRoute",
      async (
        locations: SourceLocation[],
        sourceUri?: vscode.Uri,
        sourcePosition?: vscode.Position,
      ) => {
        if (locations.length === 0) {
          return
        }

        // Use passed source location or fall back to active editor
        let fromUri = sourceUri
        let fromPosition = sourcePosition
        if (!fromUri || !fromPosition) {
          const editor = vscode.window.activeTextEditor
          if (!editor) {
            return
          }
          fromUri = editor.document.uri
          fromPosition = editor.selection.active
        }

        const locationLinks: vscode.Location[] = locations.map((loc) => {
          const targetUri = vscode.Uri.file(loc.filePath)
          const targetPos = new vscode.Position(loc.line - 1, loc.column)
          return new vscode.Location(
            targetUri,
            new vscode.Range(targetPos, targetPos),
          )
        })

        // Use goToLocations for both single and multiple matches
        // This properly records navigation history for "go back"
        await vscode.commands.executeCommand(
          "editor.action.goToLocations",
          fromUri,
          fromPosition,
          locationLinks,
          locations.length === 1 ? "goto" : "peek",
          "No matching path operations found",
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
