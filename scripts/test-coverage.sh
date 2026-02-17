#!/bin/bash
set -e

# Clean dist to avoid stale files from previous bundled builds
rm -rf dist

# Build without bundling (required for per-file coverage)
bun run esbuild.js --no-bundle

# Run tests with coverage collection
bunx vscode-test --coverage

# Check coverage threshold
node -e "
  const threshold = ${COVERAGE_THRESHOLD:-90};
  const summary = require('./coverage/coverage-summary.json');
  const pct = summary.total.lines.pct;
  console.log('Line coverage: ' + pct + '%');
  if (pct < threshold) {
    console.error('ERROR: Coverage ' + pct + '% is below threshold ' + threshold + '%');
    process.exit(1);
  }
  console.log('Coverage check passed: ' + pct + '% >= ' + threshold + '%');
"
