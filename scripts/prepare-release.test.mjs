import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  bumpVersion,
  getCurrentVersion,
  getReleaseNotesBody,
  parseVersion,
  resolveDate,
  updateChangelog,
  updateVersionFile,
} from "./prepare-release.mjs"

const SCRIPT = fileURLToPath(new URL("./prepare-release.mjs", import.meta.url))

// Runs the CLI in a throwaway dir with the version/changelog files pointed at
// temp copies, so nothing touches the real repo files. Returns { stdout }.
function withCli(versionContent, changelogContent, run) {
  const dir = mkdtempSync(join(tmpdir(), "prepare-release-"))
  try {
    const versionFile = join(dir, "package.json")
    const changelogFile = join(dir, "CHANGELOG.md")
    if (versionContent !== null) writeFileSync(versionFile, versionContent)
    if (changelogContent !== null)
      writeFileSync(changelogFile, changelogContent)
    const stdout = (args) =>
      execFileSync("node", [SCRIPT, ...args], {
        encoding: "utf8",
        env: {
          ...process.env,
          PREPARE_RELEASE_VERSION_FILE: versionFile,
          PREPARE_RELEASE_RELEASE_NOTES_FILE: changelogFile,
        },
      })
    return run({ versionFile, changelogFile, stdout })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const PACKAGE_JSON = `{
  "name": "fastapi",
  "version": "0.2.2",
  "publisher": "FastAPILabs"
}
`

const CHANGELOG = `# Release Notes

## Latest Changes

### Fixes

* 🐛 Fix a thing. PR [#1](https://example.com/1).

## 0.2.1

### Docs

* 📝 Document a thing. PR [#2](https://example.com/2).
`

test("parseVersion accepts X.Y.Z and rejects anything else", () => {
  assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3])
  assert.throws(() => parseVersion("1.2"), /Invalid version/)
  assert.throws(() => parseVersion("1.2.3-rc1"), /Invalid version/)
  assert.throws(() => parseVersion("v1.2.3"), /Invalid version/)
})

test("bumpVersion increments the right component and resets lower ones", () => {
  assert.equal(bumpVersion("0.2.2", "patch"), "0.2.3")
  assert.equal(bumpVersion("0.2.2", "minor"), "0.3.0")
  assert.equal(bumpVersion("0.2.2", "major"), "1.0.0")
  assert.throws(() => bumpVersion("0.2.2", "huge"), /Invalid bump/)
})

test("getCurrentVersion extracts the single version field", () => {
  assert.equal(getCurrentVersion(PACKAGE_JSON), "0.2.2")
})

test("getCurrentVersion requires exactly one version field", () => {
  assert.throws(() => getCurrentVersion(`{ "name": "x" }`), /found 0/)
  const twoVersions = `{\n  "version": "1.0.0",\n  "version": "2.0.0"\n}\n`
  assert.throws(() => getCurrentVersion(twoVersions), /found 2/)
})

test("updateVersionFile replaces the version and preserves the rest", () => {
  const updated = updateVersionFile(PACKAGE_JSON, "0.2.3")
  assert.match(updated, /"version": "0.2.3"/)
  assert.match(updated, /"name": "fastapi"/)
  assert.match(updated, /"publisher": "FastAPILabs"/)
  assert.doesNotMatch(updated, /0\.2\.2/)
})

test("updateVersionFile rejects a non-newer version", () => {
  assert.throws(
    () => updateVersionFile(PACKAGE_JSON, "0.2.2"),
    /must be greater/,
  )
  assert.throws(
    () => updateVersionFile(PACKAGE_JSON, "0.2.1"),
    /must be greater/,
  )
})

