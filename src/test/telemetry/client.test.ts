import * as assert from "node:assert"
import { TelemetryClient } from "../../utils/telemetry/client"

suite("telemetry/client", () => {
  suite("TelemetryClient", () => {
    test("getSessionDuration returns null before init", () => {
      const client = new TelemetryClient()
      assert.strictEqual(client.getSessionDuration(), null)
    })

    test("capture is no-op when not initialized", () => {
      const client = new TelemetryClient()
      // Should not throw
      client.capture("test_event", { foo: "bar" })
    })

    test("shutdown resets state", async () => {
      const client = new TelemetryClient()
      await client.shutdown()
      assert.strictEqual(client.getSessionDuration(), null)
    })
  })
})
