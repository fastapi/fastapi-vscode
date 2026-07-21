/**
 * Prepare a release by bumping the version in package.json and rolling CHANGELOG.md.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const VERSION_FILE =
  process.env.PREPARE_RELEASE_VERSION_FILE ?? join(ROOT, "package.json")
const CHANGELOG_FILE =
  process.env.PREPARE_RELEASE_RELEASE_NOTES_FILE ?? join(ROOT, "CHANGELOG.md")

const RELEASE_NOTES_HEADER = "# Release Notes\n\n"
const LATEST_CHANGES_HEADER = "## Latest Changes"

// Matches the single top-level `"version": "X.Y.Z"` in package.json.
const VERSION_PATTERN =
  /^(?<indent>\s*)"version":\s*"(?<version>\d+\.\d+\.\d+)"/m
// Matches any version section heading, with or without a date suffix,
// e.g. `## 0.2.2` or `## 0.2.2 (2026-06-16)`.
const VERSION_HEADING_PATTERN = /^## \d+\.\d+\.\d+(?: \([^)]+\))?\s*$/m

function parseVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version: '${version}'. Expected format: X.Y.Z`)
  }
  return version.split(".").map(Number)
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version)
  if (bump === "major") return `${major + 1}.0.0`
  if (bump === "minor") return `${major}.${minor + 1}.0`
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`
  throw new Error(`Invalid bump: '${bump}'. Expected major, minor, or patch.`)
}

function getCurrentVersion(content) {
  const matches = [...content.matchAll(new RegExp(VERSION_PATTERN, "gm"))]
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one "version" assignment in package.json, found ${matches.length}`,
    )
  }
  return matches[0].groups.version
}

function updateVersionFile(content, version) {
  const current = getCurrentVersion(content)
  if (compareVersions(parseVersion(version), parseVersion(current)) <= 0) {
    throw new Error(
      `New version ${version} must be greater than current version ${current}`,
    )
  }
  return content.replace(VERSION_PATTERN, `$<indent>"version": "${version}"`)
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function updateChangelog(content, version, date) {
  if (!content.startsWith(RELEASE_NOTES_HEADER)) {
    throw new Error(
      `CHANGELOG.md must start with '${RELEASE_NOTES_HEADER.trim()}'`,
    )
  }
  if (versionHeadingRegex(version).test(content)) {
    throw new Error(`CHANGELOG.md already contains a section for ${version}`)
  }

  const latestHeader = `${RELEASE_NOTES_HEADER}${LATEST_CHANGES_HEADER}\n`
  if (!content.startsWith(latestHeader)) {
    throw new Error(`CHANGELOG.md must start with '${latestHeader.trim()}'`)
  }

  return content.replace(
    latestHeader,
    `${RELEASE_NOTES_HEADER}${LATEST_CHANGES_HEADER}\n\n## ${version} (${date})\n`,
  )
}

function getReleaseNotesBody(content, version) {
  const match = versionHeadingRegex(version).exec(content)
  if (!match) {
    throw new Error(`Could not find CHANGELOG section for ${version}`)
  }

  const rest = content.slice(match.index + match[0].length)
  const next = VERSION_HEADING_PATTERN.exec(rest)
  const body = (next ? rest.slice(0, next.index) : rest).trim()
  if (!body) {
    throw new Error(`CHANGELOG section for ${version} is empty`)
  }
  return `${body}\n`
}

function versionHeadingRegex(version) {
  return new RegExp(`^## ${escapeRegExp(version)}(?: \\([^)]+\\))?\\s*$`, "m")
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Validates a YYYY-MM-DD date, or returns today (UTC) when empty. */
function resolveDate(input) {
  if (!input) return new Date().toISOString().slice(0, 10)
  const parsed = new Date(`${input}T00:00:00Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== input
  ) {
    throw new Error(`Invalid date: '${input}'. Expected format: YYYY-MM-DD`)
  }
  return input
}

function commandPrepare(bump, dateArg) {
  if (!bump) throw new Error("Usage: prepare <patch|minor|major> [YYYY-MM-DD]")
  const date = resolveDate(dateArg)
  const pkg = readFileSync(VERSION_FILE, "utf8")
  const changelog = readFileSync(CHANGELOG_FILE, "utf8")
  const version = bumpVersion(getCurrentVersion(pkg), bump)

  writeFileSync(VERSION_FILE, updateVersionFile(pkg, version))
  writeFileSync(CHANGELOG_FILE, updateChangelog(changelog, version, date))
  process.stdout.write(`Prepared release ${version} (${date})\n`)
}

function commandCurrentVersion() {
  process.stdout.write(
    `${getCurrentVersion(readFileSync(VERSION_FILE, "utf8"))}\n`,
  )
}

function commandReleaseNotes() {
  const version = getCurrentVersion(readFileSync(VERSION_FILE, "utf8"))
  process.stdout.write(
    getReleaseNotesBody(readFileSync(CHANGELOG_FILE, "utf8"), version),
  )
}

function main(argv) {
  const [command, arg, arg2] = argv
  try {
    if (command === "prepare") commandPrepare(arg, arg2)
    else if (command === "current-version") commandCurrentVersion()
    else if (command === "release-notes") commandReleaseNotes()
    else {
      process.stderr.write(
        "Usage: prepare-release.mjs <prepare <bump>|current-version|release-notes>\n",
      )
      process.exit(2)
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}

// Run as a CLI only when executed directly, so tests can import the pure
// functions below without triggering file writes.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2))
}

export {
  bumpVersion,
  getCurrentVersion,
  getReleaseNotesBody,
  parseVersion,
  resolveDate,
  updateChangelog,
  updateVersionFile,
}
