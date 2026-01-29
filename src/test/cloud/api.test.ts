import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import { ApiService } from "../../cloud/api"
import { mockResponse } from "../testUtils"

suite("cloud/api", () => {
  teardown(() => sinon.restore())

  suite("getDashboardUrl", () => {
    test("returns correct URL", () => {
      const url = ApiService.getDashboardUrl("my-team", "my-app")
      assert.strictEqual(
        url,
        "https://dashboard.fastapicloud.com/my-team/apps/my-app/general",
      )
    })
  })

  suite("requestDeviceCode", () => {
    test("returns device code response on success", async () => {
      const fetchStub = sinon.stub(globalThis, "fetch").resolves(
        mockResponse({
          device_code: "dc_123",
          user_code: "UC-456",
          verification_uri: "https://example.com/verify",
          verification_uri_complete: "https://example.com/verify?code=UC-456",
          expires_in: 900,
          interval: 5,
        }),
      )

      const result = await ApiService.requestDeviceCode("test-client")

      assert.strictEqual(result.device_code, "dc_123")
      assert.strictEqual(result.user_code, "UC-456")
      assert.strictEqual(result.verification_uri, "https://example.com/verify")
      assert.strictEqual(
        result.verification_uri_complete,
        "https://example.com/verify?code=UC-456",
      )
      assert.strictEqual(result.expires_in, 900)
      assert.strictEqual(result.interval, 5)

      // Verify fetch was called with correct params
      const [url, options] = fetchStub.firstCall.args
      assert.strictEqual(
        url,
        `${ApiService.BASE_URL}/login/device/authorization`,
      )
      assert.strictEqual(options?.method, "POST")
      assert.ok(
        (options?.headers as Record<string, string>)["Content-Type"]?.includes(
          "x-www-form-urlencoded",
        ),
      )
    })

    test("defaults optional fields", async () => {
      sinon.stub(globalThis, "fetch").resolves(
        mockResponse({
          device_code: "dc_123",
          user_code: "UC-456",
          verification_uri: "https://example.com/verify",
        }),
      )

      const result = await ApiService.requestDeviceCode("test-client")

      assert.strictEqual(result.verification_uri_complete, "")
      assert.strictEqual(result.expires_in, 0)
      assert.strictEqual(result.interval, 0)
    })

    test("throws on non-ok response", async () => {
      sinon.stub(globalThis, "fetch").resolves(mockResponse({}, false, 500))

      await assert.rejects(
        () => ApiService.requestDeviceCode("test-client"),
        /Device code request failed: 500/,
      )
    })

    test("throws on invalid response data", async () => {
      sinon.stub(globalThis, "fetch").resolves(mockResponse({}))

      await assert.rejects(
        () => ApiService.requestDeviceCode("test-client"),
        /Invalid response from device code endpoint/,
      )
    })
  })

  suite("pollDeviceToken", () => {
    test("returns token on success", async () => {
      sinon
        .stub(globalThis, "fetch")
        .resolves(mockResponse({ access_token: "test_token_123" }))

      const result = await ApiService.pollDeviceToken("test-client", "dc_123")

      assert.strictEqual(result, "test_token_123")
    })

    test("polls on authorization_pending then succeeds", async () => {
      const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })
      const fetchStub = sinon.stub(globalThis, "fetch")

      fetchStub
        .onFirstCall()
        .resolves(mockResponse({ error: "authorization_pending" }, false, 400))
      fetchStub
        .onSecondCall()
        .resolves(mockResponse({ access_token: "token_after_poll" }))

      const resultPromise = ApiService.pollDeviceToken(
        "test-client",
        "dc_123",
        100, // short interval for test
      )

      // Advance past the polling interval
      await clock.tickAsync(150)

      const result = await resultPromise

      assert.strictEqual(result, "token_after_poll")
      assert.strictEqual(fetchStub.callCount, 2)

      clock.restore()
    })

    test("throws on expired_token", async () => {
      sinon
        .stub(globalThis, "fetch")
        .resolves(mockResponse({ error: "expired_token" }, false, 400))

      await assert.rejects(
        () => ApiService.pollDeviceToken("test-client", "dc_123"),
        /Device code has expired/,
      )
    })

    test("throws on unknown error", async () => {
      sinon
        .stub(globalThis, "fetch")
        .resolves(mockResponse({ error: "server_error" }, false, 500))

      await assert.rejects(
        () => ApiService.pollDeviceToken("test-client", "dc_123"),
        /Device token request failed: server_error/,
      )
    })

    test("throws on abort signal", async () => {
      sinon
        .stub(globalThis, "fetch")
        .resolves(mockResponse({ error: "authorization_pending" }, false, 400))

      const controller = new AbortController()
      controller.abort()

      await assert.rejects(
        () =>
          ApiService.pollDeviceToken(
            "test-client",
            "dc_123",
            100,
            controller.signal,
          ),
        /Sign-in cancelled/,
      )
    })
  })

  suite("instance methods", () => {
    let api: ApiService
    let getSessionStub: sinon.SinonStub

    function mockSession(token: string | null) {
      getSessionStub.resolves(
        token
          ? {
              accessToken: token,
              id: "s1",
              account: { id: "a", label: "l" },
              scopes: [],
            }
          : null,
      )
    }

    setup(() => {
      getSessionStub = sinon.stub(vscode.authentication, "getSession")
      mockSession("test_token")
      api = new ApiService()
    })

    test("getTeams returns team data", async () => {
      sinon.stub(globalThis, "fetch").resolves(
        mockResponse({
          data: [{ id: "t1", name: "Team 1", slug: "team-1" }],
        }),
      )

      const teams = await api.getTeams()

      assert.strictEqual(teams.length, 1)
      assert.strictEqual(teams[0].slug, "team-1")
    })

    test("throws when not authenticated", async () => {
      mockSession(null)

      await assert.rejects(() => api.getTeams(), /Not authenticated/)
    })

    test("throws on non-ok response", async () => {
      sinon.stub(globalThis, "fetch").resolves(mockResponse({}, false, 403))

      await assert.rejects(() => api.getTeams(), /API request failed/)
    })

    test("getApps returns app data", async () => {
      sinon.stub(globalThis, "fetch").resolves(
        mockResponse({
          data: [{ id: "a1", name: "App 1", slug: "app-1" }],
        }),
      )

      const apps = await api.getApps("team-id")

      assert.strictEqual(apps.length, 1)
      assert.strictEqual(apps[0].slug, "app-1")
    })

    test("createApp sends POST", async () => {
      const fetchStub = sinon
        .stub(globalThis, "fetch")
        .resolves(mockResponse({ id: "a1", name: "New App", slug: "new-app" }))

      await api.createApp("team-id", "New App")

      const [, options] = fetchStub.firstCall.args
      assert.strictEqual(options?.method, "POST")
    })

    test("request includes auth header and user-agent", async () => {
      mockSession("my_token")

      const fetchStub = sinon
        .stub(globalThis, "fetch")
        .resolves(mockResponse({ data: [] }))

      await api.getTeams()

      const [, options] = fetchStub.firstCall.args
      const headers = options?.headers as Record<string, string>
      assert.strictEqual(headers.Authorization, "Bearer my_token")
      assert.ok(headers["User-Agent"]?.startsWith("fastapi-vscode/"))
    })
  })
})
