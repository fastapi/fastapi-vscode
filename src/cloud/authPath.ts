/**
 * Returns the platform-specific path to the fastapi-cli auth.json file,
 * or null if HOME/USERPROFILE is not set.
 */
export function getAuthFilePath(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) return null

  if (process.platform === "darwin") {
    return `${home}/Library/Application Support/fastapi-cli/auth.json`
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || `${home}/AppData/Roaming`
    return `${appData}/fastapi-cli/auth.json`
  }
  const xdgData = process.env.XDG_DATA_HOME || `${home}/.local/share`
  return `${xdgData}/fastapi-cli/auth.json`
}
