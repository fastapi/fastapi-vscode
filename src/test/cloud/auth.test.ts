import * as assert from "node:assert"
import sinon from "sinon"
import * as vscode from "vscode"
import {
  CloudAuthenticationProvider,
  isTokenExpired,
  SESSION_ID,
} from "../../cloud/auth"
import { mockResponse, stubFs } from "../testUtils"

function createJwtToken(payload: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" }
  const headerEncoded = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  )
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  )
  const signature = Buffer.from("signature").toString("base64url")
  return `${headerEncoded}.${payloadEncoded}.${signature}`
}

function validToken(): string {
  return createJwtToken({ exp: Math.floor(Date.now() / 1000) + 3600 })
}

function expiredToken(): string {
  return createJwtToken({ exp: Math.floor(Date.now() / 1000) - 3600 })
}

function createMockContext(): vscode.ExtensionContext {
  const secrets: Record<string, string> = {}
  return {
    secrets: {
      get: sinon.stub().callsFake(async (key: string) => secrets[key]),
      store: sinon.stub().callsFake(async (key: string, value: string) => {
        secrets[key] = value
      }),
      delete: sinon.stub().callsFake(async (key: string) => {
        delete secrets[key]
      }),
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
        .event,
    },
  } as unknown as vscode.ExtensionContext
}

