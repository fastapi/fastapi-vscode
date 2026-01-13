import { copyFileSync, existsSync, globSync, mkdirSync } from "node:fs"
import path from "node:path"
import esbuild from "esbuild"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

function copyWasmFiles() {
  const wasmDestDir = path.join(import.meta.dirname, "dist", "wasm")

  if (!existsSync(wasmDestDir)) {
    mkdirSync(wasmDestDir, { recursive: true })
  }

  // Copy core tree-sitter wasm from web-tree-sitter (keep original name)
  const coreWasmSrc = path.join(
    import.meta.dirname,
    "node_modules",
    "web-tree-sitter",
    "web-tree-sitter.wasm",
  )
  const coreWasmDest = path.join(wasmDestDir, "web-tree-sitter.wasm")
  copyFileSync(coreWasmSrc, coreWasmDest)
  console.log("Copied web-tree-sitter.wasm -> dist/wasm/")

  // Copy Python grammar wasm from tree-sitter-python
  const pythonWasmSrc = path.join(
    import.meta.dirname,
    "node_modules",
    "tree-sitter-python",
    "tree-sitter-python.wasm",
  )
  const pythonWasmDest = path.join(wasmDestDir, "tree-sitter-python.wasm")
  copyFileSync(pythonWasmSrc, pythonWasmDest)
  console.log("Copied tree-sitter-python.wasm -> dist/wasm/")
}

async function main() {
  copyWasmFiles()

  const entryPoints = ["src/extension.ts"]
  if (!production) {
    entryPoints.push(...globSync("src/test/**/*.test.ts"))
  }

  const ctx = await esbuild.context({
    entryPoints,
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node20",
    treeShaking: true,
    outdir: "dist",
    outbase: "src",
    external: ["vscode", "web-tree-sitter"],
    logLevel: "info",
    define: {
      "process.env.NODE_ENV": production ? '"production"' : '"development"',
    },
  })

  if (watch) {
    await ctx.watch()
    console.log("Watching for changes...")
  } else {
    await ctx.rebuild()
    await ctx.dispose()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
