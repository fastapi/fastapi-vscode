import type { AppDefinition } from "../../types/endpoint"

export const mockApps: AppDefinition[] = [
  {
    name: "My API",
    filePath: "app/main.py",
    workspaceFolder: "ecommerce-api",
    routers: [
      {
        name: "users_router",
        prefix: "/api/v1/users",
        location: { filePath: "app/routers/users.py", line: 5, column: 0 },
        routes: [
          {
            method: "GET",
            path: "/",
            functionName: "list_users",
            location: {
              filePath: "app/routers/users.py",
              line: 10,
              column: 0,
            },
          },
          {
            method: "POST",
            path: "/",
            functionName: "create_user",
            location: {
              filePath: "app/routers/users.py",
              line: 20,
              column: 0,
            },
          },
          {
            method: "GET",
            path: "/{user_id}",
            functionName: "get_user",
            location: {
              filePath: "app/routers/users.py",
              line: 30,
              column: 0,
            },
          },
          {
            method: "PUT",
            path: "/{user_id}",
            functionName: "update_user",
            location: {
              filePath: "app/routers/users.py",
              line: 40,
              column: 0,
            },
          },
          {
            method: "DELETE",
            path: "/{user_id}",
            functionName: "delete_user",
            location: {
              filePath: "app/routers/users.py",
              line: 50,
              column: 0,
            },
          },
        ],
      },
      {
        name: "items_router",
        prefix: "/api/v1/items",
        location: { filePath: "app/routers/items.py", line: 5, column: 0 },
        routes: [
          {
            method: "GET",
            path: "/",
            functionName: "list_items",
            location: {
              filePath: "app/routers/items.py",
              line: 10,
              column: 0,
            },
          },
          {
            method: "POST",
            path: "/",
            functionName: "create_item",
            location: {
              filePath: "app/routers/items.py",
              line: 20,
              column: 0,
            },
          },
          {
            method: "GET",
            path: "/{item_id}",
            functionName: "get_item",
            location: {
              filePath: "app/routers/items.py",
              line: 30,
              column: 0,
            },
          },
        ],
      },
      {
        name: "ws_router",
        prefix: "/ws",
        location: {
          filePath: "app/routers/websocket.py",
          line: 5,
          column: 0,
        },
        routes: [
          {
            method: "WEBSOCKET",
            path: "/chat",
            functionName: "websocket_chat",
            location: {
              filePath: "app/routers/websocket.py",
              line: 10,
              column: 0,
            },
          },
          {
            method: "WEBSOCKET",
            path: "/notifications",
            functionName: "websocket_notifications",
            location: {
              filePath: "app/routers/websocket.py",
              line: 25,
              column: 0,
            },
          },
        ],
      },
    ],
    routes: [
      {
        method: "GET",
        path: "/",
        functionName: "root",
        location: { filePath: "app/main.py", line: 15, column: 0 },
      },
      {
        method: "GET",
        path: "/health",
        functionName: "health_check",
        location: { filePath: "app/main.py", line: 20, column: 0 },
      },
    ],
  },
  {
    name: "Admin API",
    filePath: "admin/main.py",
    workspaceFolder: "ecommerce-api",
    routers: [],
    routes: [
      {
        method: "GET",
        path: "/admin/dashboard",
        functionName: "dashboard",
        location: { filePath: "admin/main.py", line: 10, column: 0 },
      },
      {
        method: "POST",
        path: "/admin/users/{user_id}/ban",
        functionName: "ban_user",
        location: { filePath: "admin/main.py", line: 20, column: 0 },
      },
    ],
  },
]
