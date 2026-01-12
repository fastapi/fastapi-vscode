import type { Node } from "web-tree-sitter"

export function findNodesByType(
  node: Node,
  type: string,
  results: Node[] = [],
): Node[] {
  if (node.type === type) {
    results.push(node)
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      findNodesByType(child, type, results)
    }
  }
  return results
}
