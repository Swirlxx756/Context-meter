import { atom, read, update } from 'claude-code'
import type { Register, TurnUsage } from 'claude-code'

import type { Fill, Stats } from '../types'

const fill = atom({ plugin: 'context-meter', key: 'fill' } as const, null)
const stats = atom({ plugin: 'context-meter', key: 'stats' } as const, null)

const fresh = (startedAt: number): Stats => ({
  startedAt,
  turns: 0,
  steps: 0,
  llmMs: 0,
  toolMs: 0,
  ttftMs: 0,
  ttftCount: 0,
  outputTokens: 0,
  decodeMs: 0,
  inputTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
})

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const duration = (ms: number) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${s % 60}s`
  return `${Math.floor(m / 60)}h${m % 60}m`
}

const contextLabel = (current: Fill) =>
  current.tokens === undefined
    ? `Context — / ${compact(current.window)}`
    : `Context ${current.percent ?? 0}% · ${compact(current.tokens)} / ${compact(current.window)}`

const speed = (s: Stats) => (s.decodeMs > 0 ? `${Math.round((s.outputTokens * 1000) / s.decodeMs)} tok/s` : '— tok/s')

const prompted = (s: Stats) => s.inputTokens + s.cacheRead + s.cacheWrite

const hitRate = (s: Stats) => {
  const total = prompted(s)
  return total > 0 ? `${((s.cacheRead * 100) / total).toFixed(2)}%` : '—'
}

const statsLabel = (s: Stats) =>
  `${s.turns} 轮·${s.steps} 步 · ${speed(s)} · ${compact(prompted(s) + s.outputTokens)} tok · 缓存命中 ${hitRate(s)}`

const STATS_PANE = { id: 'context-meter-stats', title: '用时与速度' }
const CONTEXT_PANE = { id: 'context-meter-context', title: '上下文' }

const timingRows = (s: Stats): [string, string][] => [
  ['轮次', `${s.turns}`],
  ['步数', `${s.steps}`],
  ['LLM 用时', duration(s.llmMs)],
  ['工具用时', duration(s.toolMs)],
  ['每步平均', s.steps > 0 ? duration(s.llmMs / s.steps) : '—'],
  ['首 token 平均', s.ttftCount > 0 ? duration(s.ttftMs / s.ttftCount) : '—'],
  ['解码速度', speed(s)],
]

const tokenRows = (s: Stats): [string, string][] => [
  ['总计', compact(prompted(s) + s.outputTokens)],
  ['输入', compact(s.inputTokens)],
  ['缓存读取', compact(s.cacheRead)],
  ['缓存写入', compact(s.cacheWrite)],
  ['输出', compact(s.outputTokens)],
  ['缓存命中', hitRate(s)],
]

const addUsage = (s: Stats, u: TurnUsage | null | undefined): Stats =>
  u
    ? {
        ...s,
        outputTokens: s.outputTokens + u.output_tokens,
        inputTokens: s.inputTokens + u.input_tokens,
        cacheRead: s.cacheRead + u.cache_read_input_tokens,
        cacheWrite: s.cacheWrite + u.cache_creation_input_tokens,
      }
    : s

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { context, startedAt } = await $.session.usage()
    await update($, fill, (): Fill => context)
    // A reload keeps the totals; /clear moves startedAt and starts them over.
    await update($, stats, (s): Stats => (s && s.startedAt === startedAt ? s : fresh(startedAt)))

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, fill, (): Fill => e.context)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await update($, stats, s => (s ? { ...s, turns: s.turns + 1 } : s))
    }

    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    const sentAt = await $.clock.now()
    let firstAt: number | undefined
    const stream = next(e)
    let step = await stream.next()
    while (!step.done) {
      // The envelope and block markers are 'engine' chunks; the first content marks the first token.
      if (firstAt === undefined && step.value.kind !== 'engine') {
        firstAt = await $.clock.now()
      }
      yield step.value
      step = await stream.next()
    }
    const response = step.value
    const endedAt = await $.clock.now()

    await update($, stats, s => {
      if (!s) return s
      const timed: Stats = {
        ...s,
        steps: s.steps + 1,
        llmMs: s.llmMs + (endedAt - sentAt),
        ...(firstAt !== undefined && response.usage
          ? {
              ttftMs: s.ttftMs + (firstAt - sentAt),
              ttftCount: s.ttftCount + 1,
              decodeMs: s.decodeMs + (endedAt - firstAt),
            }
          : {}),
      }
      return addUsage(timed, response.usage)
    })

    return response
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }

    const startedAt = await $.clock.now()
    try {
      return await next(e)
    } finally {
      const endedAt = await $.clock.now()
      await update($, stats, s => (s ? { ...s, toolMs: s.toolMs + (endedAt - startedAt) } : s))
    }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const current = await read($, fill)
    const totals = await read($, stats)

    if (current === null) {
      return next(e)
    }

    // A tree of our own: the desktop footer draws a hook's tree, not a rewritten `modes`.
    const { Box, Text, Button } = $.ui.resolve(e)
    const modes = e.props.modes.join(' & ')

    // Each figure is its own control: a click opens the pane that details it. Context sits rightmost.
    return (
      <Box flexDirection="row">
        {modes !== '' && <Text dimColor>{`${modes} & `}</Text>}
        {totals !== null && (
          <Button key="stats" plain dimColor label={statsLabel(totals)} onPress={() => void $.ui.open(STATS_PANE)} />
        )}
        {totals !== null && <Text dimColor>{' · '}</Text>}
        <Button key="context" plain dimColor label={contextLabel(current)} onPress={() => void $.ui.open(CONTEXT_PANE)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: 'context-meter-stats' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const totals = await read($, stats)

    if (totals === null) {
      return <Text dimColor>还没有数据。</Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
        {section(Box, Text, "用时与速度", timingRows(totals))}
        {section(Box, Text, "Token", tokenRows(totals))}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: 'context-meter-context' }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current = await read($, fill)
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const window = current ?? context
    const head: [string, string][] = [
      ['已用', window.tokens === undefined ? '—' : `${compact(window.tokens)} (${window.percent ?? 0}%)`],
      ['窗口', compact(window.window)],
    ]
    const breakdown = context.breakdown
    const categories: [string, string][] = (breakdown?.categories ?? [])
      .filter(c => c.tokens > 0)
      .map(c => [c.name, `${compact(c.tokens)} · ${((c.tokens * 100) / breakdown!.rawMaxTokens).toFixed(1)}%`])

    return (
      <Box flexDirection="column" gap={1}>
        {section(Box, Text, "上下文", breakdown ? [...head, ['模型', breakdown.model]] : head)}
        {categories.length > 0 && section(Box, Text, '分类', categories)}
      </Box>
    )
  })
}

// A titled list of name/value rows, in the drawing surface's own elements.
const section = (Box: any, Text: any, title: string, rows: [string, string][]) => (
  <Box flexDirection="column">
    <Text bold>{title}</Text>
    {rows.map(([name, value]) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>{name}</Text>
        <Text>{value}</Text>
      </Box>
    ))}
  </Box>
)
