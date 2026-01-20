/**
 * FastAPI app discovery logic.
 * Handles finding FastAPI apps via pyproject.toml, VS Code settings, or automatic detection.
 */

import { existsSync } from "node:fs"
import { isAbsolute, sep } from "node:path"
import * as toml from "toml"
import * as vscode from "vscode"
import type { EntryPoint } from "./core/internal"
import type { Parser } from "./core/parser"
import { findProjectRoot } from "./core/pathUtils"
import { buildRouterGraph } from "./core/routerResolver"
import { routerNodeToAppDefinition } from "./core/transformer"
import type { AppDefinition } from "./core/types"

export type { EntryPoint }

/**
 * Scans for common FastAPI entry point files (main.py, __init__.py).
 * Returns paths sorted by depth (shallower first).
 */
async function automaticDetectEntryPoints(
  folderPath: string,
): Promise<string[]> {
  const [mainFiles, initFiles] = await Promise.all([
    vscode.workspace.findFiles(
      new vscode.RelativePattern(folderPath, "**/main.py"),
    ),
    vscode.workspace.findFiles(
      new vscode.RelativePattern(folderPath, "**/__init__.py"),
    ),
  ])

  return [...mainFiles, ...initFiles]
    .map((uri) => uri.fsPath)
    .sort((a, b) => a.split(sep).length - b.split(sep).length)
}

/**
 * Parses pyproject.toml to find a defined entrypoint.
 * Supports module:variable notation, e.g. "my_app.main:app"
 */
async function parsePyprojectForEntryPoint(
  folderPath: string,
): Promise<EntryPoint | null> {
  const pyprojectPath = vscode.Uri.joinPath(
    vscode.Uri.file(folderPath),
    "pyproject.toml",
  )

  if (!existsSync(pyprojectPath.fsPath)) {
    return null
  }

  try {
    const document = await vscode.workspace.openTextDocument(pyprojectPath)
    const contents = toml.parse(document.getText()) as Record<string, unknown>

    const entrypoint = (contents.tool as Record<string, unknown> | undefined)
      ?.fastapi as Record<string, unknown> | undefined
    const entrypointValue = entrypoint?.entrypoint as string | undefined

    if (!entrypointValue) {
      return null
    }

    // Parse "my_app.main:app" format (variable name after : is optional)
    const colonIndex = entrypointValue.indexOf(":")
    const modulePath =
      colonIndex === -1 ? entrypointValue : entrypointValue.slice(0, colonIndex)
    const variableName =
      colonIndex === -1 ? undefined : entrypointValue.slice(colonIndex + 1)

    // Convert module path to file path: my_app.main -> my_app/main.py
    const relativePath = `${modulePath.replace(/\./g, sep)}.py`
    const fullPath = vscode.Uri.joinPath(
      vscode.Uri.file(folderPath),
      relativePath,
    ).fsPath

    return existsSync(fullPath) ? { filePath: fullPath, variableName } : null
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
  if (!workspaceFolders) return []

  const apps: AppDefinition[] = []

  for (const folder of workspaceFolders) {
    const config = vscode.workspace.getConfiguration("fastapi", folder.uri)
    const customEntryPoint = config.get<string>("entryPoint")

    let candidates: EntryPoint[]

    // If user specified an entry point in settings, use that
    if (customEntryPoint) {
      const entryPath = isAbsolute(customEntryPoint)
        ? customEntryPoint
        : vscode.Uri.joinPath(folder.uri, customEntryPoint).fsPath

      if (!existsSync(entryPath)) {
        vscode.window.showWarningMessage(
          `FastAPI entry point not found: ${customEntryPoint}`,
        )
        continue
      }

      candidates = [{ filePath: entryPath }]
    } else {
      // Otherwise, check pyproject.toml or auto-detect
      const pyprojectEntry = await parsePyprojectForEntryPoint(
        folder.uri.fsPath,
      )
      candidates = pyprojectEntry
        ? [pyprojectEntry]
        : (await automaticDetectEntryPoints(folder.uri.fsPath)).map(
            (filePath) => ({ filePath }),
          )

      // If no candidates found, try the active editor as a last resort
      if (candidates.length === 0) {
        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor?.document.languageId === "python") {
          candidates = [{ filePath: activeEditor.document.uri.fsPath }]
        }
      }
    }

    for (const candidate of candidates) {
      const projectRoot = findProjectRoot(candidate.filePath, folder.uri.fsPath)
      const routerNode = buildRouterGraph(
        candidate.filePath,
        parser,
        projectRoot,
        candidate.variableName,
      )

      if (routerNode) {
        apps.push(routerNodeToAppDefinition(routerNode, folder.uri.fsPath))
        break
      }
    }
  }

  return apps
}
