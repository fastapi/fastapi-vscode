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
// See: https://github.com/fastapilabs/fastapi-cloud-cli/blob/main/src/fastapi_cloud_cli/commands/deploy.py
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

  if (relativePath.endsWith(".pyc")) {
    return true
  }

  const fileName = parts[parts.length - 1]
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
          label: "$(link) Link Existing App",
          description: "Connect to an app on FastAPI Cloud",
          id: "link",
        },
        {
          label: "$(add) Create New App",
          description: "Create a new app and link it",
          id: "create",
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
      config.app_id,
      deployment.id,
      updateStatus,
    )

    if (result) {
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
    if (statusBarItem) {
      statusBarItem.text = "$(cloud) Deploy failed"
    }
    const action = await vscode.window.showErrorMessage(
      "Deployment failed.",
      "View Logs",
    )
    if (action === "View Logs") {
      vscode.commands.executeCommand("fastapi-vscode.viewLogs")
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

async function createArchive(workspaceRoot: vscode.Uri): Promise<Uint8Array> {
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceRoot, "**/*"),
    "{**/.venv/**,**/__pycache__/**,**/.git/**}",
  )

  const tarFiles: Array<{ name: string; data: Uint8Array }> = []

  for (const file of files) {
    const relativePath = file.path.replace(`${workspaceRoot.path}/`, "")

    if (shouldExclude(relativePath)) continue

    try {
      const content = await vscode.workspace.fs.readFile(file)
      tarFiles.push({
        name: relativePath,
        data: new Uint8Array(content),
      })
    } catch {
      // Skip files we can't read
    }
  }

  return tar(tarFiles) as Uint8Array
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

  formData.append("file", new Blob([archive]))

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
  appId: string,
  deploymentId: string,
  updateStatus: (text: string) => void,
): Promise<Deployment | null> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const deployment = await apiService.getDeployment(appId, deploymentId)

    if (
      deployment.status === DeploymentStatus.success ||
      deployment.status === DeploymentStatus.verifying_skipped
    ) {
      return deployment
    }

    if (failedStatuses.includes(deployment.status)) {
      return null
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
