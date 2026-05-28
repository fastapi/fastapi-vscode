import type { DependencyDefinitionInfo } from "./internal"

export interface LocatedDependency {
  fileUri: string
  definition: DependencyDefinitionInfo
}

// Filter definitions whose variableName isn't used in the file
export function findUnusedDependencies(
  definitions: LocatedDependency[],
  usedNames: Set<string>,
): LocatedDependency[] {
  return definitions.filter(
    (def) => !usedNames.has(def.definition.variableName),
  )
}

// Collect all variable names that are used in the file and match an imported name
export function collectUsedDependencies(
  importedNamesPerFile: string[][],
): Set<string> {
  return new Set(importedNamesPerFile.flat())
}
