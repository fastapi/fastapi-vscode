import { join } from "node:path"

declare const __DIST_ROOT__: string

export const wasmDir = join(__DIST_ROOT__, "wasm")
export const wasmPaths = {
  core: join(wasmDir, "web-tree-sitter.wasm"),
  python: join(wasmDir, "tree-sitter-python.wasm"),
}

export const fixturesPath = join(__DIST_ROOT__, "..", "src", "test", "fixtures")
export const fixtures = {
  standard: {
    root: join(fixturesPath, "standard"),
    mainPy: join(fixturesPath, "standard", "app", "main.py"),
    usersPy: join(fixturesPath, "standard", "app", "routes", "users.py"),
    initPy: join(fixturesPath, "standard", "app", "__init__.py"),
  },
  flat: {
    root: join(fixturesPath, "flat"),
    mainPy: join(fixturesPath, "flat", "main.py"),
  },
  namespace: {
    root: join(fixturesPath, "namespace"),
    mainPy: join(fixturesPath, "namespace", "app", "main.py"),
  },
  reexport: {
    root: join(fixturesPath, "reexport"),
    mainPy: join(fixturesPath, "reexport", "app", "main.py"),
    initPy: join(
      fixturesPath,
      "reexport",
      "app",
      "integrations",
      "__init__.py",
    ),
  },
  sameFile: {
    root: join(fixturesPath, "same-file"),
    mainPy: join(fixturesPath, "same-file", "main.py"),
  },
  multiApp: {
    root: join(fixturesPath, "multi-app"),
    mainPy: join(fixturesPath, "multi-app", "main.py"),
  },
}
