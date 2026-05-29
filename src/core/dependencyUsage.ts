import type { DependencyDefinitionInfo } from "./internal"

export interface LocatedDependency {
  fileUri: string
  definition: DependencyDefinitionInfo
}

// Return the definitions whose name appears in none of the used names (workspace-wide).
export function findUnusedDependencies(
  definitions: LocatedDependency[],
  usedNames: Set<string>,
): LocatedDependency[] {
  return definitions.filter(
    (def) => !usedNames.has(def.definition.variableName),
  )
}

// Determine which names are "used" from identifier references across all files.
// A definition contributes exactly one self-reference (its own name on the left
// of the assignment), so a name referenced more than once is used somewhere
// beyond its definition.
export function collectUsedNames(
  referencedNamesPerFile: string[][],
): Set<string> {
  const counts = new Map<string, number>()
  for (const names of referencedNamesPerFile) {
    for (const name of names) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }

  const used = new Set<string>()
  for (const [name, count] of counts) {
    if (count > 1) used.add(name)
  }
  return used
}
