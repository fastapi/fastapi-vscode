#!/bin/bash
set -e
set -x

# Build without bundling (required for per-file coverage)
bun run esbuild.js --no-bundle

# Run tests with coverage collection
npx vscode-test --coverage

# Check coverage threshold (default 80%, override with COVERAGE_THRESHOLD env var)
THRESHOLD=${COVERAGE_THRESHOLD:-80}

if [ -f "coverage/coverage-summary.json" ]; then
  LINES_PCT=$(node -e "console.log(require('./coverage/coverage-summary.json').total.lines.pct)")
  echo "Line coverage: ${LINES_PCT}%"
  if (( $(echo "$LINES_PCT < $THRESHOLD" | bc -l) )); then
    echo "ERROR: Coverage ${LINES_PCT}% is below threshold ${THRESHOLD}%"
    exit 1
  fi
  echo "Coverage check passed: ${LINES_PCT}% >= ${THRESHOLD}%"
fi
