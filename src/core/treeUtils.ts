/**
 * Utility functions for traversing router trees.
 * Consolidates common recursive tree operations used across the codebase.
 */

import type { AppDefinition, RouteDefinition, RouterDefinition } from "./types"

/**
 * Traverses all routers in a tree, calling the visitor function for each.
 * Returns early if visitor returns a non-undefined value.
 */
function traverseRouters<T>(
  routers: RouterDefinition[],
  visitor: (router: RouterDefinition) => T | undefined,
): T | undefined {
  for (const router of routers) {
    const result = visitor(router)
    if (result !== undefined) {
      return result
    }
    const childResult = traverseRouters(router.children, visitor)
    if (childResult !== undefined) {
      return childResult
    }
  }
  return undefined
}

/**
 * Finds a router matching the predicate across all apps.
 */
export function findRouter(
  apps: AppDefinition[],
  predicate: (router: RouterDefinition) => boolean,
): RouterDefinition | undefined {
  for (const app of apps) {
    const found = traverseRouters(app.routers, (router) =>
      predicate(router) ? router : undefined,
    )
    if (found) return found
  }
  return undefined
}

/**
 * Collects all routes from a list of routers, including nested children.
 */
function collectRoutesFromRouters(
  routers: RouterDefinition[],
): RouteDefinition[] {
  return routers.flatMap((router) => [
    ...router.routes,
    ...collectRoutesFromRouters(router.children),
  ])
}

/**
 * Collects all routes from all apps, including nested router routes.
 */
export function collectAllRoutes(apps: AppDefinition[]): RouteDefinition[] {
  return apps.flatMap((app) => [
    ...app.routes,
    ...collectRoutesFromRouters(app.routers),
  ])
}

/**
 * Counts total routes in a router tree (including nested children).
 */
export function countRoutesInRouter(router: RouterDefinition): number {
  return (
    router.routes.length +
    router.children.reduce((sum, child) => sum + countRoutesInRouter(child), 0)
  )
}

/** Counts total routers in a router tree (including nested children). */
function countRoutersInRouter(router: RouterDefinition): number {
  return (
    1 +
    router.children.reduce((sum, child) => sum + countRoutersInRouter(child), 0)
  )
}

/**
 * Counts total routers across all apps.
 */
export function countRouters(apps: AppDefinition[]): number {
  return apps.reduce(
    (sum, app) =>
      sum +
      app.routers.reduce((s, router) => s + countRoutersInRouter(router), 0),
    0,
  )
}
