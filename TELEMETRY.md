# Telemetry

The FastAPI VS Code extension collects anonymous usage data to help us understand how the extension is used and how we can improve it. This document describes exactly what data is collected. No personally identifiable information is collected. No information is shared with third parties.

## How to disable telemetry

You can disable telemetry in two ways:

### Option 1: Disable all VS Code telemetry

1. Open VS Code Settings (File > Preferences > Settings, or `Cmd+,` on macOS)
2. Search for `telemetry.telemetryLevel`
3. Set it to `off`

This disables telemetry for VS Code and all extensions that respect this setting, including FastAPI.

### Option 2: Disable only FastAPI telemetry

1. Open VS Code Settings
2. Search for `fastapi.telemetry.enabled`
3. Uncheck the box (set to `false`)

This disables only the FastAPI extension's telemetry while leaving other telemetry unchanged.

**Note:** Telemetry is only sent when *both* VS Code's global telemetry (`telemetry.telemetryLevel`) is enabled *and* the extension setting (`fastapi.telemetry.enabled`) is `true`. Disabling either one will stop all telemetry collection.

## What we collect

We collect anonymous usage metrics to improve the extension. We do **not** collect:
- File paths or file contents
- Route paths or endpoint names
- Any code from your project
- IP addresses (geo-IP is disabled)

**Note:** All events include contextual information: client type (VS Code, Cursor, etc.), OS platform, CPU architecture, extension version, and if available, the installed Python version and versions of related packages (FastAPI, Pydantic, Starlette, Typer, FastAPI CLI, FastAPI Cloud CLI) from your active interpreter.

### Events

| Event | Data | Why |
|-------|------|-----|
| Extension activated | Activation duration, success/failure, number of routes/routers/apps discovered, workspace folder count | Helps us understand startup performance, project sizes, and environment compatibility |
| Extension deactivated | Session duration (time from activation to deactivation) | Helps us understand how long users keep VS Code open with the extension active |
| Activation failed | Error category (e.g., "parse_error", "wasm_load_error"), failure stage | Helps us debug issues users encounter |
| Entrypoint detected | Detection duration, method used (config/pyproject/heuristic), success/failure, routes and routers count | Helps us understand which detection methods work best |
| Tree view visible | _(none)_ | Know if users see the endpoint explorer |
| Search executed | Number of results, whether user selected a result | Helps us understand search usage |
| CodeLens provided | Number of test calls found, number matched to routes | Helps us understand CodeLens effectiveness |
| Routes navigated | Count of navigations (cumulative) | Helps us understand feature usage depth |
| Routes copied | Count of copies (cumulative) | Helps us understand feature usage depth |
| CodeLens clicked | Count of clicks (cumulative) | Helps us understand feature usage depth |

### Identifiers

- A random UUID is generated and stored locally in VS Code's extension storage
- This ID is used solely to count unique users and is not linked to any personal information

## Source code

The telemetry implementation is fully open source. See:
- [src/utils/telemetry/](src/utils/telemetry/) - All telemetry code
- [src/utils/telemetry/events.ts](src/utils/telemetry/events.ts) - Event definitions
