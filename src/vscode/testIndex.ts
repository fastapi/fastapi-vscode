import { EventEmitter, workspace } from "vscode"
import { findTestClientCalls } from "../core/extractors"
import type { Parser } from "../core/parser"
import { pathMatchesPathOperation } from "../core/pathUtils"
import type { SourceLocation } from "../core/types"

export class TestCallIndex {
  private index = new Map<
    string,
    { method: string; path: string; line: number; column: number }[]
  >()
  private parser: Parser

  private _onDidChangeIndex = new EventEmitter<void>()
  readonly onDidChangeIndex = this._onDidChangeIndex.event

  constructor(parser: Parser) {
    this.parser = parser
  }

  async build(): Promise<void> {
    this.index.clear()
    const testFiles = await workspace.findFiles("**/*test*.py")
    for (const file of testFiles) {
      const document = await workspace.openTextDocument(file)
      const tree = this.parser.parse(document.getText())
      if (!tree) continue

      const calls = findTestClientCalls(tree.rootNode)
      this.index.set(file.toString(), calls)
    }
    this._onDidChangeIndex.fire()
  }

  getTestCallsForRoute(method: string, path: string): SourceLocation[] {
    const matchingTestCalls: SourceLocation[] = []

    for (const [filePath, testCalls] of this.index.entries()) {
      for (const call of testCalls) {
        if (
          call.method.toLowerCase() === method.toLowerCase() &&
          pathMatchesPathOperation(call.path, path)
        ) {
          matchingTestCalls.push({
            filePath,
            line: call.line + 1,
            column: call.column,
          })
        }
      }
    }

    return matchingTestCalls
  }

  async invalidateFile(fileUri: string): Promise<void> {
    if (!fileUri.includes("test")) {
      return
    }
    try {
      const document = await workspace.openTextDocument(fileUri)
      const tree = this.parser.parse(document.getText())
      if (!tree) {
        this.index.delete(fileUri)
        return
      }
      const calls = findTestClientCalls(tree.rootNode)
      this.index.set(fileUri, calls)
    } catch {
      this.index.delete(fileUri)
    }
    this._onDidChangeIndex.fire()
  }
}
