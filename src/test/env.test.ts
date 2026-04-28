import * as assert from "node:assert"
import * as path from "node:path"
import sinon from "sinon"
import {
  DEFAULT_BASE_URL,
  DEFAULT_DASHBOARD_URL,
  deriveDashboardUrl,
  type EnvironmentDeps,
  loadEnvironment,
} from "../env"

function makeDeps(overrides: EnvironmentDeps = {}): Required<EnvironmentDeps> {
  return {
    homedir: () => "/Users/test",
    platform: () => "darwin" as NodeJS.Platform,
    getAppData: () => undefined,
    readFile: sinon.stub().rejects(new Error("ENOENT")),
    pathJoin: path.join,
    ...overrides,
  }
}

suite("env/loadEnvironment", () => {
  suite("config path resolution", () => {
    test("macOS uses Library/Application Support", async () => {
      const readFile = sinon.stub().rejects(new Error("ENOENT"))
      await loadEnvironment(makeDeps({ platform: () => "darwin", readFile }))

      assert.strictEqual(
        readFile.firstCall.args[0],
        "/Users/test/Library/Application Support/fastapi-cli/cli.json",
      )
    })

    test("Linux uses ~/.config", async () => {
      const readFile = sinon.stub().rejects(new Error("ENOENT"))
      await loadEnvironment(
        makeDeps({
          platform: () => "linux",
          homedir: () => "/home/test",
          readFile,
        }),
      )

      assert.strictEqual(
        readFile.firstCall.args[0],
        "/home/test/.config/fastapi-cli/cli.json",
      )
    })

    test("Windows uses APPDATA", async () => {
      const readFile = sinon.stub().rejects(new Error("ENOENT"))
      await loadEnvironment(
        makeDeps({
          platform: () => "win32",
          homedir: () => "C:\\Users\\test",
          getAppData: () => "C:\\Users\\test\\AppData\\Roaming",
          readFile,
        }),
      )

      const callPath = readFile.firstCall.args[0] as string
      assert.ok(callPath.includes("fastapi-cli"))
      assert.ok(callPath.includes("AppData"))
    })

    test("Windows falls back to home when APPDATA missing", async () => {
      const readFile = sinon.stub().rejects(new Error("ENOENT"))
      await loadEnvironment(
        makeDeps({
          platform: () => "win32",
          homedir: () => "C:\\Users\\test",
          getAppData: () => undefined,
          readFile,
        }),
      )

      const callPath = readFile.firstCall.args[0] as string
      assert.ok(callPath.includes("C:\\Users\\test"))
      assert.ok(!callPath.includes("AppData"))
    })
  })

  suite("config parsing", () => {
    test("returns defaults when file missing", async () => {
      const env = await loadEnvironment(makeDeps())

      assert.strictEqual(env.baseUrl, DEFAULT_BASE_URL)
      assert.strictEqual(env.dashboardUrl, DEFAULT_DASHBOARD_URL)
    })

    test("returns defaults when JSON is invalid", async () => {
      const env = await loadEnvironment(
        makeDeps({ readFile: async () => "not json {{{" }),
      )

      assert.strictEqual(env.baseUrl, DEFAULT_BASE_URL)
      assert.strictEqual(env.dashboardUrl, DEFAULT_DASHBOARD_URL)
    })

    test("returns defaults when base_api_url is missing", async () => {
      const env = await loadEnvironment(
        makeDeps({
          readFile: async () => JSON.stringify({ other_field: "foo" }),
        }),
      )

      assert.strictEqual(env.baseUrl, DEFAULT_BASE_URL)
      assert.strictEqual(env.dashboardUrl, DEFAULT_DASHBOARD_URL)
    })

    test("uses configured base_api_url", async () => {
      const env = await loadEnvironment(
        makeDeps({
          readFile: async () =>
            JSON.stringify({
              base_api_url: "https://api.localfastapicloud.com/api/v1",
            }),
        }),
      )

      assert.strictEqual(
        env.baseUrl,
        "https://api.localfastapicloud.com/api/v1",
      )
    })
  })

  suite("deriveDashboardUrl", () => {
    test("replaces api. prefix with dashboard.", () => {
      assert.strictEqual(
        deriveDashboardUrl("https://api.localfastapicloud.com/api/v1"),
        "https://dashboard.localfastapicloud.com",
      )
    })

    test("derives prod dashboard from prod api", () => {
      assert.strictEqual(
        deriveDashboardUrl("https://api.fastapicloud.com/api/v1"),
        "https://dashboard.fastapicloud.com",
      )
    })

    test("leaves non-api. hostnames unchanged (current behavior)", () => {
      // Bug-catching test: the regex requires ^api., so anything else
      // produces an unchanged hostname. Update this test if support for
      // other prefixes (e.g. staging-api) is ever added.
      assert.strictEqual(
        deriveDashboardUrl("https://staging-api.fastapicloud.com/api/v1"),
        "https://staging-api.fastapicloud.com",
      )
    })

    test("falls back to default when URL is malformed", () => {
      assert.strictEqual(deriveDashboardUrl("not a url"), DEFAULT_DASHBOARD_URL)
    })
  })
})
