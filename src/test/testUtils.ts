import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import sinon from "sinon"
import * as vscode from "vscode"
import type { ApiService } from "../cloud/api"
import type { FileSystem } from "../core/filesystem"

declare const __DIST_ROOT__: string

export const wasmDir = join(__DIST_ROOT__, "wasm")

// Read Wasm files as Uint8Array for the new parser API
export const wasmBinaries = {
  core: new Uint8Array(readFileSync(join(wasmDir, "web-tree-sitter.wasm"))),
  python: new Uint8Array(
    readFileSync(join(wasmDir, "tree-sitter-python.wasm")),
  ),
}

export const fixturesPath = join(__DIST_ROOT__, "..", "src", "test", "fixtures")

// Helper to convert string path to file:// URI string
const uri = (path: string) => `file://${path}`

export const fixtures = {
  standard: {
    root: uri(join(fixturesPath, "standard")),
    rootMainPy: uri(join(fixturesPath, "standard", "main.py")),
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
    root: uri(join(fixturesPath, "multi-app")),
    mainPy: uri(join(fixturesPath, "multi-app", "main.py")),
  },
  aliasedImport: {
    root: uri(join(fixturesPath, "aliased-import")),
    mainPy: uri(join(fixturesPath, "aliased-import", "app", "main.py")),
    tokensPy: uri(
      join(fixturesPath, "aliased-import", "app", "routes", "tokens.py"),
    ),
  },
  errorCases: {
    root: uri(join(fixturesPath, "error-cases")),
    mainPy: uri(join(fixturesPath, "error-cases", "main.py")),
  },
  nestedRouter: {
    root: uri(join(fixturesPath, "nested-router")),
    mainPy: uri(join(fixturesPath, "nested-router", "app", "main.py")),
    appsPy: uri(
      join(fixturesPath, "nested-router", "app", "routes", "apps.py"),
    ),
    tokensPy: uri(
      join(fixturesPath, "nested-router", "app", "routes", "tokens.py"),
    ),
    settingsPy: uri(
      join(fixturesPath, "nested-router", "app", "routes", "settings.py"),
    ),
  },
}

/**
 * Extract file path from a file:// URI string
 */
function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    return uri.slice(7)
  }
  return uri
}

/**
 * Node.js FileSystem implementation for tests.
 */
export const nodeFileSystem: FileSystem = {
  async readFile(uri: string): Promise<Uint8Array> {
    const path = uriToPath(uri)
    return new Uint8Array(readFileSync(path))
  },

  async exists(uri: string): Promise<boolean> {
    const path = uriToPath(uri)
    return existsSync(path)
  },

  joinPath(base: string, ...segments: string[]): string {
    const basePath = uriToPath(base)
    return `file://${join(basePath, ...segments)}`
  },

  dirname(uri: string): string {
    const path = uriToPath(uri)
    return `file://${dirname(path)}`
  },
}

// Cloud helpers

export function stubFs() {
  const original = vscode.workspace.fs
  const fake = {
    readFile: sinon.stub(),
    writeFile: sinon.stub(),
    delete: sinon.stub(),
    createDirectory: sinon.stub(),
  } as unknown as typeof vscode.workspace.fs & {
    readFile: sinon.SinonStub
    writeFile: sinon.SinonStub
    delete: sinon.SinonStub
    createDirectory: sinon.SinonStub
  }
  Object.defineProperty(vscode.workspace, "fs", {
    value: fake,
    configurable: true,
  })
  return {
    fake,
    restore: () =>
      Object.defineProperty(vscode.workspace, "fs", {
        value: original,
        configurable: true,
      }),
  }
}

export function mockResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => mockResponse(body, ok, status),
  } as unknown as Response
}

export function mockApiService(
  overrides: Partial<ApiService> = {},
): ApiService {
  return {
    getTeams: sinon.stub().resolves([]),
    getApps: sinon.stub().resolves([]),
    createApp: sinon.stub().resolves({ id: "a1", slug: "new-app", url: "" }),
    ...overrides,
  } as unknown as ApiService
}
