import { readFileSync } from "node:fs"
import { Language, Parser as TreeSitterParser } from "web-tree-sitter"

export class Parser {
  private parser: TreeSitterParser | null = null
  async init(wasmPaths: { core: string; python: string }) {
    if (this.parser) {
      return
    }

    const wasmBinary = readFileSync(wasmPaths.core)
    await TreeSitterParser.init({ wasmBinary })

    this.parser = new TreeSitterParser()

    const pythonWasmBinary = readFileSync(wasmPaths.python)
    const pythonLanguage = await Language.load(pythonWasmBinary)
    this.parser.setLanguage(pythonLanguage)
  }

  parse(code: string) {
    if (!this.parser) {
      throw new Error("ParserService not initialized. Call init() first.")
    }

    return this.parser.parse(code)
  }

  dispose() {
    this.parser?.delete()
  }
}
