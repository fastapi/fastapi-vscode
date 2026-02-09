import * as assert from "node:assert"
import {
  formatLogEntry,
  getWebviewHtml,
} from "../../../cloud/commands/logsHtml"

suite("cloud/commands/logsHtml", () => {
  suite("formatLogEntry", () => {
    test("formats a log entry with level, timestamp, and message", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "Server started",
        level: "info",
      })
      assert.ok(html.startsWith('<div class="log-line"'))
      assert.ok(html.includes('data-level="info"'))
      assert.ok(html.includes("color:#00cccc"))
      assert.ok(html.includes("Server started"))
      assert.ok(html.includes("2025-01-15T10:30:00.000Z"))
      assert.ok(html.includes('<span class="ts">'))
      assert.ok(html.includes("┃"))
    })

    test("normalizes warn to warning", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "warn",
      })
      assert.ok(html.includes('data-level="warning"'))
    })

    test("defaults to info when level is missing", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "no level",
        level: undefined as any,
      })
      assert.ok(html.includes('data-level="info"'))
    })

    test("uses default color for unknown level", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "trace",
      })
      assert.ok(html.includes('data-level="trace"'))
      assert.ok(html.includes("color:#888"))
    })

    test("lowercases level", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: "ERROR",
      })
      assert.ok(html.includes('data-level="error"'))
    })

    test("escapes HTML in message", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "<script>alert('xss')</script>",
        level: "info",
      })
      assert.ok(html.includes("&lt;script&gt;"))
      assert.ok(!html.includes("<script>alert"))
    })

    test("escapes quotes in level for attribute safety", () => {
      const html = formatLogEntry({
        timestamp: "2025-01-15T10:30:00Z",
        message: "msg",
        level: '"onclick="alert(1)',
      })
      assert.ok(!html.includes('data-level=""onclick'))
      assert.ok(html.includes("&quot;"))
    })

    test("handles invalid timestamp gracefully", () => {
      const html = formatLogEntry({
        timestamp: "not-a-date",
        message: "msg",
        level: "info",
      })
      assert.ok(html.includes("not-a-date"))
    })
  })

  suite("getWebviewHtml", () => {
    test("returns valid HTML with CSP", () => {
      const html = getWebviewHtml()
      assert.ok(html.includes("<!DOCTYPE html>"))
      assert.ok(html.includes("Content-Security-Policy"))
      assert.ok(html.includes("default-src 'none'"))
    })

    test("includes toolbar controls", () => {
      const html = getWebviewHtml()
      assert.ok(html.includes('id="since-filter"'))
      assert.ok(html.includes('id="stream-btn"'))
      assert.ok(html.includes('id="filter-btn"'))
      assert.ok(html.includes('id="clear-btn"'))
      assert.ok(html.includes('id="search-input"'))
    })

    test("includes since options", () => {
      const html = getWebviewHtml()
      assert.ok(html.includes('value="5m"'))
      assert.ok(html.includes('value="1d"'))
    })

    test("includes level filter chips", () => {
      const html = getWebviewHtml()
      for (const level of ["debug", "info", "warning", "error", "critical"]) {
        assert.ok(
          html.includes(`data-level="${level}"`),
          `missing ${level} chip`,
        )
      }
    })

    test("includes webview API script", () => {
      const html = getWebviewHtml()
      assert.ok(html.includes("acquireVsCodeApi"))
    })
  })
})
