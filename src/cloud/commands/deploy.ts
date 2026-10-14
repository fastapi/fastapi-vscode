import { Minimatch } from "minimatch"
// @ts-expect-error - tinytar has no type definitions
import { tar } from "tinytar"
import * as vscode from "vscode"
import {
  trackCloudAppOpened,
  trackCloudDashboardOpened,
} from "../../utils/telemetry"
import type { ApiService } from "../api"
import { AUTH_PROVIDER_ID } from "../auth"
import type { ConfigService } from "../config"
import {
  type App,
  type Config,
  type Deployment,
  DeploymentStatus,
  failedStatuses,
  statusMessages,
} from "../types"
import { ui } from "../ui/dialogs"
import { createNewApp, pickExistingApp, pickTeam } from "../ui/pickers"

// Exclusion patterns - aligned with fastapi-cloud-cli
// See: https://github.com/fastapilabs/fastapi-cloud-cli/blob/main/src/fastapi_cloud_cli/commands/deploy/archive.py
const EXCLUDE_PARTS = [
  ".venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".git",
  ".gitignore",
  ".fastapicloudignore",
]

// 300 attempts x 2 seconds = 10 minutes maximum
const MAX_POLL_ATTEMPTS = 300
const DEPLOYMENT_POLL_INTERVAL_MS = 2000

export function shouldExclude(relativePath: string): boolean {
  const parts = relativePath.split("/")

  if (parts.some((part) => EXCLUDE_PARTS.includes(part))) {
    return true
  }

  const fileName = parts[parts.length - 1]
  if (fileName.endsWith(".pyc") && fileName.lastIndexOf(".") > 0) {
    return true
  }
  if (fileName === ".env" || fileName.startsWith(".env.")) {
    return true
  }

  return false
}

export interface DeployContext {
  workspaceRoot: vscode.Uri | null
  configService: ConfigService
  apiService: ApiService
  statusBarItem: vscode.StatusBarItem
}

