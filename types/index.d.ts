export type Fill = { tokens?: number; window: number; percent?: number }

/** Main-loop totals since the session began (or since the last /clear). */
export type Stats = {
  /** `$.session.usage().startedAt` these totals count from; a change means /clear. */
  startedAt: number
  turns: number
  steps: number
  /** Wall time of model requests, request sent to response whole. */
  llmMs: number
  /** Wall time of tool calls (a permission prompt's wait included). */
  toolMs: number
  /** Sum and count of time to the first content chunk of each request. */
  ttftMs: number
  ttftCount: number
  /** Output tokens and the time they streamed over (first chunk to end). */
  outputTokens: number
  decodeMs: number
  /** Prompt tokens: fresh input, cache reads, cache writes. */
  inputTokens: number
  cacheRead: number
  cacheWrite: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-meter': { fill: Fill | null; stats: Stats | null; /** Whether the stats card is open above the prompt. */ isOpen: boolean }
  }
}
