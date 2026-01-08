import type { Node } from "web-tree-sitter"

export function walkTree(node: Node, depth = 0): void {
  const indent = "  ".repeat(depth)
  console.log(
    `${indent}- ${node.type} [${node.startPosition.row}:${node.startPosition.column} - ${node.endPosition.row}:${node.endPosition.column}]`,
  )
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) {
      walkTree(child, depth + 1)
      console.log(child.type)
    }
  }
}

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
