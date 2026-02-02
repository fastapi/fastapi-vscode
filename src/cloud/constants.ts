// Base labels (without icons)
const LABEL_SIGN_OUT = "Sign Out"
const LABEL_UNLINK = "Unlink"
const LABEL_SETUP = "Set up FastAPI Cloud"

export const StatusBar = {
  DEFAULT: "$(cloud) FastAPI Cloud",
  SIGN_IN: "$(cloud) Sign into FastAPI Cloud",
  SETUP: `$(cloud) ${LABEL_SETUP}`,
  WARNING: "$(warning) FastAPI Cloud",
} as const

export const Button = {
  SIGN_OUT: LABEL_SIGN_OUT,
  UNLINK: LABEL_UNLINK,
} as const

export const Auth = {
  MSG_SIGN_OUT_CONFIRM: "Sign out of FastAPI Cloud?",
} as const

export const Project = {
  MSG_NO_WORKSPACE: "No workspace folder open",
  MSG_LINKED: (appSlug: string) => `Linked to ${appSlug}`,
  MSG_UNLINK_CONFIRM: (label: string) => `Unlink "${label}" from this project?`,
  MSG_APP_NOT_FOUND:
    "This project is linked to a FastAPI Cloud app that could not be found. Unlink it, then link to the correct app.",
} as const

export const Picker = {
  SELECT_WORKSPACE_LINK: "Select workspace folder to link",
  SELECT_WORKSPACE_UNLINK: "Select workspace folder to unlink",
  SELECT_TEAM: "Select a team",
  SELECT_APP: "Select an app",
  PROMPT_ENTER_APP_NAME: "Enter app name",
  ERR_NOT_AUTHENTICATED: "Please sign in to FastAPI Cloud first.",
  ERR_FETCH_TEAMS: "Failed to fetch teams. Please check your connection.",
  ERR_NO_TEAMS: "No teams found. Please create a team on FastAPI Cloud first.",
  ERR_FETCH_APPS: "Failed to fetch apps. Please check your connection.",
  ERR_NO_APPS:
    "No apps found for this team. Please create an app on FastAPI Cloud first.",
  ERR_CREATE_APP: (error: string) => `Failed to create app: ${error}`,
  ERR_NAME_TOO_SHORT: "Name must be at least 2 characters.",
  ERR_NAME_INVALID:
    "Name can only contain lowercase letters, numbers, and hyphens.",
  MSG_APP_CREATED: (appSlug: string) => `Created app: ${appSlug}`,
} as const

export const Menu = {
  PLACEHOLDER_SETUP: LABEL_SETUP,
  PLACEHOLDER_MORE: "More options",
  LINK_EXISTING: "$(link) Link Existing App",
  LINK_EXISTING_DESC: "Connect to an app on FastAPI Cloud",
  CREATE_NEW: "$(add) Create New App",
  CREATE_NEW_DESC: "Create a new app and link it",
  OPEN_APP: "$(globe) Open App",
  DASHBOARD: "$(link-external) Dashboard",
  MORE: "$(ellipsis) More",
  UNLINK_PROJECT: `$(trash) ${LABEL_UNLINK} Project`,
  UNLINK_PROJECT_DESC: "Disconnect from FastAPI Cloud app",
  SIGN_OUT: `$(sign-out) ${LABEL_SIGN_OUT}`,
  SIGN_OUT_DESC: "Sign out of FastAPI Cloud",
} as const
