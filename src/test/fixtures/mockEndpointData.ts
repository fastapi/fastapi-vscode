import type { AppDefinition } from "../../core/types"
import type { EndpointTreeItem } from "../../vscode/endpointTreeProvider"

export const mockApps: AppDefinition[] = [
  {
    name: "My API",
    filePath: "/Users/dev/ecommerce-api/app/main.py",
    workspaceFolder: "ecommerce-api",
    routers: [
      {
        name: "users_router",
        prefix: "/api/v1/users",
        tags: ["users"],
        location: {
          filePath: "/Users/dev/ecommerce-api/app/routers/users.py",
          line: 5,
          column: 0,
        },
        routes: [
          {
            method: "GET",
            path: "/api/v1/users/",
            functionName: "list_users",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/users.py",
              line: 10,
              column: 0,
            },
          },
          {
            method: "POST",
            path: "/api/v1/users/",
            functionName: "create_user",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/users.py",
              line: 20,
              column: 0,
            },
          },
          {
            method: "GET",
            path: "/api/v1/users/{user_id}",
            functionName: "get_user",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/users.py",
              line: 30,
              column: 0,
            },
          },
          {
            method: "PUT",
            path: "/api/v1/users/{user_id}",
            functionName: "update_user",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/users.py",
              line: 40,
              column: 0,
            },
          },
          {
            method: "DELETE",
            path: "/api/v1/users/{user_id}",
            functionName: "delete_user",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/users.py",
              line: 50,
              column: 0,
            },
          },
        ],
        children: [],
      },
      {
        name: "items_router",
        prefix: "/api/v1/items",
        tags: ["items"],
        location: {
          filePath: "/Users/dev/ecommerce-api/app/routers/items.py",
          line: 5,
          column: 0,
        },
        routes: [
          {
            method: "GET",
            path: "/api/v1/items/",
            functionName: "list_items",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/items.py",
              line: 10,
              column: 0,
            },
          },
          {
            method: "POST",
            path: "/api/v1/items/",
            functionName: "create_item",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/items.py",
              line: 20,
              column: 0,
            },
          },
          {
            method: "GET",
            path: "/api/v1/items/{item_id}",
            functionName: "get_item",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/items.py",
              line: 30,
              column: 0,
            },
          },
        ],
        children: [],
      },
      {
        name: "ws_router",
        prefix: "/ws",
        tags: ["websocket"],
        location: {
          filePath: "/Users/dev/ecommerce-api/app/routers/websocket.py",
          line: 5,
          column: 0,
        },
        routes: [
          {
            method: "WEBSOCKET",
            path: "/ws/chat",
            functionName: "websocket_chat",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/websocket.py",
              line: 10,
              column: 0,
            },
          },
          {
            method: "WEBSOCKET",
            path: "/ws/notifications",
            functionName: "websocket_notifications",
            location: {
              filePath: "/Users/dev/ecommerce-api/app/routers/websocket.py",
              line: 25,
              column: 0,
            },
          },
        ],
        children: [],
      },
    ],
    routes: [
      {
        method: "GET",
        path: "/",
        functionName: "root",
        location: {
          filePath: "/Users/dev/ecommerce-api/app/main.py",
          line: 15,
          column: 0,
        },
      },
      {
        method: "GET",
        path: "/health",
        functionName: "health_check",
        location: {
          filePath: "/Users/dev/ecommerce-api/app/main.py",
          line: 20,
          column: 0,
        },
      },
    ],
  },
  {
    name: "Admin API",
    filePath: "/Users/dev/ecommerce-api/admin/main.py",
    workspaceFolder: "ecommerce-api",
    routers: [],
    routes: [
      {
        method: "GET",
        path: "/admin/dashboard",
        functionName: "dashboard",
        location: {
          filePath: "/Users/dev/ecommerce-api/admin/main.py",
          line: 10,
          column: 0,
        },
      },
      {
        method: "POST",
        path: "/admin/users/{user_id}/ban",
        functionName: "ban_user",
        location: {
          filePath: "/Users/dev/ecommerce-api/admin/main.py",
          line: 20,
          column: 0,
        },
      },
    ],
  },
  {
    name: "Analytics Service",
    filePath: "/Users/dev/analytics-service/src/main.py",
    workspaceFolder: "analytics-service",
    routers: [
      {
        name: "metrics_router",
        prefix: "/api/metrics",
        tags: ["metrics"],
        location: {
          filePath: "/Users/dev/analytics-service/src/routers/metrics.py",
          line: 8,
          column: 0,
        },
        routes: [
          {
            method: "GET",
            path: "/api/metrics/daily",
            functionName: "get_daily_metrics",
            location: {
              filePath: "/Users/dev/analytics-service/src/routers/metrics.py",
              line: 15,
              column: 0,
            },
          },
          {
            method: "GET",
            path: "/api/metrics/weekly",
            functionName: "get_weekly_metrics",
            location: {
              filePath: "/Users/dev/analytics-service/src/routers/metrics.py",
              line: 25,
              column: 0,
            },
          },
          {
            method: "POST",
            path: "/api/metrics/export",
            functionName: "export_metrics",
            location: {
              filePath: "/Users/dev/analytics-service/src/routers/metrics.py",
              line: 35,
              column: 0,
            },
          },
        ],
        children: [],
      },
    ],
    routes: [
      {
        method: "GET",
        path: "/health",
        functionName: "health",
        location: {
          filePath: "/Users/dev/analytics-service/src/main.py",
          line: 12,
          column: 0,
        },
      },
    ],
  },
]

/**
 * Groups apps by workspace folder for multi-root workspace support.
 * Returns workspace items at the root level, each containing their apps.
 */
export function groupAppsByWorkspace(
  apps: AppDefinition[],
): EndpointTreeItem[] {
  const workspaceMap = new Map<string, AppDefinition[]>()

  for (const app of apps) {
    const existing = workspaceMap.get(app.workspaceFolder) ?? []
    existing.push(app)
    workspaceMap.set(app.workspaceFolder, existing)
  }

  // If only one workspace, return apps directly (no grouping needed)
  if (workspaceMap.size === 1) {
    return apps.map((app) => ({ type: "app" as const, app }))
  }

  // Multiple workspaces: return workspace items
  return Array.from(workspaceMap.entries()).map(([label, workspaceApps]) => ({
    type: "workspace" as const,
    label,
    apps: workspaceApps,
  }))
}
