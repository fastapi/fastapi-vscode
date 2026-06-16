import pMap from "p-map"
import { EventEmitter, Uri, workspace } from "vscode"
import { findTestClientCalls } from "../core/extractors"
import type { Parser } from "../core/parser"
import { pathMatchesPathOperation } from "../core/pathUtils"
import type { SourceLocation } from "../core/types"
import { log } from "../utils/logger"

/**
 * Folders to skip when scanning for test files. Unlike app discovery, this
 * keeps `tests`/`test` directories (we want those) but excludes virtual envs
 * and dependency/cache folders.
 */
const TEST_INDEX_EXCLUDE_DIRS = [
  ".venv",
  "venv",
  "__pycache__",
  "node_modules",
  ".git",
  ".mypy_cache",
  ".pytest_cache",
]

const TEST_INDEX_EXCLUDE_GLOB = `**/{${TEST_INDEX_EXCLUDE_DIRS.join(",")}}/**`

// Limit concurrent file reads so large workspaces don't fan out unbounded.
const READ_CONCURRENCY = 50

export function shouldIgnoreTestIndexFile(fileUri: string): boolean {
  const segments = fileUri.split("/")
  return segments.some((segment) => TEST_INDEX_EXCLUDE_DIRS.includes(segment))
}

/**
 * Mirrors the discovery glob (a ".py" file whose name contains "test"). Matching
 * on the file name rather than the whole URI avoids false positives such as a
 * "latest/" directory making an unrelated ".py" file look like a test.
 */
export function isTestFileCandidate(fileUri: string): boolean {
  const fileName = fileUri.split("/").pop() ?? ""
  return fileName.endsWith(".py") && fileName.includes("test")
}

async function readFileText(uri: Uri): Promise<string> {
  const bytes = await workspace.fs.readFile(uri)
  return new TextDecoder().decode(bytes)
}

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
    const testFiles = await workspace.findFiles(
      "**/*test*.py",
      TEST_INDEX_EXCLUDE_GLOB,
    )
    await pMap(
      testFiles,
      async (file) => {
        let text: string
        try {
          text = await readFileText(file)
        } catch {
          log(`Skipping unreadable test file: ${file.toString()}`)
          return
        }
        const tree = this.parser.parse(text)
        if (!tree) return

        const calls = findTestClientCalls(tree.rootNode)
        this.index.set(file.toString(), calls)
      },
      { concurrency: READ_CONCURRENCY },
    )
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
    if (!isTestFileCandidate(fileUri) || shouldIgnoreTestIndexFile(fileUri)) {
      return
    }
    try {
      const text = await readFileText(Uri.parse(fileUri))
      const tree = this.parser.parse(text)
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

  /** @internal Exposed for testing only — set cached calls for a file URI. */
  setCallsForFile(
    fileUri: string,
    calls: { method: string; path: string; line: number; column: number }[],
  ): void {
    this.index.set(fileUri, calls)
  }
}
