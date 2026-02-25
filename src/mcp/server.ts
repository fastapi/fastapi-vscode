import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import * as fs from "fs/promises"
import * as path from "path"
import { fileURLToPath } from "url"
import { z } from "zod"
import { discoverFastAPIApps } from "../appDiscovery"
import { Parser } from "../core/parser"
import { collectRoutes } from "../core/treeUtils"
import { nodeFileSystem } from "./nodeFileSystem"
import { nodeWorkspace } from "./nodeWorkspace"

async function main() {
  const [workspacePath, extensionPath] = process.argv.slice(2)
  let apps: Awaited<ReturnType<typeof discoverFastAPIApps>> = []

  if (!workspacePath || !extensionPath) {
    console.error("Usage: node server.js <workspacePath> <extensionPath>")
    process.exit(1)
  }

  let parser: Parser | null = null
  try {
    parser = new Parser()
    const [coreWasm, pythonWasm] = await Promise.all([
      fs.readFile(
        path.join(extensionPath, "dist", "wasm", "web-tree-sitter.wasm"),
      ),
      fs.readFile(
        path.join(extensionPath, "dist", "wasm", "tree-sitter-python.wasm"),
      ),
    ])
    await parser.init({
      core: coreWasm,
      python: pythonWasm,
    })
  } catch (error) {
    console.error("Failed to initialize parser:", error)
    process.exit(1)
  }

  try {
    apps = await discoverFastAPIApps(
      parser,
      nodeWorkspace(workspacePath),
      nodeFileSystem,
    )
  } catch (error) {
    console.error("Failed to discover FastAPI apps:", error)
    process.exit(1)
  }

  const server = new McpServer({
    name: "FastAPI MCP Server",
    version: "0.1.0",
  })

  server.registerTool(
    "get_routes",
    {
      description:
        "Get all FastAPI routes in the workspace. Returns method, path, function name, docstring, and source file location (file path + line number) for each route.",
      inputSchema: z.object({}),
    },
    async () => {
      const routes = collectRoutes(apps).map((route) => ({
        ...route,
        location: {
          ...route.location,
          filePath: path.relative(
            workspacePath,
            fileURLToPath(route.location.filePath),
          ),
        },
      }))
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(routes, null, 2),
          },
        ],
      }
    },
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error("Unexpected error in MCP server:", error)
  process.exit(1)
})
