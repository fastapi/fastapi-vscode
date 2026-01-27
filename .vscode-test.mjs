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
    exclude: ["**/test/**", "**/web/**", "**/node_modules/**"],
    reporter: ["text", "html", "json-summary"],
    output: "./coverage",
    includeAll: true,
  },
})
