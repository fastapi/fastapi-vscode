export interface Team {
  id: string
  name: string
  slug: string
}

export interface App {
  id: string
  slug: string
  url: string
  team_id: string
  latest_deployment?: Deployment
}

export interface Deployment {
  id: string
  slug: string
  status: DeploymentStatus
  url: string
  dashboard_url: string
}

export enum DeploymentStatus {
  waiting_upload = "waiting_upload",
  upload_cancelled = "upload_cancelled",
  ready_for_build = "ready_for_build",
  building = "building",
  extracting = "extracting",
  extracting_failed = "extracting_failed",
  building_image = "building_image",
  building_image_failed = "building_image_failed",
  deploying = "deploying",
  deploying_failed = "deploying_failed",
  verifying = "verifying",
  verifying_failed = "verifying_failed",
  verifying_skipped = "verifying_skipped",
  success = "success",
  failed = "failed",
}

export const failedStatuses: DeploymentStatus[] = [
  DeploymentStatus.extracting_failed,
  DeploymentStatus.building_image_failed,
  DeploymentStatus.deploying_failed,
  DeploymentStatus.verifying_failed,
  DeploymentStatus.failed,
]

export const statusMessages: Record<DeploymentStatus, string> = {
  [DeploymentStatus.waiting_upload]: "Waiting for upload...",
  [DeploymentStatus.upload_cancelled]: "Upload cancelled",
  [DeploymentStatus.ready_for_build]: "Ready for build...",
  [DeploymentStatus.building]: "Building...",
  [DeploymentStatus.extracting]: "Extracting...",
  [DeploymentStatus.extracting_failed]: "Extraction failed",
  [DeploymentStatus.building_image]: "Building image...",
  [DeploymentStatus.building_image_failed]: "Image build failed",
  [DeploymentStatus.deploying]: "Deploying...",
  [DeploymentStatus.deploying_failed]: "Deployment failed",
  [DeploymentStatus.verifying]: "Verifying...",
  [DeploymentStatus.verifying_failed]: "Verification failed",
  [DeploymentStatus.verifying_skipped]: "Verification skipped",
  [DeploymentStatus.success]: "Success",
  [DeploymentStatus.failed]: "Failed",
}

export interface Config {
  app_id: string
  team_id: string
  app_slug?: string
}

export interface UploadInfo {
  url: string
  fields: Record<string, string>
}

export interface User {
  email: string
  full_name: string
}

export interface ListResponse<T> {
  data: T[]
  count: number
}

export interface AuthProvider {
  signOut(): Promise<void>
}

export type WorkspaceState =
  | { status: "not_configured" } // No config file exists
  | { status: "linked"; app: App; team: Team } // Successfully linked to an app
  | {
      status: "not_found" // Config exists but app/team not found (404)
      warningShown: boolean
    }
  | { status: "error" } // Config exists but transient error (network, 500, etc.)
  | { status: "refreshing" } // Currently fetching data
