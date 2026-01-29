import * as assert from "node:assert"
import { isTokenExpired } from "../../cloud/auth"

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
})
