import {
  EventEmitter,
  ThemeIcon,
  type TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
} from "vscode"
import type {
  AppDefinition,
  EndpointTreeItem,
  HTTPMethod,
} from "../types/endpoint"

export class EndpointTreeProvider
  implements TreeDataProvider<EndpointTreeItem>
{
  private _onDidChangeTreeData = new EventEmitter<
    EndpointTreeItem | undefined
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private apps: AppDefinition[] = []

  constructor(apps: AppDefinition[] = []) {
    this.apps = apps
  }

  setApps(apps: AppDefinition[]): void {
    this.apps = apps
    this.refresh()
  }

  private getMethodIcon(method: HTTPMethod): ThemeIcon {
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
      default:
        return new ThemeIcon("question")
    }
  }

  getChildren(element?: EndpointTreeItem): EndpointTreeItem[] {
    if (!element) {
      // Root level: return apps
      return this.apps.map((app) => ({ type: "app" as const, app }))
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
      case "workspace":
        return new TreeItem(element.label, TreeItemCollapsibleState.Expanded)
      case "app": {
        const appItem = new TreeItem(
          element.app.name,
          TreeItemCollapsibleState.Expanded,
        )
        appItem.iconPath = new ThemeIcon("root-folder")
        return appItem
      }
      case "router": {
        const routerItem = new TreeItem(
          element.router.prefix,
          TreeItemCollapsibleState.Collapsed,
        )
        routerItem.iconPath = new ThemeIcon("symbol-namespace")
        routerItem.description = `${element.router.routes.length} routes`
        routerItem.contextValue = "router"
        return routerItem
      }
      case "route": {
        const routeItem = new TreeItem(
          `${element.route.method} ${element.route.path}`,
        )
        routeItem.description = element.route.functionName
        routeItem.iconPath = this.getMethodIcon(element.route.method)
        routeItem.contextValue = "route"
        routeItem.tooltip = `${element.route.method} ${element.route.path}\n\nFunction: ${element.route.functionName}\nFile: ${element.route.location.filePath}:${element.route.location.line}`
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
}
