import type {
  AppDefinition,
  RouteDefinition,
  RouteMethod,
  RouterDefinition,
} from "../types/endpoint"
import {
  countSegments,
  getPathSegments,
  stripLeadingDynamicSegments,
} from "./pathUtils"
import type { RouterNode } from "./routerResolver"

function normalizeMethod(method: string): RouteMethod {
  const upper = method.toUpperCase()
  if (
    upper === "GET" ||
    upper === "POST" ||
    upper === "PUT" ||
    upper === "DELETE" ||
    upper === "PATCH" ||
    upper === "OPTIONS" ||
    upper === "HEAD"
  ) {
    return upper
  }
  if (upper === "WEBSOCKET") {
    return "WEBSOCKET"
  }
  return "GET" // fallback
}

function collectFlatRouters(
  node: RouterNode,
  parentPrefix: string,
  routers: RouterDefinition[],
): void {
  const fullPrefix = parentPrefix + node.prefix

  // Convert routes from this node
  const routes: RouteDefinition[] = node.routes.map((r) => ({
    method: normalizeMethod(r.method),
    path: fullPrefix + r.path,
    functionName: r.function,
    location: {
      filePath: node.filePath,
      line: r.line,
      column: r.column,
    },
  }))

  // Add this router (skip the root FastAPI app and routers with no routes)
  if (node.type === "APIRouter" && routes.length > 0) {
    routers.push({
      name: node.variableName,
      prefix: fullPrefix,
      tags: node.tags,
      location: {
        filePath: node.filePath,
        line: node.line,
        column: node.column,
      },
      routes,
      children: [],
    })
  }

  // Recurse into children
  for (const child of node.children) {
    collectFlatRouters(child.router, fullPrefix + child.prefix, routers)
  }
}

/**
 * Builds a prefix hierarchy from flat routers.
 * Groups routers by common prefix segments.
 * Example: /integrations/neon and /integrations/redis grouped under /integrations
 */
function buildPrefixHierarchy(
  flatRouters: RouterDefinition[],
): RouterDefinition[] {
  // Sort by prefix length (shortest first) to process parents before children
  const sorted = [...flatRouters].sort((a, b) => {
    const prefixA = stripLeadingDynamicSegments(a.prefix)
    const prefixB = stripLeadingDynamicSegments(b.prefix)
    return prefixA.length - prefixB.length
  })

  // Build a map of prefix -> router for grouping
  // Also track synthetic group routers we create
  const prefixToRouter = new Map<string, RouterDefinition>()
  const rootRouters: RouterDefinition[] = []

  for (const router of sorted) {
    const strippedPrefix = stripLeadingDynamicSegments(router.prefix)
    const segmentCount = countSegments(strippedPrefix)

    // Skip routers with no meaningful prefix (root level)
    if (segmentCount === 0) {
      rootRouters.push(router)
      prefixToRouter.set(strippedPrefix, router)
      continue
    }

    // Check if a router with the exact same prefix already exists - merge into it
    const existingRouter = prefixToRouter.get(strippedPrefix)
    if (existingRouter) {
      // Merge routes and children into the existing router
      existingRouter.routes.push(...router.routes)
      existingRouter.children.push(...router.children)
      continue
    }

    // Look for a parent at each level up
    let foundParent = false
    for (let i = segmentCount - 1; i >= 1; i--) {
      const parentPrefix = getPathSegments(strippedPrefix, i)
      const parent = prefixToRouter.get(parentPrefix)
      if (parent) {
        parent.children.push(router)
        foundParent = true
        break
      }
    }

    if (!foundParent) {
      // No parent found - check if we should create a synthetic group
      // Look for siblings that share the first segment but have DIFFERENT full prefixes
      if (segmentCount >= 2) {
        const groupPrefix = getPathSegments(strippedPrefix, 1)
        let groupRouter = prefixToRouter.get(groupPrefix)

        if (!groupRouter) {
          // Check if there will be other routers that would be NESTED siblings
          // (sharing first segment but with DIFFERENT prefix - not same-prefix duplicates)
          const wouldHaveNestedSiblings = sorted.some((other) => {
            if (other === router) return false
            const otherPrefix = stripLeadingDynamicSegments(other.prefix)
            const otherSegments = countSegments(otherPrefix)
            // Must share first segment AND have a different full prefix
            return (
              otherSegments >= 2 &&
              getPathSegments(otherPrefix, 1) === groupPrefix &&
              otherPrefix !== strippedPrefix
            )
          })

          if (wouldHaveNestedSiblings) {
            // Create a synthetic group router
            groupRouter = {
              name: groupPrefix.replace(/^\//, ""),
              prefix: groupPrefix,
              tags: [],
              location: router.location, // Use first child's location
              routes: [],
              children: [],
            }
            prefixToRouter.set(groupPrefix, groupRouter)
            rootRouters.push(groupRouter)
          }
        }

        if (groupRouter) {
          groupRouter.children.push(router)
          foundParent = true
        }
      }
    }

    if (!foundParent) {
      rootRouters.push(router)
    }

    prefixToRouter.set(strippedPrefix, router)
  }

  // Remove empty routers
  return rootRouters.filter((r) => r.routes.length > 0 || r.children.length > 0)
}

export function routerNodeToAppDefinition(
  rootNode: RouterNode,
  workspaceFolder: string,
): AppDefinition {
  const flatRouters: RouterDefinition[] = []

  // Collect direct routes on the FastAPI app
  const directRoutes: RouteDefinition[] = rootNode.routes.map((r) => ({
    method: normalizeMethod(r.method),
    path: rootNode.prefix + r.path,
    functionName: r.function,
    location: {
      filePath: rootNode.filePath,
      line: r.line,
      column: r.column,
    },
  }))

  // Collect all routers flat first
  for (const child of rootNode.children) {
    collectFlatRouters(
      child.router,
      rootNode.prefix + child.prefix,
      flatRouters,
    )
  }

  // Build prefix hierarchy
  const routers = buildPrefixHierarchy(flatRouters)

  return {
    name: rootNode.variableName,
    filePath: rootNode.filePath,
    workspaceFolder,
    routers,
    routes: directRoutes,
  }
}
