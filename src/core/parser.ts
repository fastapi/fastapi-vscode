/**
 * Parser service using Web Tree Sitter to parse Python code.
 */

import * as vscode from "vscode"
import { Language, Parser as TreeSitterParser } from "web-tree-sitter"

export class Parser {
  private parser: TreeSitterParser | null = null
  async init(wasmPaths: { core: vscode.Uri; python: vscode.Uri }) {
    if (this.parser) {
      return
    }

    // Read WASM files via VS Code's virtual filesystem API
    const [wasmBinary, pythonWasmBinary] = await Promise.all([
      vscode.workspace.fs.readFile(wasmPaths.core),
      vscode.workspace.fs.readFile(wasmPaths.python),
    ])

    // Initialize tree-sitter with the core WASM binary
    await TreeSitterParser.init({
      locateFile: () => wasmPaths.core.toString(),
      wasmBinary,
    })

    const parser = new TreeSitterParser()

    // Load Python language from WASM binary
    const pythonLanguage = await Language.load(new Uint8Array(pythonWasmBinary))
    parser.setLanguage(pythonLanguage)

    this.parser = parser
  }

  parse(code: string) {
    if (!this.parser) {
      throw new Error("ParserService not initialized. Call init() first.")
    }

    return this.parser.parse(code)
  }

  dispose() {
    this.parser?.delete()
    this.parser = null
  }
}
