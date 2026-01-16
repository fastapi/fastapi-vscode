import {
  EventEmitter,
  MarkdownString,
  ThemeIcon,
  type TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
} from "vscode"
import { stripLeadingDynamicSegments } from "../core/pathUtils"
import type {
  AppDefinition,
  RouteDefinition,
  RouteMethod,
  RouterDefinition,
} from "../core/types"

export type EndpointTreeItem =
  | { type: "workspace"; label: string; apps: AppDefinition[] }
  | { type: "app"; app: AppDefinition }
  | { type: "router"; router: RouterDefinition }
  | { type: "route"; route: RouteDefinition }
  | { type: "message"; text: string }

type GroupingFunction = (apps: AppDefinition[]) => EndpointTreeItem[]

/** Default grouping: apps directly at root level */
const defaultGrouping: GroupingFunction = (apps) =>
  apps.map((app) => ({ type: "app" as const, app }))

/** Method icons for route display */
const METHOD_ICONS: Record<RouteMethod, string> = {
  GET: "arrow-right",
  POST: "plus",
  PUT: "edit",
  DELETE: "trash",
  PATCH: "pencil",
  OPTIONS: "settings-gear",
  HEAD: "eye",
  WEBSOCKET: "broadcast",
}

export class EndpointTreeProvider
  implements TreeDataProvider<EndpointTreeItem>
{
  private _onDidChangeTreeData: EventEmitter<EndpointTreeItem | undefined> =
    new EventEmitter()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private apps: AppDefinition[] = []
  private groupApps: GroupingFunction
  private routersExpanded = false
  private toggleCount = 0

  constructor(apps: AppDefinition[] = [], groupApps?: GroupingFunction) {
    this.apps = apps
    this.groupApps = groupApps ?? defaultGrouping
  }

  setApps(apps: AppDefinition[], groupApps?: GroupingFunction): void {
    this.apps = apps
    if (groupApps) {
      this.groupApps = groupApps
    }
    this.refresh()
  }

  private getMethodIcon(method: RouteMethod): ThemeIcon {
    return new ThemeIcon(METHOD_ICONS[method])
  }

  /**
   * Gets the display label for a router (used for sorting).
   * Uses prefix (stripped), then tag, then filename as fallback.
   */
  private getRouterSortKey(router: RouterDefinition): string {
    const strippedPrefix = stripLeadingDynamicSegments(router.prefix)
    if (strippedPrefix !== "/") {
      return strippedPrefix.toLowerCase()
    }
    if (router.tags.length > 0) {
      return router.tags[0].toLowerCase()
    }
    const fileName = router.location.filePath.split("/").pop() ?? ""
    return fileName.replace(/\.py$/, "").toLowerCase()
  }

  /**
   * Gets the display path for a route (used for sorting).
   */
  private getRouteSortKey(route: RouteDefinition): string {
    const path =
      stripLeadingDynamicSegments(route.path).replace(/^\//, "") || "/"
    return `${route.method} ${path}`.toLowerCase()
  }

  /** Counts total routes including nested children. */
  private getTotalRouteCount(router: RouterDefinition): number {
    return (
      router.routes.length +
      router.children.reduce(
        (sum, child) => sum + this.getTotalRouteCount(child),
        0,
      )
    )
  }

  /**
   * Generic search through router tree.
   * Returns the router that matches the predicate.
   */
  private searchRouters(
    predicate: (router: RouterDefinition) => boolean,
  ): RouterDefinition | undefined {
    const searchIn = (
      routers: RouterDefinition[],
    ): RouterDefinition | undefined => {
      for (const router of routers) {
        if (predicate(router)) {
          return router
        }
        const found = searchIn(router.children)
        if (found) return found
      }
      return undefined
    }

    for (const app of this.apps) {
      const found = searchIn(app.routers)
      if (found) return found
    }
    return undefined
  }

  /**
   * Finds the parent router if this router is nested.
   */
  private findParentRouter(
    target: RouterDefinition,
  ): RouterDefinition | undefined {
    return this.searchRouters((router) => router.children.includes(target))
  }

  /**
   * Finds the router that contains this route.
   */
  private findParentRouterForRoute(
    target: RouteDefinition,
  ): RouterDefinition | undefined {
    return this.searchRouters((router) => router.routes.includes(target))
  }

  /**
   * Calculates the relative path given a full path and a parent prefix.
   * Returns the path relative to the parent, or the original if no meaningful parent.
   */
  private getRelativePath(fullPath: string, parentPrefix: string): string {
    if (parentPrefix === "/") {
      return fullPath
    }
    if (fullPath.startsWith(`${parentPrefix}/`)) {
      return fullPath.slice(parentPrefix.length)
    }
    if (fullPath.startsWith(parentPrefix)) {
      return fullPath.slice(parentPrefix.length) || "/"
    }
    return fullPath
  }

  /**
   * Sorts and maps routers to tree items.
   */
  private sortedRouterItems(
    routers: RouterDefinition[],
  ): { type: "router"; router: RouterDefinition }[] {
    return routers
      .map((router) => ({ type: "router" as const, router }))
      .sort((a, b) =>
        this.getRouterSortKey(a.router).localeCompare(
          this.getRouterSortKey(b.router),
        ),
      )
  }

  /**
   * Sorts and maps routes to tree items.
   */
  private sortedRouteItems(
    routes: RouteDefinition[],
  ): { type: "route"; route: RouteDefinition }[] {
    return routes
      .map((route) => ({ type: "route" as const, route }))
      .sort((a, b) =>
        this.getRouteSortKey(a.route).localeCompare(
          this.getRouteSortKey(b.route),
        ),
      )
  }

  getParent(element: EndpointTreeItem): EndpointTreeItem | undefined {
    switch (element.type) {
      case "message":
      case "workspace":
        // Root level items have no parent
        return undefined

      case "app": {
        // Check if apps are grouped under workspaces
        const rootItems = this.groupApps(this.apps)
        return rootItems.find(
          (root) =>
            root.type === "workspace" && root.apps.includes(element.app),
        )
      }

      case "router": {
        // Check if router is nested under another router
        const parentRouter = this.findParentRouter(element.router)
        if (parentRouter) {
          return { type: "router", router: parentRouter }
        }
        // Find which app contains this router at top level
        const app = this.apps.find((a) => a.routers.includes(element.router))
        return app ? { type: "app", app } : undefined
      }

      case "route": {
        // Check if route belongs to a router (including nested routers)
        const parentRouter = this.findParentRouterForRoute(element.route)
        if (parentRouter) {
          return { type: "router", router: parentRouter }
        }
        // Check if route is directly on an app
        const app = this.apps.find((a) => a.routes.includes(element.route))
        return app ? { type: "app", app } : undefined
      }
    }
  }

  getChildren(element?: EndpointTreeItem): EndpointTreeItem[] {
    if (!element) {
      if (this.apps.length === 0) {
        return [{ type: "message", text: "No FastAPI app found" }]
      }
      return this.groupApps(this.apps)
    }

    switch (element.type) {
      case "workspace":
        return element.apps
          .map((app) => ({ type: "app" as const, app }))
          .sort((a, b) => a.app.name.localeCompare(b.app.name))
      case "app":
        return [
          ...this.sortedRouterItems(element.app.routers),
          ...this.sortedRouteItems(element.app.routes),
        ]
      case "router":
        // Child routers first, then routes
        return [
          ...this.sortedRouterItems(element.router.children),
          ...this.sortedRouteItems(element.router.routes),
        ]
      case "route":
      case "message":
        return []
    }
  }

  getTreeItem(element: EndpointTreeItem): TreeItem {
    switch (element.type) {
      case "message": {
        const item = new TreeItem(element.text)
        item.iconPath = new ThemeIcon("info")
        return item
      }
      case "workspace": {
        const workspaceItem = new TreeItem(
          element.label,
          TreeItemCollapsibleState.Expanded,
        )
        workspaceItem.iconPath = new ThemeIcon("folder-library")
        workspaceItem.contextValue = "workspace"
        return workspaceItem
      }

      case "app": {
        // Use a more descriptive name when the variable name is generic (like "app")
        // Include the parent directory to disambiguate multiple apps
        let appLabel = element.app.name
        if (appLabel === "app" || this.apps.length > 1) {
          // Extract meaningful context from the file path
          // e.g., "backend/app/main.py" -> "backend/app"
          const pathParts = element.app.filePath.split("/")
          const fileName = pathParts.pop() ?? ""
          const parentDir = pathParts.pop() ?? ""
          const grandParentDir = pathParts.pop() ?? ""

          if (parentDir && parentDir !== "src" && parentDir !== "app") {
            appLabel = parentDir
          } else if (grandParentDir) {
            appLabel = `${grandParentDir}/${parentDir}`
          } else {
            appLabel = fileName.replace(/\.py$/, "")
          }
        }
        const appItem = new TreeItem(
          appLabel,
          TreeItemCollapsibleState.Expanded,
        )
        appItem.iconPath = new ThemeIcon("root-folder")
        appItem.contextValue = "app"
        appItem.description = element.app.name // Show the actual variable name as description
        return appItem
      }

      case "router": {
        // Use prefix as label, showing relative path if nested under a parent
        const strippedPrefix = stripLeadingDynamicSegments(
          element.router.prefix,
        )

        const parentRouter = this.findParentRouter(element.router)
        const parentPrefix = parentRouter
          ? stripLeadingDynamicSegments(parentRouter.prefix)
          : "/"
        const displayPrefix = this.getRelativePath(strippedPrefix, parentPrefix)

        let routerLabel = displayPrefix !== "/" ? displayPrefix : ""
        if (!routerLabel) {
          // Fallback: use tag, then filename
          if (element.router.tags.length > 0) {
            routerLabel = `/${element.router.tags[0]}`
          } else {
            const parts = element.router.location.filePath.split("/")
            const fileName = parts.pop()?.replace(/\.py$/, "") ?? ""
            // Use parent directory for generic filenames
            if (fileName === "router" || fileName === "routes") {
              routerLabel = parts.pop() ?? fileName
            } else {
              routerLabel = fileName
            }
          }
        }
        const routerItem = new TreeItem(
          routerLabel,
          this.routersExpanded
            ? TreeItemCollapsibleState.Expanded
            : TreeItemCollapsibleState.Collapsed,
        )
        // Unique id that changes with toggle to force VS Code to re-render
        // Include file path to differentiate routers with same prefix from different files
        routerItem.id = `router-${element.router.location.filePath}-${element.router.prefix}-${this.toggleCount}`
        routerItem.iconPath = new ThemeIcon("symbol-namespace")

        const totalRoutes = this.getTotalRouteCount(element.router)
        routerItem.description =
          totalRoutes !== 1 ? `${totalRoutes} routes` : "1 route"
        routerItem.contextValue = "router"
        return routerItem
      }

      case "route": {
        // Only strip leading dynamic segments (like {settings.API_V1_STR})
        // Keep the full path otherwise for clarity
        const displayPath = stripLeadingDynamicSegments(element.route.path)

        const label =
          element.route.method === "WEBSOCKET"
            ? displayPath
            : `${element.route.method} ${displayPath}`

        const routeItem = new TreeItem(label)
        routeItem.description = element.route.functionName
        routeItem.iconPath = this.getMethodIcon(element.route.method)
        routeItem.contextValue = "route"
        routeItem.tooltip = new MarkdownString(
          `${element.route.method} ${element.route.path}\n\nFunction: ${element.route.functionName}\nFile: ${element.route.location.filePath}:${element.route.location.line}`,
        )
        routeItem.command = {
          command: "fastapi-vscode.goToEndpoint",
          title: "Go to Definition",
          arguments: [element],
        }
        return routeItem
      }
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  toggleRouters(): void {
    this.routersExpanded = !this.routersExpanded
    this.toggleCount++
    this.refresh()
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose()
  }
}
