/**
 * Minimal vscode stub for the MCP server build.
 * Provides no-op implementations of vscode APIs used by internal logging.
 */

export const window = {
  createOutputChannel: () => ({
    info: () => {},
    error: () => {},
    warn: () => {},
    dispose: () => {},
  }),
}
