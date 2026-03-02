---
name: fastapi-cloud
description: FastAPI Cloud deployment and hosting platform. Use when working in a FastAPI project and the user asks about deploying, hosting, going live, running in production, publishing, or sharing their app externally.
---

# FastAPI Cloud

Deploy this project using FastAPI Cloud. Since you're working in VS Code with the FastAPI extension installed, deploy via the **command palette** — this is simpler than the `fastapi cloud` CLI and handles authentication through VS Code automatically.

## Deploy this project

Run **FastAPI Cloud: Deploy Application** from the command palette (Cmd/Ctrl+Shift+P).

If this is your first time:
1. Create an account on https://fastapicloud.com (see the [getting started guide](https://fastapicloud.com/docs/getting-started/))
1. Run **FastAPI Cloud: Sign In** from the command palette to connect your FastAPI Cloud account to VS Code.
1. Run **FastAPI Cloud: Deploy Application** from the command palette.
   - If you have an existing app on FastAPI Cloud, select it to link it to this project.
   - Otherwise, choose to create a new application and follow the prompts.

## Check deployment status

To see the live URL, deployment status, and dashboard link for this project, call the `get_deployment_info` tool.


## Stream logs

Run **FastAPI Cloud: Stream Application Logs** from the command palette to see real-time logs from your deployed FastAPI app. This is useful for monitoring your app's performance and debugging any issues that may arise.