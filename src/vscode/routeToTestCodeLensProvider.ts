import {
  CodeLens,
  type CodeLensProvider,
  type Disposable,
  EventEmitter,
  Location,
  Position,
  Range,
  type TextDocument,
  Uri,
} from "vscode"

import { type AppDefinition, collectRoutes } from "../core"
import type { RouteDefinition } from "../core/types"
import type { TestCallIndex } from "./testIndex"

export class RouteToTestCodeLensProvider implements CodeLensProvider {
  private cachedRoutes: RouteDefinition[] = []
  private testIndex: TestCallIndex
  private indexListener: Disposable

  private _onDidChangeCodeLenses = new EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  constructor(apps: AppDefinition[], testIndex: TestCallIndex) {
    this.cachedRoutes = collectRoutes(apps)
    this.testIndex = testIndex
    this.indexListener = testIndex.onDidChangeIndex(() => {
      this._onDidChangeCodeLenses.fire()
    })
  }

  setApps(apps: AppDefinition[]): void {
    this.cachedRoutes = collectRoutes(apps)
    this._onDidChangeCodeLenses.fire()
  }

  provideCodeLenses(document: TextDocument): CodeLens[] {
    const currentFile = document.uri.toString()
    const routes = this.cachedRoutes.filter(
      (route) => route.location.filePath === currentFile,
    )

    const codeLenses: CodeLens[] = []

    for (const route of routes) {
      const matchingTests = this.testIndex.getTestCallsForRoute(
        route.method,
        route.path,
      )
      if (matchingTests.length === 0) continue

      const range = new Range(
        new Position(route.location.line - 1, route.location.column),
        new Position(route.location.line - 1, route.location.column),
      )

      codeLenses.push(
        new CodeLens(range, {
          title: `${matchingTests.length} ${matchingTests.length === 1 ? "test" : "tests"}`,
          command: "fastapi-vscode.goToDefinition",
          arguments: [
            matchingTests.map(
              (test) =>
                new Location(
                  Uri.parse(test.filePath),
                  new Position(test.line - 1, test.column),
                ),
            ),
            document.uri,
            new Position(route.location.line - 1, route.location.column),
          ],
        }),
      )
    }

    return codeLenses
  }

  dispose(): void {
    this.indexListener.dispose()
    this._onDidChangeCodeLenses.dispose()
  }
}
