# FastAPI VS Code Extension

VS Code extension for FastAPI development.

## Commands

- `bun run compile` - Build the extension
- `bun run watch` - Build with watch mode
- `bun run lint` - Lint and format code
- `bun run package` - Package extension as .vsix

## Structure

- `src/extension.ts` - Extension entry point
- `src/commands/` - Command handlers
- `src/providers/` - TreeView, CodeLens providers
- `src/services/` - FastAPI endpoint scanning
- `src/types/` - TypeScript interfaces


## Scratch space

* NEVER create throw away idea exploration files in the top directory of the repo. Use a `.agents/sandbox/` directory for those. They will never be committed.