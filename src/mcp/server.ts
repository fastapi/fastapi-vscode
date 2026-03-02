import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { execFile } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { fileURLToPath, pathToFileURL } from "url"
import { promisify } from "util"
import { z } from "zod"
import { discoverFastAPIApps } from "../appDiscovery"
import { getAuthFilePath } from "../cloud/authPath"
import {
  type App,
  type Config,
  DeploymentStatus,
  failedStatuses,
} from "../cloud/types"
import { Parser } from "../core/parser"
import { stripLeadingDynamicSegments } from "../core/pathUtils"
import { collectRoutes } from "../core/treeUtils"
import { nodeFileSystem } from "./nodeFileSystem"
import { nodeWorkspace } from "./nodeWorkspace"

const execFileAsync = promisify(execFile)

async function readFastAPISkillMd(pythonPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      ["-c", "import fastapi, os; print(os.path.dirname(fastapi.__file__))"],
      { timeout: 5000 },
    )
    const skillPath = path.join(
      stdout.trim(),
      ".agents",
      "skills",
      "fastapi",
      "SKILL.md",
    )
    return await fs.readFile(skillPath, "utf8")
  } catch {
    return null
  }
}

const CLOUD_API_BASE = "https://api.fastapicloud.com/api/v1"

async function readAuthToken(): Promise<string | null> {
  try {
    const filePath = getAuthFilePath()
    if (!filePath) return null
    const content = await fs.readFile(filePath, "utf8")
    const { access_token } = JSON.parse(content)
    return access_token ?? null
  } catch {
    return null
  }
}

class UnauthorizedError extends Error {}

async function cloudGet<T>(endpoint: string, token: string): Promise<T> {
  const response = await fetch(`${CLOUD_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new Error(`${response.status} ${endpoint}`)
  return response.json() as Promise<T>
}

async function main() {
  const [workspacePath, extensionPath, pythonPath] = process.argv.slice(2)
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

  const skillMd = pythonPath ? await readFastAPISkillMd(pythonPath) : null

  const server = new McpServer({
    name: "FastAPI MCP Server",
    version: "0.1.0",
  })

  server.registerTool(
    "get_routes",
    {
      description:
        "Use this tool to discover FastAPI routes/endpoints/API paths in the workspace. Prefer this over manually searching files — especially in large codebases, it is faster and more accurate because it resolves router prefixes across include_router chains (a route defined as /users/{id} in a sub-router will show its full resolved path). Use this as a starting point, then read the relevant source files for implementation details. Each result includes a `uri` field (file:/// URL with line number) — always render as clickable markdown links when presenting to the user: [METHOD /path](uri).",
      inputSchema: z.object({}),
    },
    async () => {
      const routes = collectRoutes(apps).map((route) => {
        const absolutePath = fileURLToPath(route.location.filePath)
        const relativePath = path.relative(workspacePath, absolutePath)
        return {
          ...route,
          path: stripLeadingDynamicSegments(route.path),
          location: {
            ...route.location,
            filePath: relativePath,
            uri: `${pathToFileURL(absolutePath).toString()}#L${route.location.line}`,
          },
        }
      })
      return {
        content: [
          {
            type: "text" as const,
            text:
              JSON.stringify(routes, null, 2) +
              "\n\nNote: this is route metadata only. For implementation details (dependencies, validation, response models), read the source file at the location provided for each route." +
              (skillMd ? `\n\nFastAPI coding guidelines:\n\n${skillMd}` : ""),
          },
        ],
      }
    },
  )

  server.registerTool(
    "get_deployment_info",
    {
      description:
        "Returns the live URL, deployment status, and dashboard link for this FastAPI app on FastAPI Cloud. Call this when the user asks about their current deployment status or live URL.",
      inputSchema: z.object({}),
    },
    async () => {
      const configPath = path.join(workspacePath, ".fastapicloud", "cloud.json")
      let config: Config | null = null
      try {
        config = JSON.parse(await fs.readFile(configPath, "utf8"))
      } catch {
        // not configured
      }

      if (!config) {
        return {
          content: [
            {
              type: "text" as const,
              text: "This project is not yet linked to FastAPI Cloud. Use the 'FastAPI Cloud: Deploy Application' command from the command palette (Cmd/Ctrl+Shift+P) to get started.",
            },
          ],
        }
      }

      const token = await readAuthToken()
      if (!token) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not signed in to FastAPI Cloud. Ask the user to run the 'FastAPI: Sign In' command from the VS Code command palette (Cmd/Ctrl+Shift+P).",
            },
          ],
        }
      }

      try {
        const app = await cloudGet<App>(`/apps/${config.app_id}`, token)

        const lines = [`**${app.slug}**`, `Live URL: [${app.url}](${app.url})`]

        if (app.latest_deployment) {
          const { status, dashboard_url } = app.latest_deployment
          if (
            status === DeploymentStatus.success ||
            status === DeploymentStatus.verifying_skipped
          ) {
            lines.push("Status: live")
          } else if (failedStatuses.includes(status)) {
            lines.push(
              `Status: last deployment failed (${status.replace(/_/g, " ")})`,
            )
          } else {
            lines.push(
              `Status: deployment in progress (${status.replace(/_/g, " ")})`,
            )
          }
          lines.push(`Dashboard: [View deployment](${dashboard_url})`)
        } else {
          lines.push("Status: no deployments yet")
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          return {
            content: [
              {
                type: "text" as const,
                text: "FastAPI Cloud session expired. Ask the user to run the 'FastAPI: Sign In' command from the VS Code command palette (Cmd/Ctrl+Shift+P).",
              },
            ],
          }
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch deployment info: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        }
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
