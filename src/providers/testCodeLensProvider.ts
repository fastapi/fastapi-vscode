/**
 * CodeLens provider for FastAPI test client HTTP calls.
 * Shows "Go to route" links above test client method calls.
 */

import {
  CodeLens,
  type CodeLensProvider,
  EventEmitter,
  Location,
  Position,
  Range,
  type TextDocument,
  Uri,
} from "vscode"
import type { Node } from "web-tree-sitter"
import { extractPathFromNode, findNodesByType } from "../core/extractors"
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
import { trackCodeLensProvided } from "../utils/telemetry"

interface TestClientCall {
  method: string
  path: string
  line: number
  column: number
}

export class TestCodeLensProvider implements CodeLensProvider {
  private apps: AppDefinition[] = []
  private parser: Parser
  private _onDidChangeCodeLenses = new EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event
  private trackedFiles = new Set<string>()

  constructor(parser: Parser, apps: AppDefinition[]) {
    this.parser = parser
    this.apps = apps
  }

  setApps(apps: AppDefinition[]): void {
    this.apps = apps
    this.trackedFiles.clear()
    this._onDidChangeCodeLenses.fire()
  }

  provideCodeLenses(document: TextDocument): CodeLens[] {
    const code = document.getText()
    const tree = this.parser.parse(code)
    if (!tree) {
      return []
    }

    const testClientCalls = this.findTestClientCalls(tree.rootNode)

    const codeLenses: CodeLens[] = []

    for (const call of testClientCalls) {
      const matchingRoutes = this.findMatchingRoutes(call.path, call.method)

      if (matchingRoutes.length > 0) {
        const range = new Range(
          new Position(call.line, call.column),
          new Position(call.line, call.column),
        )

        const methodUpper = call.method.toUpperCase()
        const displayPath = stripLeadingDynamicSegments(call.path)
        const locations = matchingRoutes.map(
          (loc) =>
            new Location(
              Uri.parse(loc.filePath),
              new Position(loc.line - 1, loc.column),
            ),
        )
        codeLenses.push(
          new CodeLens(range, {
            title: `Go to route: ${methodUpper} ${displayPath}`,
            command: "fastapi-vscode.goToDefinition",
            arguments: [
              locations,
              document.uri,
              new Position(call.line, call.column),
            ],
          }),
        )
      }
    }

    // Track once per file per session (first open only, edits won't update the count)
    const fileKey = document.uri.toString()
    if (testClientCalls.length > 0 && !this.trackedFiles.has(fileKey)) {
      this.trackedFiles.add(fileKey)
      trackCodeLensProvided(testClientCalls.length, codeLenses.length)
    }

    return codeLenses
  }

  private findTestClientCalls(rootNode: Node): TestClientCall[] {
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
      const path = extractPathFromNode(pathArg)
      if (!path) {
        continue
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