suite("cloud/auth", () => {
  suite("isTokenExpired", () => {
    test("valid token", () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600
      const token = createJwtToken({ exp: futureExp })
      assert.ok(!isTokenExpired(token))
    })

    test("expired token", () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600
      const token = createJwtToken({ exp: pastExp })
      assert.ok(isTokenExpired(token))
    })

    test("no exp claim", () => {
      const token = createJwtToken({})
      assert.ok(!isTokenExpired(token))
    })

    test("malformed tokens", () => {
      assert.ok(isTokenExpired("not.a.valid.jwt.token"))
      assert.ok(isTokenExpired("only.two"))
      assert.ok(isTokenExpired("invalid"))
      assert.ok(isTokenExpired(""))
      assert.ok(isTokenExpired("..."))
    })

    test("invalid base64", () => {
      assert.ok(isTokenExpired("header.!!!invalid!!!.signature"))
    })

    test("exact expiration", () => {
      const currentTime = Math.floor(Date.now() / 1000)
      const token = createJwtToken({ exp: currentTime })
      assert.ok(isTokenExpired(token))
    })

    test("one second before expiration", () => {
      const currentTime = Math.floor(Date.now() / 1000)
      const token = createJwtToken({ exp: currentTime + 1 })
      assert.ok(!isTokenExpired(token))
    })
  })

  suite("CloudAuthenticationProvider", () => {
    let fsStub: ReturnType<typeof stubFs>

    setup(() => {
      sinon
        .stub(vscode.authentication, "registerAuthenticationProvider")
        .returns({ dispose: sinon.stub() } as any)
      fsStub = stubFs()
    })

    teardown(() => {
      fsStub.restore()
      sinon.restore()
    })

    function createProvider() {
      const context = createMockContext()
      const provider = new CloudAuthenticationProvider(context)
      return { provider, context }
    }

    suite("getSessions", () => {
      test("returns session when valid token exists on filesystem", async () => {
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )

        const fetchStub = sinon
          .stub(globalThis, "fetch")
          .resolves(
            mockResponse({ email: "test@example.com", full_name: "Test" }),
          )

        const { provider } = createProvider()
        const sessions = await provider.getSessions()

        assert.strictEqual(sessions.length, 1)
        assert.strictEqual(sessions[0].accessToken, token)
        assert.strictEqual(sessions[0].account.label, "test@example.com")
        assert.ok(fetchStub.calledOnce)

        await provider.dispose()
      })

      test("returns empty when token is expired", async () => {
        const token = expiredToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )

        const { provider } = createProvider()
        const sessions = await provider.getSessions()

        assert.strictEqual(sessions.length, 0)

        await provider.dispose()
      })

      test("returns empty when file does not exist", async () => {
        fsStub.fake.readFile.rejects(new Error("File not found"))

        const { provider } = createProvider()
        const sessions = await provider.getSessions()

        assert.strictEqual(sessions.length, 0)

        await provider.dispose()
      })

      test("uses cached label on subsequent calls", async () => {
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )

        const fetchStub = sinon
          .stub(globalThis, "fetch")
          .resolves(
            mockResponse({ email: "cached@example.com", full_name: "Cached" }),
          )

        const { provider } = createProvider()

        // First call fetches and caches the label
        const sessions1 = await provider.getSessions()
        assert.strictEqual(sessions1[0].account.label, "cached@example.com")
        assert.strictEqual(fetchStub.callCount, 1)

        // Second call uses cached label, no new fetch
        const sessions2 = await provider.getSessions()
        assert.strictEqual(sessions2[0].account.label, "cached@example.com")
        assert.strictEqual(fetchStub.callCount, 1)

        await provider.dispose()
      })

      test("falls back to default label when getUser fails", async () => {
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )

        sinon.stub(globalThis, "fetch").rejects(new Error("network error"))

        const { provider } = createProvider()
        const sessions = await provider.getSessions()

        assert.strictEqual(sessions.length, 1)
        assert.strictEqual(sessions[0].account.label, "FastAPI Cloud")

        await provider.dispose()
      })

      test("falls back to default label when getUser returns non-ok", async () => {
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )

        sinon.stub(globalThis, "fetch").resolves(mockResponse({}, false, 401))

        const { provider } = createProvider()
        const sessions = await provider.getSessions()

        assert.strictEqual(sessions.length, 1)
        assert.strictEqual(sessions[0].account.label, "FastAPI Cloud")

        await provider.dispose()
      })
    })

    suite("saveToken", () => {
      test("saves token to filesystem", async () => {
        fsStub.fake.createDirectory.resolves()
        fsStub.fake.writeFile.resolves()

        const { provider } = createProvider()
        await provider.saveToken("my-token")

        assert.ok(fsStub.fake.createDirectory.calledOnce)
        assert.ok(fsStub.fake.writeFile.calledOnce)

        const written = fsStub.fake.writeFile.firstCall.args[1]
        const parsed = JSON.parse(Buffer.from(written).toString())
        assert.strictEqual(parsed.access_token, "my-token")

        await provider.dispose()
      })
    })

    suite("removeSession", () => {
      test("deletes auth file and fires event", async () => {
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )
        sinon
          .stub(globalThis, "fetch")
          .resolves(
            mockResponse({ email: "test@example.com", full_name: "Test" }),
          )
        fsStub.fake.delete.resolves()

        const { provider } = createProvider()
        const fired = sinon.stub()
        provider.onDidChangeSessions(fired)

        await provider.removeSession(SESSION_ID)

        assert.ok(fsStub.fake.delete.calledOnce)
        const removeEvent = fired.args.find(
          (args: any[]) => args[0].removed.length > 0,
        )
        assert.ok(
          removeEvent,
          "should fire onDidChangeSessions with removed session",
        )
        assert.strictEqual(removeEvent[0].removed[0].id, SESSION_ID)

        await provider.dispose()
      })
    })

    suite("signOut", () => {
      test("clears cached label and removes sessions", async () => {
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )
        const fetchStub = sinon
          .stub(globalThis, "fetch")
          .resolves(
            mockResponse({ email: "test@example.com", full_name: "Test" }),
          )
        fsStub.fake.delete.resolves()

        const { provider } = createProvider()

        // First call fetches and caches the label
        await provider.getSessions()

        // Verify label is cached
        const sessions = await provider.getSessions()
        assert.strictEqual(sessions[0].account.label, "test@example.com")

        await provider.signOut()
        assert.ok(fsStub.fake.delete.calledOnce)

        // After signOut, cache is cleared so next getSessions should re-fetch
        const countAfterSignOut = fetchStub.callCount
        await provider.getSessions()
        assert.ok(
          fetchStub.callCount > countAfterSignOut,
          "should re-fetch user info after cache was cleared by signOut",
        )

        await provider.dispose()
      })
    })

    suite("createSession", () => {
      test("returns existing session when already logged in", async () => {
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )
        sinon
          .stub(globalThis, "fetch")
          .resolves(
            mockResponse({ email: "test@example.com", full_name: "Test" }),
          )

        const { provider } = createProvider()
        const session = await provider.createSession()

        assert.strictEqual(session.accessToken, token)
        assert.strictEqual(session.account.label, "test@example.com")

        await provider.dispose()
      })

      test("performs device code flow when not logged in", async () => {
        // Not logged in initially
        fsStub.fake.readFile.rejects(new Error("File not found"))

        const token = validToken()
        const fetchStub = sinon.stub(globalThis, "fetch")
        // requestDeviceCode call
        fetchStub.onFirstCall().resolves(
          mockResponse({
            device_code: "dev123",
            user_code: "USER-CODE",
            verification_uri: "https://auth.example.com/device",
            verification_uri_complete:
              "https://auth.example.com/device?code=USER-CODE",
            interval: 1,
          }),
        )
        // pollDeviceToken call
        fetchStub.onSecondCall().resolves(mockResponse({ access_token: token }))
        // getUser call (after saveToken, getSessions is called)
        fetchStub
          .onThirdCall()
          .resolves(
            mockResponse({ email: "new@example.com", full_name: "New" }),
          )

        const openStub = sinon.stub(vscode.env, "openExternal")
        sinon
          .stub(vscode.window, "withProgress")
          .callsFake(async (_opts, task) => {
            const cancellationToken = {
              isCancellationRequested: false,
              onCancellationRequested: sinon.stub(),
            }
            return task({ report: sinon.stub() }, cancellationToken as any)
          })

        // saveToken stubs
        fsStub.fake.createDirectory.resolves()
        fsStub.fake.writeFile.callsFake(async () => {
          // After saveToken writes, getSessions should find the token
          fsStub.fake.readFile.resolves(
            Buffer.from(JSON.stringify({ access_token: token })),
          )
        })

        const { provider } = createProvider()
        const session = await provider.createSession()

        assert.ok(openStub.calledOnce)
        assert.ok(fsStub.fake.writeFile.calledOnce)
        assert.strictEqual(session.accessToken, token)

        await provider.dispose()
      })

      test("shows notification after device code sign-in", async () => {
        fsStub.fake.readFile.rejects(new Error("File not found"))

        const token = validToken()
        const fetchStub = sinon.stub(globalThis, "fetch")
        fetchStub.onFirstCall().resolves(
          mockResponse({
            device_code: "dev123",
            user_code: "USER-CODE",
            verification_uri: "https://auth.example.com/device",
            verification_uri_complete:
              "https://auth.example.com/device?code=USER-CODE",
            interval: 1,
          }),
        )
        fetchStub.onSecondCall().resolves(mockResponse({ access_token: token }))
        fetchStub
          .onThirdCall()
          .resolves(
            mockResponse({ email: "new@example.com", full_name: "New" }),
          )

        sinon.stub(vscode.env, "openExternal")
        sinon
          .stub(vscode.window, "withProgress")
          .callsFake(async (_opts, task) => {
            const cancellationToken = {
              isCancellationRequested: false,
              onCancellationRequested: sinon.stub(),
            }
            return task({ report: sinon.stub() }, cancellationToken as any)
          })
        const infoStub = sinon.stub(vscode.window, "showInformationMessage")

        fsStub.fake.createDirectory.resolves()
        fsStub.fake.writeFile.callsFake(async () => {
          fsStub.fake.readFile.resolves(
            Buffer.from(JSON.stringify({ access_token: token })),
          )
        })

        const { provider } = createProvider()
        await provider.createSession()

        assert.ok(
          infoStub.calledWith("Signed in to FastAPI Cloud as new@example.com"),
        )

        await provider.dispose()
      })

      test("wraps network error with friendly message", async () => {
        fsStub.fake.readFile.rejects(new Error("File not found"))

        sinon
          .stub(globalThis, "fetch")
          .rejects(new TypeError("Failed to fetch"))

        const { provider } = createProvider()

        await assert.rejects(() => provider.createSession(), {
          message:
            "Unable to connect to FastAPI Cloud. Please check your network connection and try again.",
        })

        await provider.dispose()
      })

      test("rethrows non-network errors", async () => {
        fsStub.fake.readFile.rejects(new Error("File not found"))

        sinon.stub(globalThis, "fetch").rejects(new Error("Some other error"))

        const { provider } = createProvider()

        await assert.rejects(() => provider.createSession(), {
          message: "Some other error",
        })

        await provider.dispose()
      })

      test("uses verification_uri with user_code when no complete URI", async () => {
        fsStub.fake.readFile.rejects(new Error("File not found"))

        const token = validToken()
        const fetchStub = sinon.stub(globalThis, "fetch")
        fetchStub.onFirstCall().resolves(
          mockResponse({
            device_code: "dev123",
            user_code: "ABCD-1234",
            verification_uri: "https://auth.example.com/device",
            // no verification_uri_complete
            interval: 1,
          }),
        )
        fetchStub.onSecondCall().resolves(mockResponse({ access_token: token }))
        fetchStub
          .onThirdCall()
          .resolves(
            mockResponse({ email: "test@example.com", full_name: "Test" }),
          )

        const openStub = sinon.stub(vscode.env, "openExternal")
        sinon
          .stub(vscode.window, "withProgress")
          .callsFake(async (_opts, task) => {
            const cancellationToken = {
              isCancellationRequested: false,
              onCancellationRequested: sinon.stub(),
            }
            return task({ report: sinon.stub() }, cancellationToken as any)
          })

        fsStub.fake.createDirectory.resolves()
        fsStub.fake.writeFile.callsFake(async () => {
          fsStub.fake.readFile.resolves(
            Buffer.from(JSON.stringify({ access_token: token })),
          )
        })

        const { provider } = createProvider()
        await provider.createSession()

        // Should use verification_uri?user_code= format
        const openedUri = openStub.firstCall.args[0].toString()
        assert.ok(
          openedUri.includes("ABCD-1234"),
          `Expected URI to contain user_code, got: ${openedUri}`,
        )

        await provider.dispose()
      })
    })

    suite("checkAndFireAuthState", () => {
      test("fires event when auth state changes", async () => {
        // Start not logged in
        fsStub.fake.readFile.rejects(new Error("File not found"))

        const { provider } = createProvider()
        const fired = sinon.stub()
        provider.onDidChangeSessions(fired)

        // Call checkAndFireAuthState directly (private, use any cast)
        await (provider as any).checkAndFireAuthState()
        assert.ok(
          !fired.called,
          "should not fire when state unchanged (still logged out)",
        )

        // Now become logged in
        const token = validToken()
        fsStub.fake.readFile.resolves(
          Buffer.from(JSON.stringify({ access_token: token })),
        )
        sinon
          .stub(globalThis, "fetch")
          .resolves(
            mockResponse({ email: "test@example.com", full_name: "Test" }),
          )

        await (provider as any).checkAndFireAuthState()
        assert.ok(
          fired.callCount >= 1,
          "should fire when state changes to logged in",
        )

        await provider.dispose()
      })
    })

    suite("dispose", () => {
      test("clears polling interval", async () => {
        const clock = sinon.useFakeTimers({ shouldAdvanceTime: true })
        const { provider } = createProvider()

        fsStub.fake.readFile.rejects(new Error("File not found"))

        provider.startWatching()

        await clock.tickAsync(3100)
        const callCount = fsStub.fake.readFile.callCount

        await provider.dispose()

        await clock.tickAsync(6000)
        assert.strictEqual(fsStub.fake.readFile.callCount, callCount)

        clock.restore()
      })
    })
  })
})
