/** Directories excluded from workspace Python scans (virtualenvs, caches, tests, VCS). */
const EXCLUDED_DIRS = [
  ".venv",
  "venv",
  "__pycache__",
  "node_modules",
  ".git",
  "tests",
  "test",
]

/** Glob matching Python files in a workspace scan. */
export const PYTHON_FILE_GLOB = "**/*.py"

/** Glob excluding the directories above — derived so it can't drift from the predicate. */
export const PYTHON_SCAN_EXCLUDE_GLOB = `**/{${EXCLUDED_DIRS.join(",")}}/**`

/** True if a single file path/URI falls under an excluded directory. */
export function isExcludedFromPythonScan(pathOrUri: string): boolean {
  return EXCLUDED_DIRS.some((dir) => pathOrUri.includes(`/${dir}/`))
}
