import { EventEmitter, RelativePattern, Uri, workspace } from "vscode"
import { analyzeFile } from "../core/analyzer"
import {
  collectUsedNames,
  findUnusedDependencies,
  type LocatedDependency,
} from "../core/dependencyUsage"
import type { DependencyDefinitionInfo } from "../core/internal"
import type { Parser } from "../core/parser"
import {
  isExcludedFromPythonScan,
  PYTHON_FILE_GLOB,
  PYTHON_SCAN_EXCLUDE_GLOB,
} from "../core/workspaceScan"
import { vscodeFileSystem } from "./vscodeFileSystem"

export class DependencyIndex {
  // Stored per-file (like TestCallIndex) so invalidation stays cheap later.
  private index = new Map<
    string,
    { definitions: DependencyDefinitionInfo[]; referencedNames: string[] }
  >()
  private parser: Parser

  private _onDidChangeIndex = new EventEmitter<void>()
  readonly onDidChangeIndex = this._onDidChangeIndex.event

  constructor(parser: Parser) {
    this.parser = parser
  }

  async build(): Promise<void> {
    this.index.clear()

    for (const folder of workspace.workspaceFolders ?? []) {
      const files = await workspace.findFiles(
        new RelativePattern(folder, PYTHON_FILE_GLOB),
        new RelativePattern(folder, PYTHON_SCAN_EXCLUDE_GLOB),
      )
      for (const file of files) {
        const analysis = await analyzeFile(
          file.toString(),
          this.parser,
          vscodeFileSystem,
        )
        if (!analysis) continue
        this.index.set(file.toString(), {
          definitions: analysis.dependencies,
          referencedNames: analysis.referencedNames,
        })
      }
    }

    this._onDidChangeIndex.fire()
  }

  /**
   * Re-analyze a single changed/created/deleted file and update its index entry.
   * Cheaper than build() — only reparses the one file. Callers recompute the
   * (workspace-global) unused set afterwards via getUnusedDependencies().
   */
  async invalidateFile(fileUri: string): Promise<void> {
    if (!fileUri.endsWith(".py") || isExcludedFromPythonScan(fileUri)) {
      return
    }

    const analysis = await analyzeFile(fileUri, this.parser, vscodeFileSystem)
    if (!analysis) {
      // File deleted or unparseable — drop any stale entry.
      this.index.delete(fileUri)
    } else {
      this.index.set(fileUri, {
        definitions: analysis.dependencies,
        referencedNames: analysis.referencedNames,
      })
    }

    this._onDidChangeIndex.fire()
  }

  getUnusedDependencies(): LocatedDependency[] {
    // Bucket by owning workspace folder so usage is scoped per project — a dead
    // dependency in one root isn't masked by a same-named symbol in another.
    const byFolder = new Map<
      string,
      { defs: LocatedDependency[]; refs: string[][] }
    >()

    for (const [fileUri, { definitions, referencedNames }] of this.index) {
      const folder = workspace.getWorkspaceFolder(Uri.parse(fileUri))
      const key = folder?.uri.toString() ?? "" // "" = files outside any folder
      const bucket = byFolder.get(key) ?? { defs: [], refs: [] }
      for (const definition of definitions) {
        bucket.defs.push({ fileUri, definition })
      }
      bucket.refs.push(referencedNames)
      byFolder.set(key, bucket)
    }

    const unused: LocatedDependency[] = []
    for (const { defs, refs } of byFolder.values()) {
      unused.push(...findUnusedDependencies(defs, collectUsedNames(refs)))
    }
    return unused
  }
}
