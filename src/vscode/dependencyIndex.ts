import { EventEmitter, RelativePattern, Uri, workspace } from "vscode"
import {
  findUnusedDependenciesByScope,
  type LocatedDependency,
  type ScopedFileData,
} from "../core/dependencyUsage"
import {
  collectDependencyDefinitions,
  collectIdentifierNames,
  collectRecognizedDependencyNames,
  getNodesByType,
} from "../core/extractors"
import type { DependencyDefinitionInfo } from "../core/internal"
import type { Parser } from "../core/parser"
import {
  isExcludedFromPythonScan,
  PYTHON_FILE_GLOB,
  PYTHON_SCAN_EXCLUDE_GLOB,
} from "../core/workspaceScan"
import { vscodeFileSystem } from "./vscodeFileSystem"

interface FileDependencyData {
  definitions: DependencyDefinitionInfo[]
  referencedNames: string[]
}

export class DependencyIndex {
  // Stored per-file (like TestCallIndex) so invalidation stays cheap later.
  private index = new Map<string, FileDependencyData>()
  private parser: Parser

  private _onDidChangeIndex = new EventEmitter<void>()
  readonly onDidChangeIndex = this._onDidChangeIndex.event

  constructor(parser: Parser) {
    this.parser = parser
  }

  /**
   * Parse a single file and extract the dependency definitions plus every
   * referenced identifier. Self-contained (not via analyzeTree) so this lint's
   * cost is only paid when the feature is enabled. Returns null if the file
   * can't be read or parsed.
   */
  private async collectFromFile(
    fileUri: string,
  ): Promise<FileDependencyData | null> {
    try {
      const content = await vscodeFileSystem.readFile(fileUri)
      const tree = this.parser.parse(new TextDecoder().decode(content))
      if (!tree) return null

      const nodesByType = getNodesByType(tree.rootNode)
      const recognized = collectRecognizedDependencyNames(nodesByType)
      return {
        definitions: collectDependencyDefinitions(nodesByType, recognized),
        referencedNames: collectIdentifierNames(nodesByType),
      }
    } catch {
      return null
    }
  }

  async build(): Promise<void> {
    this.index.clear()

    for (const folder of workspace.workspaceFolders ?? []) {
      const files = await workspace.findFiles(
        new RelativePattern(folder, PYTHON_FILE_GLOB),
        new RelativePattern(folder, PYTHON_SCAN_EXCLUDE_GLOB),
      )
      for (const file of files) {
        const data = await this.collectFromFile(file.toString())
        if (data) this.index.set(file.toString(), data)
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

    const data = await this.collectFromFile(fileUri)
    if (data) {
      this.index.set(fileUri, data)
    } else {
      // File deleted or unparseable — drop any stale entry.
      this.index.delete(fileUri)
    }

    this._onDidChangeIndex.fire()
  }

  getUnusedDependencies(): LocatedDependency[] {
    // Scope usage per owning workspace folder (the empty string groups files
    // outside any folder), so a dead dependency in one project isn't masked by
    // a same-named symbol in another. The grouping itself lives in the pure
    // layer; here we just resolve each file's folder.
    const files: ScopedFileData[] = []
    for (const [fileUri, { definitions, referencedNames }] of this.index) {
      const folder = workspace.getWorkspaceFolder(Uri.parse(fileUri))
      files.push({
        fileUri,
        scopeKey: folder?.uri.toString() ?? "",
        definitions,
        referencedNames,
      })
    }
    return findUnusedDependenciesByScope(files)
  }
}
