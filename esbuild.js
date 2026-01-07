import esbuild from "esbuild"

const production = process.argv.includes("--production")
const watch = process.argv.includes("--watch")

async function main() {
  const ctx = await esbuild.context({
    entryPoints: [
      "src/extension.ts",
      "src/test/extension.test.ts",
      "src/test/EndpointTreeProvider.test.ts",
    ],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outdir: "dist",
    outbase: "src",
    external: ["vscode"],
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
