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
export interface Config {
  app_id: string
  team_id: string
}

export interface ListResponse<T> {
  data: T[]
  count: number
}
