/**
 * FastAPI app discovery logic.
 * Handles finding FastAPI apps via pyproject.toml, VS Code settings, or automatic detection.
 */

import * as toml from "toml"
import * as vscode from "vscode"
import type { EntryPoint } from "./core/internal"
import type { Parser } from "./core/parser"
import { findProjectRoot, uriPath } from "./core/pathUtils"
import { buildRouterGraph } from "./core/routerResolver"
import { routerNodeToAppDefinition } from "./core/transformer"
import type { AppDefinition } from "./core/types"
import { vscodeFileSystem } from "./providers/vscodeFileSystem"
import { log } from "./utils/logger"
import {
  countRouters,
  countRoutes,
  createTimer,
  trackEntrypointDetected,
} from "./utils/telemetry"

export type { EntryPoint }

/**
 * Scans for common FastAPI entry point files (main.py, __init__.py).
 * Returns URI strings sorted by depth (shallower first).
 */
async function automaticDetectEntryPoints(
  folder: vscode.WorkspaceFolder,
): Promise<string[]> {
  const [mainFiles, initFiles] = await Promise.all([
    vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/main.py"),
    ),
    vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/__init__.py"),
    ),
  ])

  return [...mainFiles, ...initFiles]
    .map((uri) => uri.toString())
    .sort((a, b) => uriPath(a).split("/").length - uriPath(b).split("/").length)
}

/**
 * Parses pyproject.toml to find a defined entrypoint.
 * Supports module:variable notation, e.g. "my_app.main:app"
 */
async function parsePyprojectForEntryPoint(
  folderUri: vscode.Uri,
): Promise<EntryPoint | null> {
  const pyprojectUri = vscode.Uri.joinPath(folderUri, "pyproject.toml")

  if (!(await vscodeFileSystem.exists(pyprojectUri.toString()))) {
    return null
  }

  try {
    const document = await vscode.workspace.openTextDocument(pyprojectUri)
    const contents = toml.parse(document.getText()) as Record<string, unknown>

    const entrypoint = (contents.tool as Record<string, unknown> | undefined)
      ?.fastapi as Record<string, unknown> | undefined
    const entrypointValue = entrypoint?.entrypoint as string | undefined

    if (!entrypointValue) {
      return null
    }

    // Parse "my_app.main:app" or "api.py:app" format (variable name after : is optional)
    const colonIndex = entrypointValue.indexOf(":")
    const modulePath =
      colonIndex === -1 ? entrypointValue : entrypointValue.slice(0, colonIndex)
    const variableName =
      colonIndex === -1 ? undefined : entrypointValue.slice(colonIndex + 1)

    // Handle both module format (api.module) and file format (api.py)
    const relativePath =
      modulePath.endsWith(".py") && !modulePath.includes("/")
        ? modulePath // Simple file path: api.py -> api.py
        : `${modulePath.replace(/\./g, "/")}.py` // Module path: my_app.main -> my_app/main.py
    const fullUri = vscode.Uri.joinPath(folderUri, relativePath)

    return (await vscodeFileSystem.exists(fullUri.toString()))
      ? { filePath: fullUri.toString(), variableName }
      : null
  } catch {
    // Invalid TOML syntax - silently fall back to auto-detection
    return null
  }
}

/**
 * Discovers FastAPI apps in the workspace.
 * Priority: VS Code settings > pyproject.toml > automatic detection
 */
export async function discoverFastAPIApps(
  parser: Parser,
): Promise<AppDefinition[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders) {
    log("No workspace folders found")
    return []
  }

  log(
    `Discovering FastAPI apps in ${workspaceFolders.length} workspace folder(s)...`,
  )

  const apps: AppDefinition[] = []

  for (const folder of workspaceFolders) {
    const folderTimer = createTimer()
    let detectionMethod: "config" | "pyproject" | "heuristic" = "heuristic"
    const folderApps: AppDefinition[] = []
    const config = vscode.workspace.getConfiguration("fastapi", folder.uri)
    const customEntryPoint = config.get<string>("entryPoint")

    let candidates: EntryPoint[]

    // If user specified an entry point in settings, use that
    if (customEntryPoint) {
      const entryUri = customEntryPoint.startsWith("/")
        ? vscode.Uri.file(customEntryPoint)
        : vscode.Uri.joinPath(folder.uri, customEntryPoint)

      if (!(await vscodeFileSystem.exists(entryUri.toString()))) {
        log(`Custom entry point not found: ${customEntryPoint}`)
        vscode.window.showWarningMessage(
          `FastAPI entry point not found: ${customEntryPoint}`,
        )
        continue
      }

      log(`Using custom entry point: ${customEntryPoint}`)
      candidates = [{ filePath: entryUri.toString() }]
      detectionMethod = "config"
    } else {
      // Otherwise, check pyproject.toml or auto-detect
      const pyprojectEntry = await parsePyprojectForEntryPoint(folder.uri)
      if (pyprojectEntry) {
        candidates = [pyprojectEntry]
        detectionMethod = "pyproject"
      } else {
        const detected = await automaticDetectEntryPoints(folder)
        candidates = detected.map((filePath) => ({ filePath }))
        detectionMethod = "heuristic"
        log(
          `Found ${candidates.length} candidate entry file(s) in ${folder.name}`,
        )
      }

      // If no candidates found, try the active editor as a last resort
      if (candidates.length === 0) {
        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor?.document.languageId === "python") {
          candidates = [{ filePath: activeEditor.document.uri.toString() }]
        }
      }
    }

    for (const candidate of candidates) {
      const projectRoot = await findProjectRoot(
        candidate.filePath,
        folder.uri.toString(),
        vscodeFileSystem,
      )
      const routerNode = await buildRouterGraph(
        candidate.filePath,
        parser,
        projectRoot,
        vscodeFileSystem,
        candidate.variableName,
      )

      if (routerNode) {
        const app = routerNodeToAppDefinition(routerNode, folder.uri.fsPath)
        // Count all routes: direct routes + routes in all routers (recursively)
        const countRoutes = (routers: typeof app.routers): number =>
          routers.reduce(
            (sum, r) => sum + r.routes.length + countRoutes(r.children),
            0,
          )
        const totalRoutes = app.routes.length + countRoutes(app.routers)
        log(
          `Found FastAPI app "${app.name}" with ${totalRoutes} route(s) in ${app.routers.length} router(s)`,
        )
        folderApps.push(app)
        apps.push(app)
        break // TODO: Only use first successful app per workspace folder, for now
      }
    }

    // Track entrypoint detection per workspace folder
    trackEntrypointDetected({
      duration_ms: folderTimer(),
      method: detectionMethod,
      success: folderApps.length > 0,
      routes_count: countRoutes(folderApps),
      routers_count: countRouters(folderApps),
    })
  }

  if (apps.length === 0) {
    log("No FastAPI apps found in workspace")
  }

  return apps
}
