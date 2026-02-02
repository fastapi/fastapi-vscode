import {
  EventEmitter,
  MarkdownString,
  ThemeIcon,
  type TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
} from "vscode"
import { stripLeadingDynamicSegments } from "../core/pathUtils"
import { countRoutesInRouter, findRouter } from "../core/treeUtils"
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

export const METHOD_ICONS: Record<RouteMethod, string> = {
  GET: "arrow-right",
  POST: "plus",
  PUT: "edit",
  DELETE: "trash",
  PATCH: "pencil",
  OPTIONS: "settings-gear",
  HEAD: "eye",
  WEBSOCKET: "broadcast",
}

export function getAppLabel(app: AppDefinition): string {
  if (app.name !== "app") return app.name
  const pathParts = app.filePath.split("/")
  const fileName = pathParts.pop() ?? ""
  const parentDir = pathParts.pop() ?? ""
  const grandParentDir = pathParts.pop() ?? ""
  if (parentDir && parentDir !== "src" && parentDir !== "app") return parentDir
  if (grandParentDir) return `${grandParentDir}/${parentDir}`
  return fileName.replace(/\.py$/, "")
}

export function getRouterLabel(
  router: RouterDefinition,
  parentPrefix: string,
): string {
  // e.g. "{settings.version}/users" -> "/users"
  const prefix = stripLeadingDynamicSegments(router.prefix)

  let label = prefix
  if (parentPrefix !== "/") {
    if (prefix.startsWith(`${parentPrefix}/`)) {
      label = prefix.slice(parentPrefix.length)
    } else if (prefix.startsWith(parentPrefix)) {
      label = prefix.slice(parentPrefix.length) || "/"
    }
  }

  if (label !== "/") return label

  if (router.tags.length > 0) return `/${router.tags[0]}`
  const parts = router.location.filePath.split("/")
  const fileName = parts.pop()?.replace(/\.py$/, "") ?? ""
  if (fileName === "router" || fileName === "routes")
    return parts.pop() ?? fileName
  return fileName
}

export function getRouteLabel(route: RouteDefinition): string {
  // e.g. "{settings.version}/users" -> "/users"
  const displayPath = stripLeadingDynamicSegments(route.path)
  return route.method === "WEBSOCKET"
    ? displayPath
    : `${route.method} ${displayPath}`
}

function sortedChildren(
  routers: RouterDefinition[],
  routes: RouteDefinition[],
): EndpointTreeItem[] {
  return [
    ...routers
      .map((router) => ({ type: "router" as const, router }))
      .sort((a, b) =>
        getRouterLabel(a.router, "/")
          .toLowerCase()
          .localeCompare(getRouterLabel(b.router, "/").toLowerCase()),
      ),
    ...routes
      .map((route) => ({ type: "route" as const, route }))
      .sort((a, b) =>
        getRouteLabel(a.route)
          .toLowerCase()
          .localeCompare(getRouteLabel(b.route).toLowerCase()),
      ),
  ]
}

export class EndpointTreeProvider
  implements TreeDataProvider<EndpointTreeItem>
{
  private _onDidChangeTreeData: EventEmitter<EndpointTreeItem | undefined> =
    new EventEmitter()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private apps: AppDefinition[] = []
  private roots: EndpointTreeItem[] = []

  // VS Code caches collapsible state by item id, so toggling routersExpanded
  // alone won't re-render. Bumping toggleCount changes the id, forcing a reset.
  private routersExpanded = false
  private toggleCount = 0

  constructor(apps: AppDefinition[] = [], roots?: EndpointTreeItem[]) {
    this.apps = apps
    this.roots = roots ?? apps.map((app) => ({ type: "app" as const, app }))
  }

  getApps(): AppDefinition[] {
    return this.apps
  }

  setApps(apps: AppDefinition[], roots?: EndpointTreeItem[]): void {
    this.apps = apps
    this.roots = roots ?? apps.map((app) => ({ type: "app" as const, app }))
    this.refresh()
  }

  private findParentOfRouter(
    target: RouterDefinition,
  ): RouterDefinition | undefined {
    return findRouter(this.apps, (router) => router.children.includes(target))
  }

  private findParentOfRoute(
    target: RouteDefinition,
  ): RouterDefinition | undefined {
    return findRouter(this.apps, (router) => router.routes.includes(target))
  }

  getParent(element: EndpointTreeItem): EndpointTreeItem | undefined {
    switch (element.type) {
      case "message":
      case "workspace":
        return undefined

      case "app": {
        return this.roots.find(
          (root) =>
            root.type === "workspace" && root.apps.includes(element.app),
        )
      }

      case "router": {
        const parentRouter = this.findParentOfRouter(element.router)
        if (parentRouter) {
          return { type: "router", router: parentRouter }
        }
        const app = this.apps.find((a) => a.routers.includes(element.router))
        return app ? { type: "app", app } : undefined
      }

      case "route": {
        const parentRouter = this.findParentOfRoute(element.route)
        if (parentRouter) {
          return { type: "router", router: parentRouter }
        }
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
      return this.roots
    }

    switch (element.type) {
      case "workspace":
        return element.apps
          .map((app) => ({ type: "app" as const, app }))
          .sort((a, b) => a.app.name.localeCompare(b.app.name))
      case "app":
        return sortedChildren(element.app.routers, element.app.routes)
      case "router":
        return sortedChildren(element.router.children, element.router.routes)
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
        const appItem = new TreeItem(
          getAppLabel(element.app),
          TreeItemCollapsibleState.Expanded,
        )
        appItem.iconPath = new ThemeIcon("root-folder")
        appItem.contextValue = "app"
        appItem.description = element.app.name
        return appItem
      }

      case "router": {
        const parentRouter = this.findParentOfRouter(element.router)
        const parentPrefix = parentRouter
          ? stripLeadingDynamicSegments(parentRouter.prefix)
          : "/"

        const routerItem = new TreeItem(
          getRouterLabel(element.router, parentPrefix),
          this.routersExpanded
            ? TreeItemCollapsibleState.Expanded
            : TreeItemCollapsibleState.Collapsed,
        )
        routerItem.id = `router-${element.router.location.filePath}-${element.router.prefix}-${this.toggleCount}`
        routerItem.iconPath = new ThemeIcon("symbol-namespace")
        const totalRoutes = countRoutesInRouter(element.router)
        routerItem.description =
          totalRoutes !== 1 ? `${totalRoutes} routes` : "1 route"
        routerItem.contextValue = "router"
        return routerItem
      }

      case "route": {
        const routeItem = new TreeItem(getRouteLabel(element.route))
        routeItem.description = element.route.functionName
        routeItem.iconPath = new ThemeIcon(METHOD_ICONS[element.route.method])
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
