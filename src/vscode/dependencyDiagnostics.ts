import {
  Diagnostic,
  type DiagnosticCollection,
  DiagnosticSeverity,
  DiagnosticTag,
  Range,
  Uri,
} from "vscode"
import type { LocatedDependency } from "../core/dependencyUsage"

const SOURCE = "FastAPI"

function toDiagnostic({ definition }: LocatedDependency): Diagnostic {
  // definition.line is 1-based (row + 1); VS Code ranges are 0-based.
  const line = Math.max(definition.line - 1, 0)
  const start = definition.column
  const range = new Range(
    line,
    start,
    line,
    start + definition.variableName.length,
  )
  const diagnostic = new Diagnostic(
    range,
    `Dependency "${definition.variableName}" is defined but never referenced anywhere in the workspace.`,
    DiagnosticSeverity.Information,
  )
  diagnostic.source = SOURCE
  // Render the alias greyed-out, the conventional "unused code" treatment.
  diagnostic.tags = [DiagnosticTag.Unnecessary]
  return diagnostic
}

/** Replace the unused-dependency diagnostics with the index's current findings. */
export function publishUnusedDependencyDiagnostics(
  collection: DiagnosticCollection,
  unused: LocatedDependency[],
): void {
  collection.clear()

  const byFile = new Map<string, Diagnostic[]>()
  for (const located of unused) {
    const list = byFile.get(located.fileUri) ?? []
    list.push(toDiagnostic(located))
    byFile.set(located.fileUri, list)
  }

  for (const [fileUri, diagnostics] of byFile) {
    collection.set(Uri.parse(fileUri), diagnostics)
  }
}
