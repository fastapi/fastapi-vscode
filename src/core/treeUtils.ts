import type { AppDefinition, RouteDefinition, RouterDefinition } from "./types"

/** Finds the first router matching a condition across all apps. */
export function findRouter(
  apps: AppDefinition[],
  predicate: (router: RouterDefinition) => boolean,
): RouterDefinition | undefined {
  function findIn(routers: RouterDefinition[]): RouterDefinition | undefined {
    for (const r of routers) {
      if (predicate(r)) return r
      const found = findIn(r.children)
      if (found) return found
    }
    return undefined
  }
  for (const app of apps) {
    const found = findIn(app.routers)
    if (found) return found
  }
  return undefined
}

/** Collects all routes from all apps, including nested router routes. */
export function collectRoutes(apps: AppDefinition[]): RouteDefinition[] {
  function fromRouters(routers: RouterDefinition[]): RouteDefinition[] {
    return routers.flatMap((r) => [...r.routes, ...fromRouters(r.children)])
  }
  return apps.flatMap((app) => [...app.routes, ...fromRouters(app.routers)])
}

/** Counts all routes in a router, including nested routers. */
export function countRoutesInRouter(router: RouterDefinition): number {
  return (
    router.routes.length +
    router.children.reduce((sum, child) => sum + countRoutesInRouter(child), 0)
  )
}

/** Counts total routers across all apps. */
export function countRouters(apps: AppDefinition[]): number {
  function count(routers: RouterDefinition[]): number {
    return routers.reduce((sum, r) => sum + 1 + count(r.children), 0)
  }
  return apps.reduce((sum, app) => sum + count(app.routers), 0)
}
