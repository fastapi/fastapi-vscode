/**
 * Transforms a RouterNode graph into an AppDefinition for consumption.
 */

import { normalizeMethod } from "./internal"
import {
  countSegments,
  getPathSegments,
  stripLeadingDynamicSegments,
} from "./pathUtils"
import type { RouterNode } from "./routerResolver"
import type { AppDefinition, RouteDefinition, RouterDefinition } from "./types"

function toRouteDefinition(
  route: RouterNode["routes"][number],
  prefix: string,
  filePath: string,
): RouteDefinition {
  return {
    method: normalizeMethod(route.method),
    path: prefix + route.path,
    functionName: route.function,
    docstring: route.docstring,
    location: {
      filePath,
      line: route.line,
      column: route.column,
    },
  }
}

/**
 * Collects routers into a flat list with full prefixes.
 */
function collectFlatRouters(
  node: RouterNode,
  parentPrefix: string,
  routers: RouterDefinition[],
): void {
  const fullPrefix = parentPrefix + node.prefix

  // Convert routes from this node
  const routes = node.routes.map((r) =>
    toRouteDefinition(r, fullPrefix, node.filePath),
  )

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
 * Finds the nearest parent router by walking up the prefix hierarchy.
 */
function findParentRouter(
  prefix: string,
  segmentCount: number,
  prefixToRouter: Map<string, RouterDefinition>,
): RouterDefinition | undefined {
  for (let i = segmentCount - 1; i >= 1; i--) {
    const parentPrefix = getPathSegments(prefix, i)
    const parent = prefixToRouter.get(parentPrefix)
    if (parent) {
      return parent
    }
  }
  return undefined
}

/**
 * Builds a prefix hierarchy from flat routers.
 * Groups routers by common prefix segments.
 * Example: /integrations/neon and /integrations/redis grouped under /integrations
 */
function buildPrefixHierarchy(
  flatRouters: RouterDefinition[],
): RouterDefinition[] {
  // Sort by segment count (fewest first) to process parents before children
  const sorted = [...flatRouters].sort((a, b) => {
    const segmentsA = countSegments(stripLeadingDynamicSegments(a.prefix))
    const segmentsB = countSegments(stripLeadingDynamicSegments(b.prefix))
    return segmentsA - segmentsB
  })

  // Build a map of prefix -> router for grouping
  // Also track synthetic group routers we create
  const prefixToRouter = new Map<string, RouterDefinition>()
  const rootRouters: RouterDefinition[] = []

  for (const router of sorted) {
    const strippedPrefix = stripLeadingDynamicSegments(router.prefix)
    const segmentCount = countSegments(strippedPrefix)

    // Handle routers with no meaningful prefix
    if (segmentCount === 0) {
      rootRouters.push(router)
      prefixToRouter.set(strippedPrefix, router)
      continue
    }

    // Check if a router with the exact same prefix already exists - merge into it
    const existingRouter = prefixToRouter.get(strippedPrefix)
    if (existingRouter) {
      existingRouter.routes.push(...router.routes)
      existingRouter.children.push(...router.children)
      continue
    }

    // Look for a parent at each level up
    const parent = findParentRouter(
      strippedPrefix,
      segmentCount,
      prefixToRouter,
    )
    if (parent) {
      parent.children.push(router)
      prefixToRouter.set(strippedPrefix, router)
      continue
    }

    // No parent found - check if we should create a synthetic group
    // Only for routers with 2+ segments (e.g., /integrations/neon)
    if (segmentCount >= 2) {
      const groupPrefix = getPathSegments(strippedPrefix, 1)
      let groupRouter = prefixToRouter.get(groupPrefix)

      if (!groupRouter) {
        // Check if there's a root-level router with matching tag that should be the parent
        const matchingRootRouter = rootRouters.find((r) => {
          if (r === router) return false
          // Router has no prefix but has a tag matching this group
          const rPrefix = stripLeadingDynamicSegments(r.prefix)
          return (
            countSegments(rPrefix) === 0 &&
            r.tags.length > 0 &&
            `/${r.tags[0]}` === groupPrefix
          )
        })

        if (matchingRootRouter) {
          // Use this router as the group parent
          groupRouter = matchingRootRouter
          // Remove from root and re-register under the group prefix
          const idx = rootRouters.indexOf(matchingRootRouter)
          if (idx !== -1) rootRouters.splice(idx, 1)
          matchingRootRouter.prefix = groupPrefix
          prefixToRouter.set(groupPrefix, matchingRootRouter)
          rootRouters.push(matchingRootRouter)
        } else {
          // Check if there are other routers that would be siblings under this group
          const wouldHaveSiblings = sorted.some((other) => {
            if (other === router) return false
            const otherPrefix = stripLeadingDynamicSegments(other.prefix)
            const otherSegments = countSegments(otherPrefix)
            return (
              otherSegments >= 2 &&
              getPathSegments(otherPrefix, 1) === groupPrefix &&
              otherPrefix !== strippedPrefix
            )
          })

          if (wouldHaveSiblings) {
            // Create a synthetic group router
            groupRouter = {
              name: groupPrefix.replace(/^\//, ""),
              prefix: groupPrefix,
              tags: [],
              location: router.location,
              routes: [],
              children: [],
            }
            prefixToRouter.set(groupPrefix, groupRouter)
            rootRouters.push(groupRouter)
          }
        }
      }

      if (groupRouter) {
        groupRouter.children.push(router)
        prefixToRouter.set(strippedPrefix, router)
        continue
      }
    }

    rootRouters.push(router)
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
  const directRoutes = rootNode.routes.map((r) =>
    toRouteDefinition(r, rootNode.prefix, rootNode.filePath),
  )

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
