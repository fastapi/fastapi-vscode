import { copyFileSync, globSync, mkdirSync } from "node:fs"
import path from "node:path"
import esbuild from "esbuild"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")
const noBundleForCoverage = process.argv.includes("--no-bundle")

const POSTHOG_API_KEY = "phc_s0Qx8NxueJvnqe4YE7NEKYNosJr8aZ81tIByuzm464X"

function copyWasmFiles() {
  const wasmDestDir = path.join(import.meta.dirname, "dist", "wasm")
  mkdirSync(wasmDestDir, { recursive: true })

  // web-tree-sitter.wasm from node_modules
  const coreSrc = path.join(
    import.meta.dirname,
    "node_modules",
    "web-tree-sitter",
    "web-tree-sitter.wasm",
  )
  copyFileSync(coreSrc, path.join(wasmDestDir, "web-tree-sitter.wasm"))
  console.log("Copied web-tree-sitter.wasm -> dist/wasm/")

  // tree-sitter-python.wasm from wasm/ directory (checked into repo)
  const pythonSrc = path.join(
    import.meta.dirname,
    "wasm",
    "tree-sitter-python.wasm",
  )
  copyFileSync(pythonSrc, path.join(wasmDestDir, "tree-sitter-python.wasm"))
  console.log("Copied tree-sitter-python.wasm -> dist/wasm/")
}

function copyWebviewAssets() {
  const destDir = path.join(import.meta.dirname, "dist", "webview", "logs")
  mkdirSync(destDir, { recursive: true })

  const srcDir = path.join(import.meta.dirname, "src", "cloud", "ui", "panel")
  copyFileSync(
    path.join(srcDir, "styles.css"),
    path.join(destDir, "styles.css"),
  )
  console.log("Copied webview assets -> dist/webview/logs/")
}

async function main() {
  copyWasmFiles()
  copyWebviewAssets()

  const testEntryPoints = !production ? globSync("src/test/**/*.test.ts") : []
  const sourceEntryPoints = noBundleForCoverage
    ? globSync("src/**/*.ts")
    : ["src/extension.ts"]

  // Shared esbuild options
  const sharedOptions = {
    bundle: !noBundleForCoverage,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    treeShaking: true,
    logLevel: "info",
    define: {
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
      "process.env.POSTHOG_API_KEY": production
        ? JSON.stringify(POSTHOG_API_KEY)
        : '""',
      __DIST_ROOT__: JSON.stringify(path.join(import.meta.dirname, "dist")),
    },
  }

  // Node build (desktop VS Code)
  const nodeCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: [...sourceEntryPoints, ...testEntryPoints],
    format: "cjs",
    platform: "node",
    target: "node20",
    outdir: "dist",
    outbase: "src",
    ...(noBundleForCoverage ? {} : { external: ["vscode", "web-tree-sitter"] }),
  })

  // Webview script (runs inside VS Code logs panel webview)
  const webviewCtx = noBundleForCoverage
    ? null
    : await esbuild.context({
        entryPoints: ["src/cloud/ui/panel/webview.ts"],
        bundle: true,
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        format: "iife",
        platform: "browser",
        target: "es2022",
        outfile: "dist/webview/logs/webview.js",
        logLevel: "info",
      })

  const mcpCtx = await esbuild.context({
    ...sharedOptions,
    entryPoints: ["src/mcp/server.ts"],
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile: "dist/mcp/server.js",
    external: ["vscode", "web-tree-sitter"],
  })

  // Browser build (vscode.dev) - skip for unbundled builds
  const browserCtx = noBundleForCoverage
    ? null
    : await esbuild.context({
        ...sharedOptions,
        entryPoints: ["src/extension.ts"],
        format: "cjs",
        platform: "browser",
        target: "es2022",
        outfile: "dist/web/extension.js",
        // Polyfill/alias node modules for browser
        alias: {
          "node:path": "path-browserify",
        },
        // vscode is provided by the runtime; web-tree-sitter is bundled but
        // internally references these Node.js modules for environment detection
        // posthog-node uses Node.js APIs, so telemetry is disabled in browser
        // util and child_process are used for version detection but not in browser
        external: [
          "vscode",
          "fs/promises",
          "module",
          "posthog-node",
          "util",
          "child_process",
          "node:util",
          "node:child_process",
        ],
      })

  const allContexts = [nodeCtx, browserCtx, webviewCtx, mcpCtx].filter(Boolean)

  if (watch) {
    await Promise.all(allContexts.map((ctx) => ctx.watch()))
    console.log("Watching for changes...")
  } else {
    await Promise.all(allContexts.map((ctx) => ctx.rebuild()))
    await Promise.all(allContexts.map((ctx) => ctx.dispose()))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
