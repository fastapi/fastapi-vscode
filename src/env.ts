export const DEFAULT_BASE_URL = "https://api.fastapicloud.com/api/v1"
export const DEFAULT_DASHBOARD_URL = "https://dashboard.fastapicloud.com"

/**
 * Test injection seam for `loadEnvironment`. In production all fields default
 * to real `os` / `fs` / `process.env` reads — overrides are for unit tests.
 *
 * In the browser (vscode.dev) the dynamic Node imports throw and the
 * try/catch returns defaults, so this function is effectively a no-op there.
 */
export interface EnvironmentDeps {
  homedir?: () => string
  platform?: () => NodeJS.Platform
  getAppData?: () => string | undefined
  readFile?: (path: string) => Promise<string>
  pathJoin?: (...parts: string[]) => string
}

export function deriveDashboardUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    const dashboardHostname = url.hostname.replace(/^api\./, "dashboard.")
    return `https://${dashboardHostname}`
  } catch {
    return DEFAULT_DASHBOARD_URL
  }
}

function buildConfigPath(deps: {
  homedir: () => string
  platform: () => NodeJS.Platform
  getAppData: () => string | undefined
  pathJoin: (...parts: string[]) => string
}): string {
  const home = deps.homedir()
  if (!home) {
    throw new Error("Unable to determine home directory for config file")
  }
  const plat = deps.platform()
  if (plat === "darwin") {
    return deps.pathJoin(
      home,
      "Library",
      "Application Support",
      "fastapi-cli",
      "cli.json",
    )
  }
  if (plat === "win32") {
    return deps.pathJoin(deps.getAppData() || home, "fastapi-cli", "cli.json")
  }
  return deps.pathJoin(home, ".config", "fastapi-cli", "cli.json")
}

export async function loadEnvironment(
  deps: EnvironmentDeps = {},
): Promise<{ baseUrl: string; dashboardUrl: string }> {
  try {
    // Dynamic imports so this module loads cleanly in the browser bundle
    // (vscode.dev). On failure the catch returns defaults.
    const os = await import("node:os")
    const fsp = await import("node:fs/promises")
    const path = await import("node:path")

    const homedir = deps.homedir ?? os.homedir
    const platform = deps.platform ?? os.platform
    const getAppData = deps.getAppData ?? (() => process.env.APPDATA)
    const pathJoin = deps.pathJoin ?? path.join
    const readFile = deps.readFile ?? ((p: string) => fsp.readFile(p, "utf-8"))

    const configPath = buildConfigPath({
      homedir,
      platform,
      getAppData,
      pathJoin,
    })
    const raw = await readFile(configPath)
    const config = JSON.parse(raw)
    const baseUrl = config.base_api_url || DEFAULT_BASE_URL
    return {
      baseUrl,
      dashboardUrl: deriveDashboardUrl(baseUrl),
    }
  } catch {
    return {
      baseUrl: DEFAULT_BASE_URL,
      dashboardUrl: DEFAULT_DASHBOARD_URL,
    }
  }
}
