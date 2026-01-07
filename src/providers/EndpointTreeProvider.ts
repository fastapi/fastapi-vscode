import {
  EventEmitter,
  MarkdownString,
  ThemeIcon,
  type TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
} from "vscode"
import type {
  AppDefinition,
  EndpointTreeItem,
  RouteMethod,
} from "../types/endpoint"

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

  getChildren(element?: EndpointTreeItem): EndpointTreeItem[] {
    if (!element) {
      // Root level: use grouping function (may return workspaces or apps)
      return this.groupApps(this.apps)
    }

    switch (element.type) {
      case "workspace":
        return element.apps.map((app) => ({ type: "app" as const, app }))
      case "app": {
        const routers = element.app.routers.map((router) => ({
          type: "router" as const,
          router,
        }))
        const routes = element.app.routes.map((route) => ({
          type: "route" as const,
          route,
        }))
        return [...routers, ...routes]
      }
      case "router":
        return element.router.routes.map((route) => ({
          type: "route" as const,
          route,
        }))
      case "route":
        return []
    }
  }

  getTreeItem(element: EndpointTreeItem): TreeItem {
    switch (element.type) {
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
          element.app.name,
          TreeItemCollapsibleState.Expanded,
        )
        appItem.iconPath = new ThemeIcon("root-folder")
        appItem.contextValue = "app"
        return appItem
      }
      case "router": {
        const routerItem = new TreeItem(
          element.router.prefix,
          TreeItemCollapsibleState.Collapsed,
        )
        routerItem.iconPath = new ThemeIcon("symbol-namespace")

        routerItem.description =
          element.router.routes.length !== 1
            ? `${element.router.routes.length} routes`
            : "1 route"
        routerItem.contextValue = "router"
        return routerItem
      }
      case "route": {
        // For WebSocket routes, just show path (icon already indicates WS)
        const label =
          element.route.method === "WEBSOCKET"
            ? element.route.path
            : `${element.route.method} ${element.route.path}`
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

  dispose(): void {
    this._onDidChangeTreeData.dispose()
  }
}