export async function deploy(context: DeployContext): Promise<boolean> {
  const { workspaceRoot, configService, apiService, statusBarItem } = context

  if (!workspaceRoot) {
    ui.showErrorMessage("No workspace folder open")
    return false
  }

  const updateStatus = (text: string) => {
    statusBarItem.text = `$(sync~spin) ${text}`
  }

  const session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, [], {
    silent: true,
  })
  if (!session) {
    const result = await ui.showErrorMessage(
      "Please sign in to FastAPI Cloud first.",
      "Sign In",
    )
    if (result === "Sign In") {
      vscode.commands.executeCommand("fastapi-vscode.signIn")
    }
    return false
  }

  const existingConfig = await configService.getConfig(workspaceRoot)
  const config: Config = existingConfig ?? { app_id: "", team_id: "" }
  if (!config.app_id) {
    const team = await pickTeam(apiService)
    if (!team) return false

    const choice = await ui.showQuickPick(
      [
        {
          label: "$(add) Create New App",
          description: "Create a new app and deploy",
          id: "create",
        },
        {
          label: "$(link) Link Existing App",
          description: "Connect to an app already on FastAPI Cloud",
          id: "link",
        },
      ],
      { placeHolder: "Set up FastAPI Cloud" },
    )
    if (!choice) return false

    let app: App | null
    if (choice.id === "create") {
      const folderName = workspaceRoot.path.split("/").pop() || "my-app"
      app = await createNewApp(apiService, team, folderName)
    } else {
      app = await pickExistingApp(apiService, team)
    }
    if (!app) return false

    config.app_id = app.id
    config.team_id = team.id
    config.app_slug = app.slug
    await configService.writeConfig(workspaceRoot, config)
  }

  try {
    updateStatus("Creating deployment...")
    const deployment = await apiService.createDeployment(config.app_id)

    updateStatus("Preparing files...")
    const archive = await createArchive(workspaceRoot)

    updateStatus("Uploading...")
    const uploadInfo = await apiService.getUploadUrl(deployment.id)
    await uploadToS3(uploadInfo.url, uploadInfo.fields, archive)

    updateStatus("Starting build...")
    await apiService.completeUpload(deployment.id)

    // Poll for deployment status
    const result = await pollDeploymentStatus(
      apiService,
      deployment.id,
      updateStatus,
    )

    const isSuccess =
      result !== null &&
      (result.status === DeploymentStatus.success ||
        result.status === DeploymentStatus.verifying_skipped)

    if (isSuccess) {
      statusBarItem.text = `$(cloud) ${config.app_slug ?? "Deployed"}`

      const action = await ui.showInformationMessage(
        "Deployed successfully!",
        "Open App",
        "View Dashboard",
      )

      if (action === "Open App" && result.url) {
        vscode.env.openExternal(vscode.Uri.parse(result.url))
        trackCloudAppOpened(config.app_id)
      } else if (action === "View Dashboard" && result.dashboard_url) {
        vscode.env.openExternal(vscode.Uri.parse(result.dashboard_url))
        trackCloudDashboardOpened(config.app_id)
      }
      return true
    }

    statusBarItem.text = "$(cloud) Deploy failed"
    const action = await vscode.window.showErrorMessage(
      "Deployment failed.",
      "View Dashboard",
    )
    if (action === "View Dashboard" && result?.dashboard_url) {
      vscode.env.openExternal(vscode.Uri.parse(result.dashboard_url))
      trackCloudDashboardOpened(config.app_id)
    }
    return false
  } catch (error) {
    if (statusBarItem) {
      statusBarItem.text = "$(cloud) Deploy failed"
    }
    vscode.window.showErrorMessage(
      `Deploy failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    )
    return false
  }
}

// Match each entry directly, as rignore does while walking. Directory rules
// decide whether to descend; they must not override separate rules for files.
const IGNORE_FILES = [
  ".fastapicloudignore",
  ".ignore",
  ".gitignore",
  "info/exclude",
] as const
type IgnoreFile = (typeof IGNORE_FILES)[number]
interface IgnoreRule {
  matcher: Minimatch
  directoryOnly: boolean
  exclude: boolean
}
interface DirectoryRules {
  directory: vscode.Uri
  matchers: Partial<Record<IgnoreFile, IgnoreRule[]>>
  gitRoot: boolean
}

// Tests supply an isolated home and working directory. In production these
// come from the extension host, including when it runs on a remote machine.
export interface ArchiveEnvironment {
  home?: vscode.Uri
  configHome?: vscode.Uri
  cwd: vscode.Uri
}

function utf8Bytes(value: string): string {
  // Rust globset matches UTF-8 bytes, including for ? and character classes.
  return Array.from(new TextEncoder().encode(value), (byte) =>
    String.fromCharCode(byte),
  ).join("")
}

function parseIgnore(contents: string): IgnoreRule[] {
  const rules: IgnoreRule[] = []
  for (let pattern of contents.split(/\r?\n/)) {
    if (pattern.startsWith("#")) continue
    if (!pattern.endsWith("\\ ")) pattern = pattern.trimEnd()
    if (!pattern) continue
    const exclude = !pattern.startsWith("!")
    if (!exclude || pattern.startsWith("\\!") || pattern.startsWith("\\#")) {
      pattern = pattern.slice(1)
    }
    const anchored = pattern.startsWith("/")
    if (anchored) pattern = pattern.slice(1)
    const directoryOnly = pattern.endsWith("/")
    if (directoryOnly) pattern = pattern.slice(0, -1).replace(/\\$/, "")
    if (!anchored && !pattern.includes("/")) pattern = `**/${pattern}`
    if (pattern.endsWith("/**")) pattern += "/*"
    // globset has brace alternatives, but no numeric brace ranges or POSIX
    // character classes. Normalize those before using the glob matcher.
    pattern = pattern.replace(
      /(?<!\\)\{([^{}]*?)\}/g,
      (whole, inner: string) => (inner.includes(",") ? whole : inner),
    )
    pattern = pattern.replace(/\[\[:/g, "[\\[:")
    rules.push({
      matcher: new Minimatch(utf8Bytes(pattern), {
        dot: true,
        noext: true,
        nonegate: true,
        nocomment: true,
        platform: "linux",
      }),
      directoryOnly,
      exclude,
    })
  }
  return rules
}

async function readOptional(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
  } catch {
    // rignore skips ignore/config files it cannot read.
    return undefined
  }
}

function resolvePath(base: vscode.Uri, path: string): vscode.Uri {
  return /^(\/|[A-Za-z]:[\\/])/.test(path)
    ? base.with({ path: vscode.Uri.file(path).path })
    : vscode.Uri.joinPath(base, path)
}

async function archiveEnvironment(
  workspaceRoot: vscode.Uri,
): Promise<ArchiveEnvironment> {
  try {
    const os = await import("node:os")
    return {
      home: vscode.Uri.file(os.homedir()),
      configHome: process.env.XDG_CONFIG_HOME
        ? vscode.Uri.file(process.env.XDG_CONFIG_HOME)
        : undefined,
      cwd: workspaceRoot,
    }
  } catch {
    // Browser workspaces have no host home directory or global Git config.
    return { cwd: workspaceRoot }
  }
}

async function globalIgnore(
  environment: ArchiveEnvironment,
): Promise<IgnoreRule[]> {
  const { home, cwd } = environment
  if (!home) return []
  const configHome =
    environment.configHome ?? vscode.Uri.joinPath(home, ".config")
  let path: string | undefined
  for (const config of [
    vscode.Uri.joinPath(home, ".gitconfig"),
    vscode.Uri.joinPath(configHome, "git/config"),
  ]) {
    const contents = await readOptional(config)
    // Match the excludesFile lookup in the CLI's ignore crate, including its
    // home-config precedence and quoted/tilde paths.
    path = contents?.match(/^\s*excludesfile\s*=\s*"?\s*(\S+?)\s*"?\s*$/im)?.[1]
    if (path) break
  }
  const uri = path
    ? resolvePath(cwd, path.replace(/~/g, home.fsPath))
    : vscode.Uri.joinPath(configHome, "git/ignore")
  return parseIgnore((await readOptional(uri)) ?? "")
}

async function loadRules(
  directory: vscode.Uri,
  cwd: vscode.Uri,
): Promise<DirectoryRules> {
  const matchers: DirectoryRules["matchers"] = {}
  for (const name of IGNORE_FILES.slice(0, 3)) {
    const contents = await readOptional(vscode.Uri.joinPath(directory, name))
    if (contents !== undefined) matchers[name] = parseIgnore(contents)
  }
  const git = vscode.Uri.joinPath(directory, ".git")
  let type: vscode.FileType
  try {
    type = (await vscode.workspace.fs.stat(git)).type
  } catch {
    return { directory, matchers, gitRoot: false }
  }
  let gitDirectory: vscode.Uri | undefined = git
  if (type & vscode.FileType.File) {
    const target = (await readOptional(git))
      ?.split(/\r?\n/)[0]
      .match(/^gitdir: (.+)$/)?.[1]
    const actual = target ? resolvePath(cwd, target) : undefined
    const common = actual
      ? (await readOptional(vscode.Uri.joinPath(actual, "commondir")))?.split(
          /\r?\n/,
        )[0]
      : undefined
    gitDirectory =
      actual && common
        ? resolvePath(common.startsWith(".") ? actual : cwd, common)
        : undefined
  }
  if (gitDirectory) {
    const contents = await readOptional(
      vscode.Uri.joinPath(gitDirectory, "info/exclude"),
    )
    if (contents !== undefined) matchers["info/exclude"] = parseIgnore(contents)
  }
  return { directory, matchers, gitRoot: true }
}

function matchRules(
  rules: IgnoreRule[] | undefined,
  path: string,
  isDirectory: boolean,
): boolean | undefined {
  const bytes = utf8Bytes(path)
  if (rules) {
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i]
      if ((!rule.directoryOnly || isDirectory) && rule.matcher.match(bytes))
        return rule.exclude
    }
  }
  return undefined
}

function isIgnored(
  uri: vscode.Uri,
  isDirectory: boolean,
  rules: DirectoryRules[],
  global: IgnoreRule[],
  cwd: vscode.Uri,
): boolean {
  let gitRoot = -1
  for (let i = 0; i < rules.length; i++) if (rules[i].gitRoot) gitRoot = i
  for (const name of IGNORE_FILES) {
    const gitRelated = name === ".gitignore" || name === "info/exclude"
    if (gitRelated && gitRoot === -1) continue
    for (let i = rules.length - 1; i >= (gitRelated ? gitRoot : 0); i--) {
      const { directory, matchers } = rules[i]
      const path = uri.path.slice(directory.path.replace(/\/$/, "").length + 1)
      const result = matchRules(matchers[name], path, isDirectory)
      if (result !== undefined) return result
    }
  }
  const path = uri.path.startsWith(`${cwd.path.replace(/\/$/, "")}/`)
    ? uri.path.slice(cwd.path.replace(/\/$/, "").length + 1)
    : uri.path
  return gitRoot !== -1 && (matchRules(global, path, isDirectory) ?? false)
}

export async function createArchive(
  workspaceRoot: vscode.Uri,
  environment?: ArchiveEnvironment,
): Promise<Uint8Array> {
  const context = environment ?? (await archiveEnvironment(workspaceRoot))
  const global = await globalIgnore(context)
  const ancestors: vscode.Uri[] = []
  let directory = workspaceRoot
  while (true) {
    ancestors.unshift(directory)
    const parent = vscode.Uri.joinPath(directory, "..")
    if (parent.path === directory.path) break
    directory = parent
  }
  const rules: DirectoryRules[] = []
  for (const ancestor of ancestors)
    rules.push(await loadRules(ancestor, context.cwd))

  const files: Array<{ name: string; data: Uint8Array }> = []
  async function walk(
    directory: vscode.Uri,
    prefix: string,
    rules: DirectoryRules[],
  ): Promise<void> {
    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(directory)
    } catch {
      return
    }
    for (const [name, type] of entries) {
      const relativePath = `${prefix}${name}`
      const uri = vscode.Uri.joinPath(directory, name)
      if (shouldExclude(uri.path)) continue
      const isDirectory = (type & vscode.FileType.Directory) !== 0
      if (isIgnored(uri, isDirectory, rules, global, context.cwd)) continue
      if (isDirectory) {
        if (type & vscode.FileType.SymbolicLink) continue
        await walk(uri, `${relativePath}/`, [
          ...rules,
          await loadRules(uri, context.cwd),
        ])
      } else if (type & (vscode.FileType.File | vscode.FileType.SymbolicLink)) {
        files.push({
          name: relativePath,
          data: await vscode.workspace.fs.readFile(uri),
        })
      }
    }
  }
  if (!shouldExclude(workspaceRoot.path)) await walk(workspaceRoot, "", rules)
  return tar(files) as Uint8Array
}

async function uploadToS3(
  url: string,
  fields: Record<string, string>,
  archive: Uint8Array,
): Promise<void> {
  const formData = new FormData()

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value)
  }

  formData.append("file", new Blob([archive.slice().buffer]))

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`)
  }
}

async function pollDeploymentStatus(
  apiService: ApiService,
  deploymentId: string,
  updateStatus: (text: string) => void,
): Promise<Deployment | null> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const deployment = await apiService.getDeployment(deploymentId)

    if (
      deployment.status === DeploymentStatus.success ||
      deployment.status === DeploymentStatus.verifying_skipped
    ) {
      return deployment
    }

    if (failedStatuses.includes(deployment.status)) {
      return deployment
    }

    const message =
      statusMessages[deployment.status] || `Status: ${deployment.status}`
    updateStatus(message)

    await new Promise((resolve) =>
      setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL_MS),
    )
  }

  return null
}
