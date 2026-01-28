import { defineConfig } from "@vscode/test-cli"

export default defineConfig({
  tests: [
    {
      files: "dist/test/**/*.test.js",
      srcDir: "dist",
      mocha: {
        ui: "tdd",
        timeout: 20000,
      },
    },
  ],
  coverage: {
    include: ["**/*.js"],
    exclude: [
      "**/test/**",
      "**/web/**",
      "**/node_modules/**",
      // Type-only files (compile to empty modules)
      "**/core/types.js",
      "**/core/filesystem.js",
      "**/core/index.js",
      "**/telemetry/types.js",
      // VSCode-dependent files (require mocking, not unit testable)
      "**/extension.js",
      "**/appDiscovery.js",
      "**/vscodeFileSystem.js",
      "**/telemetry/vscode.js",
    ],
    reporter: ["text", "html", "json-summary"],
    output: "./coverage",
    includeAll: true,
  },
})
