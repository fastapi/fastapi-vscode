import { join } from "node:path"
import * as vscode from "vscode"

declare const __DIST_ROOT__: string

export const wasmDir = join(__DIST_ROOT__, "wasm")
export const wasmPaths = {
  core: vscode.Uri.file(join(wasmDir, "web-tree-sitter.wasm")),
  python: vscode.Uri.file(join(wasmDir, "tree-sitter-python.wasm")),
}

export const fixturesPath = join(__DIST_ROOT__, "..", "src", "test", "fixtures")

// Helper to convert string path to URI
const uri = (path: string) => vscode.Uri.file(path)

export const fixtures = {
  standard: {
    root: uri(join(fixturesPath, "standard")),
    mainPy: uri(join(fixturesPath, "standard", "app", "main.py")),
    usersPy: uri(join(fixturesPath, "standard", "app", "routes", "users.py")),
    initPy: uri(join(fixturesPath, "standard", "app", "__init__.py")),
  },
  flat: {
    root: uri(join(fixturesPath, "flat")),
    mainPy: uri(join(fixturesPath, "flat", "main.py")),
  },
  namespace: {
    root: uri(join(fixturesPath, "namespace")),
    mainPy: uri(join(fixturesPath, "namespace", "app", "main.py")),
  },
  reexport: {
    root: uri(join(fixturesPath, "reexport")),
    mainPy: uri(join(fixturesPath, "reexport", "app", "main.py")),
    initPy: uri(
      join(fixturesPath, "reexport", "app", "integrations", "__init__.py"),
    ),
  },
  sameFile: {
    root: uri(join(fixturesPath, "same-file")),
    mainPy: uri(join(fixturesPath, "same-file", "main.py")),
  },
  multiApp: {
    root: join(fixturesPath, "multi-app"),
    mainPy: join(fixturesPath, "multi-app", "main.py"),
  },
}
