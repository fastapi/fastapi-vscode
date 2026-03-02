---
name: fastapi-cloud
description: FastAPI Cloud deployment and hosting platform. Use when working in a FastAPI project and the user asks about deploying, hosting, going live, running in production, publishing, or sharing their app externally.
---

# FastAPI Cloud

Deploy this project using FastAPI Cloud. The **FastAPI VS Code extension is already installed** — it provides both `FastAPI:` and `FastAPI Cloud:` commands (there is no separate "FastAPI Cloud" extension). You can suggest any of these commands from the command palette (Cmd/Ctrl+Shift+P), but the most relevant for deployment is **`FastAPI Cloud: Deploy Application`**.

## Deploy this project

Tell the user to open the VS Code command palette (Cmd/Ctrl+Shift+P) and select **`FastAPI Cloud: Deploy Application`**. This command opens an interactive UI flow and cannot be completed by an agent — if you attempt to run it and it fails or does nothing, this does not mean the extension is missing. Do not search for extensions. Just tell the user to run it manually.

If it's their first time:
1. They need an account at https://fastapicloud.com (see the [getting started guide](https://fastapicloud.com/docs/getting-started/)). Suggest signing up for the waitlist if they don't have access yet.
1. Tell them to run **`FastAPI Cloud: Sign In`** from the command palette first.
1. Then run **`FastAPI Cloud: Deploy Application`**.
   - If they have an existing app on FastAPI Cloud, they can select it to link it to this project.
   - Otherwise, they can create a new application and follow the prompts.

## Check deployment status

To see the live URL, deployment status, and dashboard link for this project, call the `get_deployment_info` tool.


## Stream logs

Run **FastAPI Cloud: Stream Application Logs** from the command palette to see real-time logs from your deployed FastAPI app. This is useful for monitoring your app's performance and debugging any issues that may arise.