test("updateChangelog inserts a dated heading under Latest Changes", () => {
  const updated = updateChangelog(CHANGELOG, "0.3.0", "2026-06-16")
  assert.match(
    updated,
    /## Latest Changes\n\n## 0\.3\.0 \(2026-06-16\)\n\n### Fixes/,
  )
  // Existing content is preserved below the new section.
  assert.match(updated, /## 0\.2\.1\n\n### Docs/)
})

test("updateChangelog rejects a version that already has a section", () => {
  // 0.2.1 exists as a plain (undated) heading already.
  assert.throws(
    () => updateChangelog(CHANGELOG, "0.2.1", "2026-06-16"),
    /already contains a section/,
  )
})

test("updateChangelog requires the expected header", () => {
  assert.throws(
    () => updateChangelog("## Latest Changes\n", "0.3.0", "2026-06-16"),
    /must start with/,
  )
})

test("getReleaseNotesBody extracts a dated section", () => {
  const content = `# Release Notes

## Latest Changes

## 0.3.0 (2026-06-16)

### Fixes

* 🐛 Fixed it. PR [#9](https://example.com/9).

## 0.2.2

### Docs

* old
`
  assert.equal(
    getReleaseNotesBody(content, "0.3.0"),
    "### Fixes\n\n* 🐛 Fixed it. PR [#9](https://example.com/9).\n",
  )
})

test("getReleaseNotesBody extracts a plain (undated) section", () => {
  assert.equal(
    getReleaseNotesBody(CHANGELOG, "0.2.1"),
    "### Docs\n\n* 📝 Document a thing. PR [#2](https://example.com/2).\n",
  )
})

test("getReleaseNotesBody keeps non-version h2 content inside a section", () => {
  const content = `# Release Notes

## Latest Changes

## 0.3.0 (2026-06-16)

### Fixes

* 🐛 Fixed it.

## Acknowledgements

Thanks everyone.

## 0.2.2

* old
`
  const body = getReleaseNotesBody(content, "0.3.0")
  assert.match(body, /## Acknowledgements/)
  assert.match(body, /Thanks everyone\./)
  assert.doesNotMatch(body, /old/)
})

test("getReleaseNotesBody requires the version section to exist", () => {
  assert.throws(() => getReleaseNotesBody(CHANGELOG, "9.9.9"), /Could not find/)
})

test("getReleaseNotesBody rejects an empty section", () => {
  const content = `# Release Notes

## Latest Changes

## 0.3.0 (2026-06-16)

## 0.2.2

* old
`
  assert.throws(() => getReleaseNotesBody(content, "0.3.0"), /is empty/)
})

test("resolveDate passes through a valid date", () => {
  assert.equal(resolveDate("2026-06-16"), "2026-06-16")
})

test("resolveDate defaults to a YYYY-MM-DD date when empty", () => {
  assert.match(resolveDate(""), /^\d{4}-\d{2}-\d{2}$/)
  assert.match(resolveDate(undefined), /^\d{4}-\d{2}-\d{2}$/)
})

test("resolveDate rejects malformed or impossible dates", () => {
  assert.throws(() => resolveDate("2026-13-40"), /Invalid date/)
  assert.throws(() => resolveDate("06-16-2026"), /Invalid date/)
  assert.throws(() => resolveDate("not-a-date"), /Invalid date/)
})

// --- CLI end-to-end (run against temp files; never touches the repo) ---

test("CLI prepare updates both files and prints the new version", () => {
  const pkg = `{\n  "name": "x",\n  "version": "0.2.2"\n}\n`
  const changelog =
    "# Release Notes\n\n## Latest Changes\n\n### Fixes\n\n* Fix something.\n"
  withCli(pkg, changelog, ({ versionFile, changelogFile, stdout }) => {
    const out = stdout(["prepare", "patch", "2026-06-16"])
    assert.match(out, /Prepared release 0\.2\.3 \(2026-06-16\)/)
    assert.match(readFileSync(versionFile, "utf8"), /"version": "0.2.3"/)
    assert.match(
      readFileSync(changelogFile, "utf8"),
      /## 0\.2\.3 \(2026-06-16\)/,
    )
  })
})

test("CLI prepare reads file paths from PREPARE_RELEASE_* env vars", () => {
  const pkg = `{\n  "version": "1.4.9"\n}\n`
  const changelog = "# Release Notes\n\n## Latest Changes\n\n* something\n"
  withCli(pkg, changelog, ({ versionFile, stdout }) => {
    stdout(["prepare", "minor"])
    assert.match(readFileSync(versionFile, "utf8"), /"version": "1.5.0"/)
  })
})

test("CLI current-version prints the version", () => {
  const pkg = `{\n  "version": "0.2.2"\n}\n`
  withCli(pkg, null, ({ stdout }) => {
    assert.equal(stdout(["current-version"]), "0.2.2\n")
  })
})

test("CLI release-notes prints the current version's section body", () => {
  const pkg = `{\n  "version": "0.2.2"\n}\n`
  const changelog =
    "# Release Notes\n\n## Latest Changes\n\n## 0.2.2\n\n### Fixes\n\n* Fix it.\n\n## 0.2.1\n\n* old\n"
  withCli(pkg, changelog, ({ stdout }) => {
    assert.equal(stdout(["release-notes"]), "### Fixes\n\n* Fix it.\n")
  })
})
