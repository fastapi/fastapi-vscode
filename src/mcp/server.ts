import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
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

class UnauthorizedError extends Error {}

async function fetchAppLogs(
  appId: string,
  token: string,
  tail: number,
): Promise<Array<{ timestamp: string; message: string; level: string }>> {
  const params = new URLSearchParams({
    tail: String(tail),
    since: "1d",
    follow: "false",
  })
  const response = await fetch(
    `${CLOUD_API_BASE}/apps/${appId}/logs/stream?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok || !response.body)
    throw new Error(`${response.status} /apps/${appId}/logs/stream`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const entries: Array<{ timestamp: string; message: string; level: string }> =
    []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line) as Record<string, unknown>
          if (data.type === "heartbeat") continue
          if (data.type === "error")
            throw new Error((data.message as string) ?? "Log stream error")
          if (data.timestamp && data.message && data.level) {
            entries.push(
              data as { timestamp: string; message: string; level: string },
            )
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return entries
}

async function parseFileRefs(
  message: string,
  workspacePath: string,
): Promise<Array<{ uri: string; display: string }>> {
  const refs: Array<{ uri: string; display: string }> = []
  const pattern = /File "([^"]+)", line (\d+)/g
  const containerPrefixes = ["/app/", "/code/", "/workspace/", "/srv/"]
  for (
    let match = pattern.exec(message);
    match !== null;
    match = pattern.exec(message)
  ) {
    const [, containerPath, lineStr] = match
    if (
      containerPath.includes("site-packages") ||
      containerPath.includes(".venv")
    )
      continue
    const line = Number.parseInt(lineStr, 10)
    for (const prefix of containerPrefixes) {
      if (containerPath.startsWith(prefix)) {
        const relative = containerPath.slice(prefix.length)
        const localPath = path.join(workspacePath, relative)
        try {
          await fs.access(localPath)
          refs.push({
            uri: `${pathToFileURL(localPath).toString()}#L${line}`,
            display: `${relative}:${line}`,
          })
        } catch {
          // file doesn't exist locally
        }
        break
      }
    }
  }
  return refs
}

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

  server.registerTool(
    "get_log_errors",
    {
      description:
        "Returns recent warnings and errors from the deployed FastAPI app on FastAPI Cloud, with links to the likely source locations in your local codebase. Call this when the user reports errors, unexpected behavior, crashes, or wants to debug why their app is failing in production. Each result includes a `uri` field (file:/// URL with line number) — always render as clickable markdown links: [file.py:line](uri).",
      inputSchema: z.object({}),
    },
    async () => {
      // Read config
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

      // Read auth
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
        // Fetch logs, filtered to warning/error level
        const error_levels = new Set(["warning", "error", "critical"])
        const all_logs = await fetchAppLogs(config.app_id, token, 500)
        const error_logs = all_logs.filter((log) =>
          error_levels.has(log.level.toLowerCase()),
        )

        if (error_logs.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No recent warnings or errors found in the logs.",
              },
            ],
          }
        }

        // Parse file refs from each entry and convert to clickable links
        const results = await Promise.all(
          error_logs.slice(-50).map(async (log) => {
            const refs = await parseFileRefs(log.message, workspacePath)
            return {
              ...log,
              refs,
            }
          }),
        )

        return {
          content: [
            {
              type: "text" as const,
              text:
                JSON.stringify(results, null, 2) +
                "\n\nNote: the `refs` field for each log entry contains an array of file references parsed from the log message. Each reference has a `uri` field (file:/// URL with line number) that can be rendered as a clickable markdown link to the relevant source code location.",
            },
          ],
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
              text: `Failed to fetch logs: ${err instanceof Error ? err.message : String(err)}`,
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
