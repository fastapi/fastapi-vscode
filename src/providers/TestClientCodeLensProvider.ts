/**
 * CodeLens provider for FastAPI test client HTTP calls.
 * Shows "Go to path operation" links above test client method calls.
 */

import * as vscode from "vscode"
import { findNodesByType } from "../core/extractors"
import { ROUTE_METHODS } from "../core/internal"
import type { Parser } from "../core/parser"
import {
  pathMatchesEndpoint,
  stripLeadingDynamicSegments,
} from "../core/pathUtils"
import type {
  AppDefinition,
  RouteDefinition,
  RouterDefinition,
  SourceLocation,
} from "../core/types"

interface TestClientCall {
  method: string
  path: string
  line: number
  column: number
}

export class TestClientCodeLensProvider implements vscode.CodeLensProvider {
  private apps: AppDefinition[] = []
  private parser: Parser
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  constructor(parser: Parser, apps: AppDefinition[]) {
    this.parser = parser
    this.apps = apps
  }

  setApps(apps: AppDefinition[]): void {
    this.apps = apps
    this._onDidChangeCodeLenses.fire()
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const code = document.getText()
    const tree = this.parser.parse(code)
    if (!tree) {
      return []
    }

    const testClientCalls = this.findTestClientCalls(tree.rootNode)

    const codeLenses: vscode.CodeLens[] = []

    for (const call of testClientCalls) {
      const matchingRoutes = this.findMatchingRoutes(call.path, call.method)

      if (matchingRoutes.length > 0) {
        const range = new vscode.Range(
          new vscode.Position(call.line, call.column),
          new vscode.Position(call.line, call.column),
        )

        const methodUpper = call.method.toUpperCase()
        const displayPath = stripLeadingDynamicSegments(call.path)
        const sourcePosition = new vscode.Position(call.line, call.column)
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: `Go to route: ${methodUpper} ${displayPath}`,
            command: "fastapi-vscode.goToPathOperation",
            arguments: [matchingRoutes, document.uri, sourcePosition],
          }),
        )
      }
    }

    return codeLenses
  }

  private findTestClientCalls(
    rootNode: import("web-tree-sitter").Node,
  ): TestClientCall[] {
    const calls: TestClientCall[] = []
    const callNodes = findNodesByType(rootNode, "call")

    for (const callNode of callNodes) {
      const functionNode = callNode.childForFieldName("function")
      if (!functionNode || functionNode.type !== "attribute") {
        continue
      }

      const methodNode = functionNode.childForFieldName("attribute")
      if (!methodNode) {
        continue
      }

      const method = methodNode.text.toLowerCase()
      if (!ROUTE_METHODS.has(method)) {
        continue
      }

      // Get the path argument (first argument)
      const argumentsNode = callNode.childForFieldName("arguments")
      if (!argumentsNode) {
        continue
      }

      const args = argumentsNode.namedChildren.filter(
        (child) => child.type !== "comment",
      )

      if (args.length === 0) {
        continue
      }

      const pathArg = args[0]
      // Only handle string literals for now
      if (pathArg.type !== "string") {
        continue
      }

      // Extract path string (remove quotes and f-string prefix)
      let path = pathArg.text
      // Remove f-string prefix if present: f"..." or f'...'
      if (path.startsWith('f"') || path.startsWith("f'")) {
        path = path.slice(2, -1)
      } else {
        path = path.slice(1, -1)
      }

      calls.push({
        method,
        path,
        line: callNode.startPosition.row,
        column: callNode.startPosition.column,
      })
    }

    return calls
  }

  private findMatchingRoutes(
    testPath: string,
    testMethod: string,
  ): SourceLocation[] {
    const matches: SourceLocation[] = []

    const collectRoutes = (routes: RouteDefinition[]) => {
      for (const route of routes) {
        if (
          route.method.toLowerCase() === testMethod.toLowerCase() &&
          pathMatchesEndpoint(testPath, route.path)
        ) {
          matches.push(route.location)
        }
      }
    }

    const walkRouters = (routers: RouterDefinition[]) => {
      for (const router of routers) {
        collectRoutes(router.routes)
        if (router.children) {
          walkRouters(router.children)
        }
      }
    }

    for (const app of this.apps) {
      collectRoutes(app.routes)
      walkRouters(app.routers)
    }

    return matches
  }
}
