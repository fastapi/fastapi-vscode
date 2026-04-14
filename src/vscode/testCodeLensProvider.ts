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
import { findTestClientCalls } from "../core/extractors"
import type { Parser } from "../core/parser"
import {
  pathMatchesPathOperation,
  stripLeadingDynamicSegments,
} from "../core/pathUtils"
import { collectRoutes } from "../core/treeUtils"
import type { AppDefinition, SourceLocation } from "../core/types"
import { trackCodeLensProvided } from "../utils/telemetry"

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
    /* c8 ignore next */
    if (!tree) return []

    const testClientCalls = findTestClientCalls(tree.rootNode)

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

  private findMatchingRoutes(
    testPath: string,
    testMethod: string,
  ): SourceLocation[] {
    return collectRoutes(this.apps)
      .filter(
        (route) =>
          route.method.toLowerCase() === testMethod.toLowerCase() &&
          pathMatchesPathOperation(testPath, route.path),
      )
      .map((route) => route.location)
  }
}
