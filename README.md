# FastAPI VS Code Extension

A VS Code extension for FastAPI development.

## Features

- Hello World command (example)

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
