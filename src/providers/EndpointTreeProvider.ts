import { TreeDataProvider, TreeItem, ThemeIcon, EventEmitter, TreeItemCollapsibleState} from "vscode";
import { EndpointTreeItem } from "../types/endpoint";

export class EndpointTreeProvider  implements TreeDataProvider<EndpointTreeItem> {

    private _onDidChangeTreeData = new EventEmitter<EndpointTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Mock data for prototyping - will be replaced by real discovery
    private mockApps: EndpointTreeItem[] = [
        {
            type: "app",
            app: {
                name: "My API",
                filePath: "app/main.py",
                workspaceFolder: "ecommerce-api",
                routers: [
                    {
                        name: "users_router",
                        prefix: "/api/v1/users",
                        location: { filePath: "app/routers/users.py", line: 5, column: 0 },
                        routes: [
                            { method: "GET", path: "/", functionName: "list_users", location: { filePath: "app/routers/users.py", line: 10, column: 0 } },
                            { method: "POST", path: "/", functionName: "create_user", location: { filePath: "app/routers/users.py", line: 20, column: 0 } },
                            { method: "GET", path: "/{user_id}", functionName: "get_user", location: { filePath: "app/routers/users.py", line: 30, column: 0 } },
                            { method: "PUT", path: "/{user_id}", functionName: "update_user", location: { filePath: "app/routers/users.py", line: 40, column: 0 } },
                            { method: "DELETE", path: "/{user_id}", functionName: "delete_user", location: { filePath: "app/routers/users.py", line: 50, column: 0 } },
                        ]
                    },
                    {
                        name: "items_router",
                        prefix: "/api/v1/items",
                        location: { filePath: "app/routers/items.py", line: 5, column: 0 },
                        routes: [
                            { method: "GET", path: "/", functionName: "list_items", location: { filePath: "app/routers/items.py", line: 10, column: 0 } },
                            { method: "POST", path: "/", functionName: "create_item", location: { filePath: "app/routers/items.py", line: 20, column: 0 } },
                            { method: "GET", path: "/{item_id}", functionName: "get_item", location: { filePath: "app/routers/items.py", line: 30, column: 0 } },
                        ]
                    },
                    {
                        name: "ws_router",
                        prefix: "/ws",
                        location: { filePath: "app/routers/websocket.py", line: 5, column: 0 },
                        routes: [
                            { method: "WEBSOCKET", path: "/chat", functionName: "websocket_chat", location: { filePath: "app/routers/websocket.py", line: 10, column: 0 } },
                            { method: "WEBSOCKET", path: "/notifications", functionName: "websocket_notifications", location: { filePath: "app/routers/websocket.py", line: 25, column: 0 } },
                        ]
                    }
                ],
                routes: [
                    { method: "GET", path: "/", functionName: "root", location: { filePath: "app/main.py", line: 15, column: 0 } },
                    { method: "GET", path: "/health", functionName: "health_check", location: { filePath: "app/main.py", line: 20, column: 0 } },
                ]
            }
        },
        {
            type: "app",
            app: {
                name: "Admin API",
                filePath: "admin/main.py",
                workspaceFolder: "ecommerce-api",
                routers: [],
                routes: [
                    { method: "GET", path: "/admin/dashboard", functionName: "dashboard", location: { filePath: "admin/main.py", line: 10, column: 0 } },
                    { method: "POST", path: "/admin/users/{user_id}/ban", functionName: "ban_user", location: { filePath: "admin/main.py", line: 20, column: 0 } },
                ]
            }
        }
    ];


    private getMethodIcon(method: string): ThemeIcon {
        switch (method) {
            case 'GET':
                return new ThemeIcon('arrow-right');
            case 'POST':
                return new ThemeIcon('plus');
            case 'PUT':
                return new ThemeIcon('edit');
            case 'DELETE':
                return new ThemeIcon('trash');
            case 'PATCH':
                return new ThemeIcon('pencil');
            case 'OPTIONS':
                return new ThemeIcon('settings-gear');
            case 'HEAD':
                return new ThemeIcon('eye');
            case 'WEBSOCKET':
                return new ThemeIcon('broadcast');
            default:
                return new ThemeIcon('question');
        }
    }

    getChildren(element?: EndpointTreeItem): EndpointTreeItem[] {
        if (!element) {
            // Root level: return workspaces (or apps if single workspace)
            return this.mockApps;
        }

        switch (element.type) {
            case "workspace":
                return element.app.map(app => ({ type: "app" as const, app }));
            case "app":
                const routers = element.app.routers.map(router => ({ type: "router" as const, router }));
                const routes = element.app.routes.map(route => ({ type: "route" as const, route }));
                return [...routers, ...routes];
            case "router":
                return element.router.routes.map(route => ({ type: "route" as const, route }));
            case "route":
                return [];
        }
        return [];
    }
    
    getTreeItem(element: EndpointTreeItem): TreeItem {
        switch (element.type) {
            case "workspace":
                return new TreeItem(element.label, TreeItemCollapsibleState.Expanded);
            case "app":
                const appItem = new TreeItem(element.app.name, TreeItemCollapsibleState.Expanded);
                appItem.iconPath = new ThemeIcon('root-folder');
                return appItem;
            case "router":
                const routerItem = new TreeItem(element.router.prefix, TreeItemCollapsibleState.Collapsed);
                routerItem.iconPath = new ThemeIcon('symbol-namespace');
                routerItem.description = `${element.router.routes.length} routes`;
                routerItem.contextValue = "router";
                return routerItem;
            case "route":
                const routeItem = new TreeItem(`${element.route.method} ${element.route.path}`)
                routeItem.description = element.route.functionName
                routeItem.iconPath = this.getMethodIcon(element.route.method)
                routeItem.contextValue = "route"
                routeItem.tooltip = `${element.route.method} ${element.route.path}\n\nFunction: ${element.route.functionName}\nFile: ${element.route.location.filePath}:${element.route.location.line}`
                routeItem.command = {
                    command: "fastapi-vscode.goToEndpoint",
                    title: "Go to Definition",
                    arguments: [element]
                }
                return routeItem
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}