/**
 * FastAPI app discovery logic.
 * Handles finding FastAPI apps via pyproject.toml, VS Code settings, or automatic detection.
 */

import * as toml from "toml"
import type { FileSystem } from "./core/filesystem"
import type { EntryPoint } from "./core/internal"
import type { Parser } from "./core/parser"
import { findProjectRoot, uriPath } from "./core/pathUtils"
import { buildRouterGraph } from "./core/routerResolver"
import { routerNodeToAppDefinition } from "./core/transformer"
import { collectRoutes, countRouters } from "./core/treeUtils"
import type { AppDefinition } from "./core/types"
import type { Workspace, WorkspaceFolder } from "./core/workspace"
export type { EntryPoint }

type DiscoveryOptions = {
  log?: (msg: string) => void
  trackEntrypointDetected?: (props: {
    duration_ms: number
    method: "config" | "pyproject" | "heuristic"
    success: boolean
    routes_count: number
    routers_count: number
  }) => void
}

/**
 * Parses an entrypoint string in module:variable notation.
 * Supports formats like "my_app.main:app" or "main".
 * Returns the relative file path and optional variable name.
 */
export function parseEntrypointString(value: string): {
  relativePath: string
  variableName?: string
} {
  const colonIndex = value.indexOf(":")
  const modulePath = colonIndex === -1 ? value : value.slice(0, colonIndex)
  const variableName =
    colonIndex === -1 ? undefined : value.slice(colonIndex + 1)

  const relativePath = `${modulePath.replace(/\./g, "/")}.py`

  return { relativePath, variableName }
}

/**
 * Finds all Python files containing a FastAPI() instantiation.
 * Uses a cheap text pre-filter to avoid tree-sitter parsing non-app files.
 * Returns URI strings sorted by depth (shallower first).
 */
async function findAllFastAPIFiles(
  folder: WorkspaceFolder,
  workspace: Workspace,
  filesystem: FileSystem,
): Promise<string[]> {
  const pyFiles = await workspace.findFiles(
    folder.uri,
    "**/*.py",
    "**/{.venv,venv,__pycache__,node_modules,.git,tests,test}/**",
  )

  const results: string[] = []
  for (const uri of pyFiles) {
    const fileName = uri.split("/").pop() ?? ""
    if (
      fileName.startsWith("test_") ||
      fileName.endsWith("_test.py") ||
      fileName === "conftest.py"
    )
      continue
    const content = await filesystem.readFile(uri)
    if (new TextDecoder().decode(content).includes("FastAPI(")) {
      results.push(uri.toString())
    }
  }

  return results.sort(
    (a, b) => uriPath(a).split("/").length - uriPath(b).split("/").length,
  )
}

/**
 * Parses pyproject.toml to find a defined entrypoint.
 * Supports module:variable notation, e.g. "my_app.main:app"
 */
async function parsePyprojectForEntryPoint(
  folderUri: string,
  workspace: Workspace,
  filesystem: FileSystem,
): Promise<EntryPoint | null> {
  const pyprojectTomlFiles = await workspace.findFiles(
    folderUri,
    "**/pyproject.toml",
    "**/{.venv,venv,__pycache__,node_modules,.git,tests,test}/**",
  )

  if (pyprojectTomlFiles.length === 0) {
    return null
  }

  pyprojectTomlFiles.sort((a, b) => a.split("/").length - b.split("/").length)

  for (const fileUri of pyprojectTomlFiles) {
    try {
      const content = await filesystem.readFile(fileUri)
      const contents = toml.parse(new TextDecoder().decode(content)) as Record<
        string,
        unknown
      >

      const entrypoint = (contents.tool as Record<string, unknown> | undefined)
        ?.fastapi as Record<string, unknown> | undefined
      const entrypointValue = entrypoint?.entrypoint as string | undefined

      if (!entrypointValue) {
        continue
      }

      const { relativePath, variableName } =
        parseEntrypointString(entrypointValue)
      const dirUri = filesystem.dirname(fileUri)
      const fullUri = filesystem.joinPath(dirUri, relativePath)

      return (await filesystem.exists(fullUri))
        ? { filePath: fullUri, variableName }
        : null
    } catch {
      // Invalid TOML syntax - silently fall back to next file
    }
  }

  return null
}

