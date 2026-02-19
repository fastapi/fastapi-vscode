# Release Notes

## Latest Changes

## Features

* ✨ Display docstrings on hover in path operations panel. PR [#67](https://github.com/fastapi/fastapi-vscode/pull/67) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🚸  Allow users to change `since` when actively streaming logs. PR [#63](https://github.com/fastapi/fastapi-vscode/pull/63) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add support for FastAPI Cloud log streaming. PR [#39](https://github.com/fastapi/fastapi-vscode/pull/39) by [@savannahostrowski](https://github.com/savannahostrowski).
* ♻️ Refactor deployment workflow . PR [#36](https://github.com/fastapi/fastapi-vscode/pull/36) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add support for deployment to FastAPI Cloud. PR [#34](https://github.com/fastapi/fastapi-vscode/pull/34) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Cloud authentication, basic status bar and project linking/unlinking. PR [#32](https://github.com/fastapi/fastapi-vscode/pull/32) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add Welcome Page and Update Icons. PR [#25](https://github.com/fastapi/fastapi-vscode/pull/25) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add support for vscode.dev. PR [#18](https://github.com/fastapi/fastapi-vscode/pull/18) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Support multiroot workspaces. PR [#23](https://github.com/fastapi/fastapi-vscode/pull/23) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add route search to command palette. PR [#21](https://github.com/fastapi/fastapi-vscode/pull/21) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨  Add output channel for diagnostic logging. PR [#17](https://github.com/fastapi/fastapi-vscode/pull/17) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add using currently open file as a last resort for app discovery. PR [#15](https://github.com/fastapi/fastapi-vscode/pull/15) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add support for `pyproject.toml` parsing to find app entrypoint. PR [#14](https://github.com/fastapi/fastapi-vscode/pull/14) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add Test CodeLens navigation. PR [#8](https://github.com/fastapi/fastapi-vscode/pull/8) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add Report Issue command in Command Palette. PR [#5](https://github.com/fastapi/fastapi-vscode/pull/5) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add file watching for Endpoint Explorer. PR [#3](https://github.com/fastapi/fastapi-vscode/pull/3) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Add endpoint discovery service for Endpoint Explorer. PR [#2](https://github.com/fastapi/fastapi-vscode/pull/2) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✨ Initial frontend work for explorer view. PR [#1](https://github.com/fastapi/fastapi-vscode/pull/1) by [@savannahostrowski](https://github.com/savannahostrowski).

## Fixes

* 🔧  Update `.vscodeignore` to make bundle smaller. PR [#6](https://github.com/fastapi/fastapi-vscode/pull/6) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛  Add `matchOnDescription` to allow function name searching. PR [#60](https://github.com/fastapi/fastapi-vscode/pull/60) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛  Find all FastAPI apps in a workspace folder, rather than just the shallowest. PR [#69](https://github.com/fastapi/fastapi-vscode/pull/69) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛 Resolve string variables in route paths. PR [#66](https://github.com/fastapi/fastapi-vscode/pull/66) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🚸 Add toast to show that authentication succeeded. PR [#64](https://github.com/fastapi/fastapi-vscode/pull/64) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🚸  Update HTTP operation sort order. PR [#59](https://github.com/fastapi/fastapi-vscode/pull/59) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🚸 Update log button text to use "start" instead of "stream". PR [#58](https://github.com/fastapi/fastapi-vscode/pull/58) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🚸 Watch all settings changes so we prompt to reload when changed. PR [#57](https://github.com/fastapi/fastapi-vscode/pull/57) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🚸 Update methods to use colours instead of icons. PR [#55](https://github.com/fastapi/fastapi-vscode/pull/55) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛 Fix failed deployment UX. PR [#41](https://github.com/fastapi/fastapi-vscode/pull/41) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛  Fix "building" status text during deployment. PR [#38](https://github.com/fastapi/fastapi-vscode/pull/38) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛 Fix posthog import crashing in vscode.dev. PR [#31](https://github.com/fastapi/fastapi-vscode/pull/31) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛 Fix activity bar logo. PR [#27](https://github.com/fastapi/fastapi-vscode/pull/27) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛 Fix CodeLens route matching and nested router discovery . PR [#20](https://github.com/fastapi/fastapi-vscode/pull/20) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🐛  Fix incorrect selection of root when app and router defined in same file. PR [#9](https://github.com/fastapi/fastapi-vscode/pull/9) by [@savannahostrowski](https://github.com/savannahostrowski).

## Docs

* 📝 Document FastAPI Cloud deployment in README. PR [#37](https://github.com/fastapi/fastapi-vscode/pull/37) by [@savannahostrowski](https://github.com/savannahostrowski).
* 📝  Add cloud deploy to walkthrough. PR [#35](https://github.com/fastapi/fastapi-vscode/pull/35) by [@savannahostrowski](https://github.com/savannahostrowski).
* 📝  Cleanup README to highlight features and usage. PR [#26](https://github.com/fastapi/fastapi-vscode/pull/26) by [@savannahostrowski](https://github.com/savannahostrowski).
* 📝 Update feature list in docs. PR [#24](https://github.com/fastapi/fastapi-vscode/pull/24) by [@savannahostrowski](https://github.com/savannahostrowski).
* 📝 Add documentation for `fastapi.showTestCodeLenses`. PR [#16](https://github.com/fastapi/fastapi-vscode/pull/16) by [@savannahostrowski](https://github.com/savannahostrowski).

## Refactors

* ♻️ Refactor `fastapi.entryPoint` accept module notation only. PR [#65](https://github.com/fastapi/fastapi-vscode/pull/65) by [@savannahostrowski](https://github.com/savannahostrowski).

## Internal

* ⚙️  Remove `dist/` before running tests to prevent stale files. PR [#61](https://github.com/fastapi/fastapi-vscode/pull/61) by [@savannahostrowski](https://github.com/savannahostrowski).
* ⚙️ Bump `@types/vscode` and `engine.vscode`. PR [#62](https://github.com/fastapi/fastapi-vscode/pull/62) by [@savannahostrowski](https://github.com/savannahostrowski).
* ⚙️   Allow per-project telemetry configuration. PR [#68](https://github.com/fastapi/fastapi-vscode/pull/68) by [@savannahostrowski](https://github.com/savannahostrowski).
* ♻️ Rename endpoint to path operation. PR [#56](https://github.com/fastapi/fastapi-vscode/pull/56) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🍱  Resize GIFs for README and Walkthrough. PR [#40](https://github.com/fastapi/fastapi-vscode/pull/40) by [@savannahostrowski](https://github.com/savannahostrowski).
* 👷 Add typecheck to CI and pre-commit. PR [#33](https://github.com/fastapi/fastapi-vscode/pull/33) by [@savannahostrowski](https://github.com/savannahostrowski).
* 🔧 Update .vscodeignore to ignore coverage/ and scripts/. PR [#30](https://github.com/fastapi/fastapi-vscode/pull/30) by [@savannahostrowski](https://github.com/savannahostrowski).
* ✅ Improve test coverage and add CI step to ensure coverage. PR [#28](https://github.com/fastapi/fastapi-vscode/pull/28) by [@savannahostrowski](https://github.com/savannahostrowski).
* ♻️ Refactor tree utils and EndpointTreeProvider. PR [#29](https://github.com/fastapi/fastapi-vscode/pull/29) by [@savannahostrowski](https://github.com/savannahostrowski).
* 📈 Add telemetry infrastructure, events and documentation. PR [#22](https://github.com/fastapi/fastapi-vscode/pull/22) by [@savannahostrowski](https://github.com/savannahostrowski).
* 👷 Add latest-changes GitHub action and labeler. PR [#11](https://github.com/fastapi/fastapi-vscode/pull/11) by [@tiangolo](https://github.com/tiangolo).
* ♻️  Rename `object` to `owner` in `RouteInfo`, `IncludeRouterInfo` and `MountInfo` . PR [#10](https://github.com/fastapi/fastapi-vscode/pull/10) by [@savannahostrowski](https://github.com/savannahostrowski).
* 👷 Fix permissions for latest-changes on CI. PR [#70](https://github.com/fastapi/fastapi-vscode/pull/70) by [@tiangolo](https://github.com/tiangolo).
