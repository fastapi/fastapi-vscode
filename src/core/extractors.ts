// Utility functions to extract information from AST nodes

import type { Node } from "web-tree-sitter"
import { findNodesByType } from "./astUtils"

export function decoratorExtractor(
  node: Node,
): { object: string; method: string; path: string; function: string } | null {
  if (node.type !== "decorated_definition") {
    return null
  }

  const decoratorNode = node.firstNamedChild
  const callNodes = decoratorNode ? findNodesByType(decoratorNode, "call") : []
  const callNode = callNodes.length > 0 ? callNodes[0] : null

  if (!callNode) {
    return null
  }

  const functionNameNode = callNode.childForFieldName("function")
  const argumentsNode = callNode.childForFieldName("arguments")

  if (!functionNameNode || !argumentsNode) {
    return null
  }

  const objectNode = functionNameNode.childForFieldName("object")
  const methodNode = functionNameNode.childForFieldName("attribute")

  if (!objectNode || !methodNode) {
    return null
  }

  const pathArgNode = argumentsNode.namedChildren[0]
  let path = ""
  if (pathArgNode && pathArgNode.type === "string") {
    path = pathArgNode.text.slice(1, -1) // Remove quotes
  }

  const functionDefNode = node.childForFieldName("definition")
  const functionNameDefNode = functionDefNode
    ? functionDefNode.childForFieldName("name")
    : null
  const functionName = functionNameDefNode ? functionNameDefNode.text : ""

  return {
    object: objectNode.text,
    method: methodNode.text,
    path,
    function: functionName,
  }
}

export type RouterType = "APIRouter" | "FastAPI" | "Unknown"

export function routerExtractor(
  node: Node,
): { variableName: string; type: RouterType; prefix: string } | null {
  if (node.type !== "assignment") {
    return null
  }

  const variableNameNode = node.childForFieldName("left")
  const valueNode = node.childForFieldName("right")

  if (!variableNameNode || !valueNode) {
    return null
  }

  const variableName = variableNameNode.text

  let type: RouterType = "Unknown"

  if (valueNode.type === "call") {
    const functionNameNode = valueNode.childForFieldName("function")
    if (functionNameNode && functionNameNode.text === "APIRouter") {
      type = "APIRouter"
    } else if (functionNameNode && functionNameNode.text === "FastAPI") {
      type = "FastAPI"
    }

    let prefix = ""
    const argumentsNode = valueNode.childForFieldName("arguments")
    if (argumentsNode) {
      const prefixArgNode = argumentsNode.namedChildren.find(
        (child) =>
          child.type === "keyword_argument" &&
          child.childForFieldName("name")?.text === "prefix",
      )
      if (prefixArgNode) {
        const prefixValue = prefixArgNode.childForFieldName("value")
        if (prefixValue?.type === "string") {
          prefix = prefixValue.text.slice(1, -1) // Remove quotes
        }
      }
    }
    if (type !== "Unknown") {
      return { variableName, type, prefix }
    }
  }

  return null
}