/**
 * Discovers FastAPI apps in the workspace.
 * Priority: VS Code settings > pyproject.toml > automatic detection
 */
export async function discoverFastAPIApps(
  parser: Parser,
  workspace: Workspace,
  filesystem: FileSystem,
  { log = () => {}, trackEntrypointDetected = () => {} }: DiscoveryOptions = {},
): Promise<AppDefinition[]> {
  const workspaceFolders = workspace.workspaceFolders
  if (!workspaceFolders) {
    log("No workspace folders found")
    return []
  }

  log(
    `Discovering FastAPI apps in ${workspaceFolders.length} workspace folder(s)...`,
  )

  const apps: AppDefinition[] = []

  for (const folder of workspaceFolders) {
    const folderStart = performance.now()
    let detectionMethod: "config" | "pyproject" | "heuristic" = "heuristic"
    const folderApps: AppDefinition[] = []
    const customEntryPoint = workspace.getFastAPIEntrypoint(folder.uri)

    let candidates: EntryPoint[]

    // If user specified an entry point in settings, use that
    if (customEntryPoint) {
      const { relativePath, variableName } =
        parseEntrypointString(customEntryPoint)
      const entryUri = filesystem.joinPath(folder.uri, relativePath)

      if (!(await filesystem.exists(entryUri.toString()))) {
        log(`Custom entry point not found: ${customEntryPoint}`)
        workspace.showWarning(
          `FastAPI entry point not found: ${customEntryPoint}`,
        )
        continue
      }

      log(`Using custom entry point: ${customEntryPoint}`)
      candidates = [{ filePath: entryUri.toString(), variableName }]
      detectionMethod = "config"
    } else {
      // Otherwise, check pyproject.toml or auto-detect
      const pyprojectEntry = await parsePyprojectForEntryPoint(
        folder.uri,
        workspace,
        filesystem,
      )
      if (pyprojectEntry) {
        candidates = [pyprojectEntry]
        detectionMethod = "pyproject"
      } else {
        const detected = await findAllFastAPIFiles(
          folder,
          workspace,
          filesystem,
        )
        candidates = detected.map((filePath) => ({ filePath }))
        detectionMethod = "heuristic"
        log(
          `Found ${candidates.length} candidate FastAPI file(s) in ${folder.name}`,
        )
      }

      // If no candidates found, try the active editor as a last resort
      if (candidates.length === 0) {
        const activeEditor = workspace.getActiveEditor()
        if (activeEditor?.endsWith(".py")) {
          candidates = [{ filePath: activeEditor }]
        }
      }
    }

    for (const candidate of candidates) {
      const projectRoot = await findProjectRoot(
        candidate.filePath,
        folder.uri.toString(),
        filesystem,
      )
      const routerNode = await buildRouterGraph(
        candidate.filePath,
        parser,
        projectRoot,
        filesystem,
        candidate.variableName,
      )

      if (routerNode) {
        const app = routerNodeToAppDefinition(routerNode, candidate.filePath)
        folderApps.push(app)
        apps.push(app)
      }
    }

    const folderRoutes = collectRoutes(folderApps)

    if (folderApps.length > 0) {
      log(
        `Found ${folderApps.length} FastAPI app(s) with ${folderRoutes.length} route(s) in ${folder.name}`,
      )
    }

    trackEntrypointDetected({
      duration_ms: Math.round(performance.now() - folderStart),
      method: detectionMethod,
      success: folderApps.length > 0,
      routes_count: folderRoutes.length,
      routers_count: countRouters(folderApps),
    })
  }

  if (apps.length === 0) {
    log("No FastAPI apps found in workspace")
  }

  return apps
}
