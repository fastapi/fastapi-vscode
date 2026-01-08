import * as vscode from "vscode"
import { findNodesByType } from "./core/astUtils"
import {
  decoratorExtractor,
  importExtractor,
  routerExtractor,
} from "./core/extractors"
import { Parser } from "./core/parser"
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

  const endpointProvider = new EndpointTreeProvider(
    mockApps,
    groupAppsByWorkspace,
  )

  const fastapiCode = `
  from fastapi import FastAPI, APIRouter
  from .routes import users, items
  from ..api import main
  app = FastAPI()

  router = APIRouter(prefix="/items")

  @router.get("/{item_id}")
  async def read_item(item_id: int):
      return {"item_id": item_id}

  app.include_router(router)
  
  @app.get("/items/{item_id}")
  async def read_item(item_id: int):
      return {"item_id": item_id} 
  `

  const tree = parserService.parse(fastapiCode)

  // Extract routes
  const decoratedDefs = tree
    ? findNodesByType(tree.rootNode, "decorated_definition")
    : []
  console.log("Decorated Definitions Found:", decoratedDefs.length)

  for (const def of decoratedDefs) {
    const result = decoratorExtractor(def)
    console.log("Processed Decorated Definition:", result)
  }

  // Extract routers
  const assignments = tree ? findNodesByType(tree.rootNode, "assignment") : []
  console.log("Assignments Found:", assignments.length)

  for (const assign of assignments) {
    const result = routerExtractor(assign)
    console.log("Processed Router Definition:", result)
  }

  // Extract imports
  const importNodes = tree
    ? findNodesByType(tree.rootNode, "import_statement")
    : []
  const importFromNodes = tree
    ? findNodesByType(tree.rootNode, "import_from_statement")
    : []
  const allImportNodes = importNodes.concat(importFromNodes)
  console.log("Import Statements Found:", allImportNodes.length)
  for (const importNode of allImportNodes) {
    const result = importExtractor(importNode)
    console.log("Processed Import Statement:", result)
  }

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
  )
}

export function deactivate() {}
