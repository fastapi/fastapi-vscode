// Base labels (without icons)
const LABEL_SIGN_OUT = "Sign Out"
const LABEL_UNLINK = "Unlink"
const LABEL_SETUP = "Set up FastAPI Cloud"

// Status bar text constants
export const STATUS_BAR_DEFAULT = "$(cloud) FastAPI Cloud"
export const STATUS_BAR_SIGN_IN = "$(cloud) Sign into FastAPI Cloud"
export const STATUS_BAR_SETUP = `$(cloud) ${LABEL_SETUP}`
export const STATUS_BAR_WARNING = "$(warning) FastAPI Cloud"

// Button labels
export const BTN_SIGN_OUT = LABEL_SIGN_OUT
export const BTN_UNLINK = LABEL_UNLINK

// Auth command messages
export const MSG_SIGN_OUT_CONFIRM = "Sign out of FastAPI Cloud?"

// Project command messages
export const MSG_NO_WORKSPACE = "No workspace folder open"
export const MSG_LINKED = (appSlug: string) => `Linked to ${appSlug}`
export const MSG_UNLINK_CONFIRM = (label: string) =>
  `Unlink "${label}" from this project?`

// Picker placeholders
export const PICKER_SELECT_WORKSPACE_LINK = "Select workspace folder to link"
export const PICKER_SELECT_WORKSPACE_UNLINK =
  "Select workspace folder to unlink"
export const PICKER_SELECT_TEAM = "Select a team"
export const PICKER_SELECT_APP = "Select an app"

// Controller messages
export const MSG_APP_NOT_FOUND =
  "This project is linked to a FastAPI Cloud app that could not be found. Unlink it, then link to the correct app."

// Menu messages and labels
export const MENU_PLACEHOLDER_SETUP = LABEL_SETUP
export const MENU_PLACEHOLDER_MORE = "More options"
export const MENU_LINK_EXISTING = "$(link) Link Existing App"
export const MENU_LINK_EXISTING_DESC = "Connect to an app on FastAPI Cloud"
export const MENU_CREATE_NEW = "$(add) Create New App"
export const MENU_CREATE_NEW_DESC = "Create a new app and link it"
export const MENU_OPEN_APP = "$(globe) Open App"
export const MENU_DASHBOARD = "$(link-external) Dashboard"
export const MENU_MORE = "$(ellipsis) More"
export const MENU_UNLINK_PROJECT = `$(trash) ${LABEL_UNLINK} Project`
export const MENU_UNLINK_PROJECT_DESC = "Disconnect from FastAPI Cloud app"
export const MENU_SIGN_OUT = `$(sign-out) ${LABEL_SIGN_OUT}`
export const MENU_SIGN_OUT_DESC = "Sign out of FastAPI Cloud"

// Picker error messages
export const ERR_NOT_AUTHENTICATED = "Please sign in to FastAPI Cloud first."
export const ERR_FETCH_TEAMS =
  "Failed to fetch teams. Please check your connection."
export const ERR_NO_TEAMS =
  "No teams found. Please create a team on FastAPI Cloud first."
export const ERR_FETCH_APPS =
  "Failed to fetch apps. Please check your connection."
export const ERR_NO_APPS =
  "No apps found for this team. Please create an app on FastAPI Cloud first."
export const ERR_CREATE_APP = (error: string) =>
  `Failed to create app: ${error}`

// Picker input prompts and validation
export const PROMPT_ENTER_APP_NAME = "Enter app name"
export const ERR_NAME_TOO_SHORT = "Name must be at least 2 characters."
export const ERR_NAME_INVALID =
  "Name can only contain lowercase letters, numbers, and hyphens."
export const MSG_APP_CREATED = (appSlug: string) => `Created app: ${appSlug}`
