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
} from "../types/endpoint"

export type EndpointTreeItem =
  | { type: "workspace"; label: string; apps: AppDefinition[] }
  | { type: "app"; app: AppDefinition }
  | { type: "router"; router: RouterDefinition }
  | { type: "route"; route: RouteDefinition }
  | { type: "message"; text: string }

type GroupingFunction = (apps: AppDefinition[]) => EndpointTreeItem[]

// Default grouping: apps directly at root level
const defaultGrouping: GroupingFunction = (apps) =>
  apps.map((app) => ({ type: "app" as const, app }))

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
    switch (method) {
      case "GET":
        return new ThemeIcon("arrow-right")
      case "POST":
        return new ThemeIcon("plus")
      case "PUT":
        return new ThemeIcon("edit")
      case "DELETE":
        return new ThemeIcon("trash")
      case "PATCH":
        return new ThemeIcon("pencil")
      case "OPTIONS":
        return new ThemeIcon("settings-gear")
      case "HEAD":
        return new ThemeIcon("eye")
      case "WEBSOCKET":
        return new ThemeIcon("broadcast")
    }
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

  /**
   * Counts total routes including nested children.
   */
  private getTotalRouteCount(router: RouterDefinition): number {
    let count = router.routes.length
    for (const child of router.children) {
      count += this.getTotalRouteCount(child)
    }
    return count
  }

  /**
   * Finds the parent router if this router is nested.
   */
  private findParentRouter(
    target: RouterDefinition,
  ): RouterDefinition | undefined {
    const searchIn = (
      routers: RouterDefinition[],
    ): RouterDefinition | undefined => {
      for (const router of routers) {
        if (router.children.includes(target)) {
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
   * Finds the router that contains this route.
   */
  private findParentRouterForRoute(
    target: RouteDefinition,
  ): RouterDefinition | undefined {
    const searchIn = (
      routers: RouterDefinition[],
    ): RouterDefinition | undefined => {
      for (const router of routers) {
        if (router.routes.includes(target)) {
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

  getParent(element: EndpointTreeItem): EndpointTreeItem | undefined {
    switch (element.type) {
      case "message":
      case "workspace":
        // Root level items have no parent
        return undefined

      case "app": {
        // Check if apps are grouped under workspaces
        const rootItems = this.groupApps(this.apps)
        for (const root of rootItems) {
          if (root.type === "workspace" && root.apps.includes(element.app)) {
            return root
          }
        }
        // App is at root level
        return undefined
      }

      case "router": {
        // Check if router is nested under another router
        const parentRouter = this.findParentRouter(element.router)
        if (parentRouter) {
          return { type: "router", router: parentRouter }
        }
        // Find which app contains this router at top level
        for (const app of this.apps) {
          if (app.routers.includes(element.router)) {
            return { type: "app", app }
          }
        }
        return undefined
      }

      case "route": {
        // Check if route belongs to a router
        for (const app of this.apps) {
          for (const router of app.routers) {
            if (router.routes.includes(element.route)) {
              return { type: "router", router }
            }
          }
          // Check if route is directly on the app
          if (app.routes.includes(element.route)) {
            return { type: "app", app }
          }
        }
        return undefined
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
      case "app": {
        const routers = element.app.routers
          .map((router) => ({
            type: "router" as const,
            router,
          }))
          .sort((a, b) =>
            this.getRouterSortKey(a.router).localeCompare(
              this.getRouterSortKey(b.router),
            ),
          )
        const routes = element.app.routes
          .map((route) => ({
            type: "route" as const,
            route,
          }))
          .sort((a, b) =>
            this.getRouteSortKey(a.route).localeCompare(
              this.getRouteSortKey(b.route),
            ),
          )
        return [...routers, ...routes]
      }
      case "router": {
        // Child routers first, then routes
        const childRouters = element.router.children
          .map((router) => ({
            type: "router" as const,
            router,
          }))
          .sort((a, b) =>
            this.getRouterSortKey(a.router).localeCompare(
              this.getRouterSortKey(b.router),
            ),
          )
        const routes = element.router.routes
          .map((route) => ({
            type: "route" as const,
            route,
          }))
          .sort((a, b) =>
            this.getRouteSortKey(a.route).localeCompare(
              this.getRouteSortKey(b.route),
            ),
          )
        return [...childRouters, ...routes]
      }
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
        // Use prefix as label (stripped of dynamic segments), or first tag, or filename as fallback
        const strippedPrefix = stripLeadingDynamicSegments(
          element.router.prefix,
        )

        // If nested under a parent router, show only the relative part
        const parentRouter = this.findParentRouter(element.router)
        let displayPrefix = strippedPrefix
        if (parentRouter) {
          const parentPrefix = stripLeadingDynamicSegments(parentRouter.prefix)
          if (strippedPrefix.startsWith(parentPrefix + "/")) {
            displayPrefix = strippedPrefix.slice(parentPrefix.length)
          } else if (strippedPrefix.startsWith(parentPrefix)) {
            displayPrefix = strippedPrefix.slice(parentPrefix.length) || "/"
          }
        }

        let routerLabel = displayPrefix !== "/" ? displayPrefix : ""
        if (!routerLabel) {
          if (element.router.tags.length > 0) {
            // Add / prefix to tag-based labels for consistency
            routerLabel = "/" + element.router.tags[0]
          } else {
            const filePath = element.router.location.filePath
            const fileName = filePath.split("/").pop() ?? ""
            routerLabel = fileName.replace(/\.py$/, "")
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
        // Strip leading dynamic segments for cleaner display
        const strippedPath = stripLeadingDynamicSegments(element.route.path)

        // Find parent router to show relative path
        const parentRouter = this.findParentRouterForRoute(element.route)
        let displayPath = strippedPath
        if (parentRouter) {
          const parentPrefix = stripLeadingDynamicSegments(parentRouter.prefix)
          // Only make relative if parent has a meaningful prefix (not just "/")
          if (
            parentPrefix !== "/" &&
            strippedPath.startsWith(parentPrefix + "/")
          ) {
            displayPath = strippedPath.slice(parentPrefix.length)
          } else if (
            parentPrefix !== "/" &&
            strippedPath.startsWith(parentPrefix)
          ) {
            displayPath = strippedPath.slice(parentPrefix.length) || "/"
          }
          // If parent prefix is "/" (no real prefix), show the full path
        }
        // Ensure path starts with / and doesn't end with / (unless it's just "/")
        if (!displayPath.startsWith("/")) {
          displayPath = "/" + displayPath
        }
        if (displayPath.length > 1 && displayPath.endsWith("/")) {
          displayPath = displayPath.slice(0, -1)
        }

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
