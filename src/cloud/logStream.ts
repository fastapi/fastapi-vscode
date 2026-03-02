export interface AppLogEntry {
  timestamp: string
  message: string
  level: string
}

export class StreamLogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StreamLogError"
  }
}

const MESSAGE_LEVEL_RE = /^\s*(debug|info|warning|warn|error|critical|fatal)\b/i

export function normalizeLevel(level: string, message?: string): string {
  let resolved = level
  if (resolved === "unknown" && message) {
    const match = message.match(MESSAGE_LEVEL_RE)
    if (match) resolved = match[1].toLowerCase()
  }
  if (resolved === "warn") return "warning"
  if (resolved === "fatal") return "critical"
  return resolved
}

export async function* streamLogEntries(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AppLogEntry> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        let data: Record<string, unknown>
        try {
          data = JSON.parse(line)
        } catch {
          continue
        }
        if (data.type === "heartbeat") continue
        if (data.type === "error") {
          throw new StreamLogError(
            (data.message as string) ?? "Log stream error",
          )
        }
        if (data.timestamp && data.message && data.level) {
          yield data as unknown as AppLogEntry
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
