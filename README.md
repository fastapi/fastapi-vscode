# FastAPI VS Code Extension

A VS Code extension for FastAPI development that discovers and displays your API endpoints in a tree view.

## Features

- **Automatic discovery** of FastAPI routes and routers from your codebase
- **Tree view** showing all endpoints organized by router hierarchy
- **Quick navigation** - click any route to jump to its definition
- **Smart search** - search and filter routes by path, method, or name
- **CodeLens integration** - navigate from test client calls (e.g., `client.get('/items')`) directly to route definitions
- **Multi-root workspace support** - discovers apps in all workspace folders

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `fastapi.entryPoint` | Path to the main FastAPI application file (e.g., `src/main.py`). If not set, the extension searches common locations: `main.py`, `app/main.py`, `api/main.py`, `src/main.py`, `backend/app/main.py`. | `""` (auto-detect) |
| `fastapi.showTestCodeLenses` | Show CodeLens links above test client calls (e.g., `client.get('/items')`) to navigate to the corresponding route definition. | `true` |

**Note:** Currently the extension discovers one FastAPI app per workspace folder. If you have multiple apps, use separate workspace folders or configure `fastapi.entryPoint` to point to your primary app.

## Development

### Prerequisites

- [Bun](https://bun.sh) installed
- VS Code

### Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Build the extension:
   ```bash
   bun run compile
   ```

3. Press `F5` to open a new window with your extension loaded

### Scripts

- `bun run compile` - Compile the extension
- `bun run watch` - Watch for changes and recompile
- `bun run package` - Package the extension into a .vsix file
- `bun run publish` - Publish the extension to the marketplace

## Project Structure

- `src/extension.ts` - Extension entry point
- `esbuild.js` - esbuild configuration
- `package.json` - Extension manifest
- `tsconfig.json` - TypeScript configuration

## Technologies

- TypeScript
- esbuild
- Bun (package manager)
- VS Code Extension API
