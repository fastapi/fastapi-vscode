/**
 * Parser service using Web Tree Sitter to parse Python code.
 */

import { Language, Parser as TreeSitterParser } from "web-tree-sitter"

export class Parser {
  private parser: TreeSitterParser | null = null

  /**
   * Initialize the parser with Wasm binaries.
   * @param wasmBinaries.core - The web-tree-sitter.wasm binary
   * @param wasmBinaries.python - The tree-sitter-python.wasm binary
   */
  async init(wasmBinaries: { core: Uint8Array; python: Uint8Array }) {
    if (this.parser) {
      return
    }

    // Pre-compile the Wasm module from the binary
    const wasmModule = await WebAssembly.compile(
      wasmBinaries.core as Uint8Array<ArrayBuffer>,
    )

    // Use instantiateWasm to provide custom Wasm instantiation.
    // This bypasses tree-sitter's default URL-based loading which relies
    // on import.meta.url - unavailable in bundled or non-ESM environments.
    await TreeSitterParser.init({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      instantiateWasm(imports: any, successCallback: any) {
        WebAssembly.instantiate(wasmModule, imports).then(
          (instance: WebAssembly.Instance) => {
            successCallback(instance, wasmModule)
          },
        )
        return {}
      },
    })

    const parser = new TreeSitterParser()

    // Load Python language from Wasm binary
    const pythonLanguage = await Language.load(wasmBinaries.python)
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
