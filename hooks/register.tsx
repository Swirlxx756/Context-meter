import { atom, read, update } from 'claude-code'
import type { ContextCategory, EngineInterface, Register, SessionContextBreakdown, TurnUsage } from 'claude-code'

import type { Fill, Section, Stats } from '../types'

const fill = atom({ plugin: 'context-meter', key: 'fill' } as const, null)
const stats = atom({ plugin: 'context-meter', key: 'stats' } as const, null)
const opened = atom({ plugin: 'context-meter', key: 'opened' } as const, null)

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

const percentOf = (current: Fill) => (current.tokens === undefined ? undefined : (current.percent ?? 0))

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

const totalTokens = (s: Stats) => prompted(s) + s.outputTokens

const turnsLabel = (s: Stats) => `${s.turns} 轮·${s.steps} 步 · ${speed(s)}`

const tokensLabel = (s: Stats) => `${compact(totalTokens(s))} tok · 缓存命中 ${hitRate(s)}`

// Vector icons for the surfaces that draw Svg (desktop, VS Code, mobile); a glyph stands in on the terminal.
// A mid grey reads on light and dark alike, since an Svg is drawn as an image and inherits no text color.
const GREY = '#8b8b8b'
const ACCENT = '#d97757'

const gaugeSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${GREY}" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 11.5a5.5 5.5 0 1 1 11 0"/><path d="M8 11.5l2.6-3.4"/><circle cx="8" cy="11.5" r="0.9" fill="${GREY}" stroke="none"/></svg>`

const databaseSvg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${GREY}" stroke-width="1.4"><ellipse cx="8" cy="3.8" rx="5" ry="1.9"/><path d="M3 3.8v8.4c0 1 2.2 1.9 5 1.9s5-.9 5-1.9V3.8"/><path d="M3 8c0 1 2.2 1.9 5 1.9S13 9 13 8"/></svg>`

const ringSvg = (size: number, percent: number | undefined) => {
  const r = 6
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, percent ?? 0))
  const color = p >= 80 ? '#e5484d' : ACCENT
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke-width="2.2"><circle cx="8" cy="8" r="${r}" stroke="${GREY}" stroke-opacity="0.35"/><circle cx="8" cy="8" r="${r}" stroke="${color}" stroke-linecap="round" stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/></svg>`
}

// A bar for one category's share of the window, in the context card.
const barSvg = (fraction: number, color: string) => {
  const w = Math.max(2, Math.min(60, fraction * 60)).toFixed(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="6" viewBox="0 0 60 6"><rect width="60" height="6" rx="3" fill="${GREY}" fill-opacity="0.25"/><rect width="${w}" height="6" rx="3" fill="${color}"/></svg>`
}

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
  ['总计', compact(totalTokens(s))],
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

// Each session's totals are kept on this machine under its id, so a resumed session goes on from
// where it stopped; a /clear hands them on to the session it starts (`CARRY`), and they go on there.
const KEY = 'stats:'
const CARRY = 'carry'
const KEPT = 200

const isStats = (v: unknown): v is Stats =>
  typeof v === 'object' && v !== null && typeof (v as Stats).steps === 'number' && typeof (v as Stats).llmMs === 'number'

const keep = async ($: EngineInterface, value: Stats) => {
  const key = KEY + (await $.session.id())
  const keys = await $.store.keys()
  if (!keys.includes(key)) {
    // The oldest sessions' totals go first, so the store stays small.
    const ours = keys.filter(k => k.startsWith(KEY))
    for (const old of ours.slice(0, Math.max(0, ours.length - KEPT + 1))) await $.store.delete(old)
  }
  await $.store.set(key, value)
}

// Adds to the session's totals and keeps them. A /clear may leave the session's state empty with
// no session.start after it: the totals it handed on are taken up again then.
const bump = async ($: EngineInterface, add: (s: Stats) => Stats) => {
  if ((await read($, stats)) === null) {
    const carried = await $.store.get(CARRY)
    const base = isStats(carried) ? carried : fresh(0)
    await update($, stats, s => s ?? base)
  }
  await update($, stats, s => (s ? add(s) : s))
  const now = await read($, stats)
  if (now) await keep($, now)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { context, startedAt } = await $.session.usage()
    await update($, fill, (): Fill => context)
    // A resumed session's totals come back from the store; a reload keeps those it has; a new
    // session starts at zero.
    const stored = await $.store.get(KEY + (await $.session.id()))
    await update($, stats, (s): Stats => (isStats(stored) ? stored : (s ?? fresh(startedAt))))

    return result
  })

  // /clear starts another session in the same process: the totals go on with it.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const now = await read($, stats)
      if (now) await $.store.set(CARRY, now)
    }

    return next(e)
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
      await bump($, s => ({ ...s, turns: s.turns + 1 }))
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

    await bump($, s => {
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
      await bump($, s => ({ ...s, toolMs: s.toolMs + (endedAt - startedAt) }))
    }
  })

  // The pointer over a figure's Client shows its card; leaving it hides the card again.
  on('ui.message', async ($, e, next) => {
    const match = /^segment-(stats|tokens|context)$/.exec(e.element)
    const hover = (e.data as { hover?: boolean } | null)?.hover
    if (match && hover !== undefined) {
      const which = match[1] as Section
      await update($, opened, now => (hover ? which : now === which ? null : now))
    }

    return next(e)
  })

  // One row above the prompt, centered (the footer's slot is short and cut with an ellipsis): the
  // figures, each one showing its card right above itself while the pointer is over it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, fill)
    const totals = await read($, stats)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    // The terminal's table answers Svg with a stand-in that draws nothing: it gets glyphs instead.
    const resolved = $.ui.resolve(e) as unknown as Elements
    const el: Elements = e.surface === 'terminal' ? { ...resolved, Svg: undefined } : resolved
    const { Box, Text, Button, Svg, Client } = el
    // A Client draws plain text and hears the pointer; where none is drawn (VS Code, mobile), a Button.
    const hasClient = e.surface === 'terminal' || e.surface === 'desktop'
    const open = await read($, opened)
    const toggle = (which: Section) => () => void update($, opened, now => (now === which ? null : which))
    const close = () => void update($, opened, () => null)
    const hasTotals = totals !== null && totals.steps > 0

    const segments: { id: Section; glyph: string; svg: string; title: string; label: string }[] = []
    if (hasTotals) {
      segments.push({ id: 'stats', glyph: '◷', svg: gaugeSvg(14), title: '用时与速度', label: turnsLabel(totals) })
      segments.push({ id: 'tokens', glyph: '⛁', svg: databaseSvg(14), title: 'Token', label: tokensLabel(totals) })
    }
    segments.push({ id: 'context', glyph: '◔', svg: ringSvg(14, percentOf(current)), title: '上下文', label: contextLabel(current) })

    // The open one draws at full strength, the rest dim: the row's selection.
    const capsule = (
      <Box flexDirection="row" alignItems="center" alignSelf="center" columnGap={3}>
        {segments.map(s => (
          <Box flexDirection="row" alignItems="center" gap={1}>
            {Svg ? <Svg source={s.svg} alt={s.title} width={14} height={14} /> : <Text dimColor>{s.glyph}</Text>}
            {hasClient ? (
              <Client key={`segment-${s.id}`} module="./segment.tsx" props={{ label: s.label, isActive: open === s.id }} />
            ) : (
              <Button key={s.id} plain dimColor={open !== s.id} label={s.label} onPress={toggle(s.id)} />
            )}
          </Box>
        ))}
      </Box>
    )

    const index = segments.findIndex(s => s.id === open)
    if (index < 0) {
      return (
        <Box flexDirection="row" justifyContent="center">
          {capsule}
        </Box>
      )
    }

    const segment = segments[index]!
    let body: unknown[]
    if (segment.id === 'context') {
      const { context } = await $.session.usage({ breakdown: 'summary' })
      body = contextRows(el, current, context.breakdown)
    } else {
      body = rows(el, segment.id === 'stats' ? timingRows(totals!) : tokenRows(totals!))
    }

    // Over its own figure: the first card flush with the capsule's left edge, the last with its
    // right, a middle one centered, the column as wide as the wider of the two.
    const align = index === 0 && segments.length > 1 ? 'flex-start' : index === segments.length - 1 && segments.length > 1 ? 'flex-end' : 'center'

    return (
      <Box flexDirection="row" justifyContent="center">
        <Box flexDirection="column">
          <Box flexDirection="row" justifyContent={align}>
            {card(el, segment.svg, segment.title, body, hasClient ? undefined : close)}
          </Box>
          {capsule}
        </Box>
      </Box>
    )
  })
}

// One figure's card: a rounded panel, the icon and title over its rows; × where it opened on a click.
const card = ({ Box, Text, Button, Svg }: Elements, svg: string, title: string, body: unknown[], close?: () => void) => (
  <Box flexDirection="column" width={40} borderStyle="round" borderDimColor paddingX={1}>
    <Box flexDirection="row" alignItems="center" gap={1}>
      {Svg ? <Svg source={svg} alt={title} width={16} height={16} /> : null}
      <Text weight="medium">{title}</Text>
      <Box flexGrow={1} />
      {close ? <Button key="close" plain dimColor role="dismiss" label="×" onPress={close} /> : null}
    </Box>
    {body}
  </Box>
)

// The element constructors a drawing uses; Svg exists on the desktop, VS Code and mobile tables.
type Elements = { Box: any; Text: any; Button: any; Svg?: any; Client?: any }

const rows = ({ Box, Text }: Elements, list: [string, string][]) =>
  list.map(([name, value]) => (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>{name}</Text>
      <Text tabular>{value}</Text>
    </Box>
  ))

// The window in four: what /context lists, folded by its row names (the engine names no groups).
const GROUPS = [
  { name: '系统提示词', color: ACCENT },
  { name: '工具定义', color: '#6a9bcc' },
  { name: '对话消息', color: '#788c5d' },
  { name: '剩余空间', color: GREY },
] as const

const groupOf = (c: ContextCategory): number | undefined => {
  if (c.kind === 'free') return 3
  if (c.kind !== 'used') return undefined // the compaction buffer, and deferred tools outside the window
  if (/message/i.test(c.name)) return 2
  if (/tool|agent|skill|command/i.test(c.name)) return 1
  return 0 // the system prompt itself, memory files
}

const contextRows = (el: Elements, current: Fill, breakdown: SessionContextBreakdown | undefined) => {
  const { Box, Text, Svg } = el
  const head: [string, string][] = [
    ['已用', current.tokens === undefined ? '—' : `${compact(current.tokens)} (${current.percent ?? 0}%)`],
    ['窗口', compact(current.window)],
  ]
  if (!breakdown) return rows(el, head)

  const whole = breakdown.rawMaxTokens
  const sums = GROUPS.map(() => 0)
  for (const c of breakdown.categories) {
    const g = groupOf(c)
    if (g !== undefined) sums[g] = (sums[g] ?? 0) + c.tokens
  }

  return [
    ...rows(el, head),
    ...GROUPS.map((g, i) => {
      const tokens = sums[i] ?? 0
      const share = whole > 0 ? tokens / whole : 0
      return (
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor>{g.name}</Text>
          <Box flexDirection="row" alignItems="center" gap={1}>
            {Svg ? <Svg source={barSvg(share, g.color)} alt={g.name} width={60} height={6} /> : null}
            <Text tabular>{`${compact(tokens)} · ${(share * 100).toFixed(1)}%`}</Text>
          </Box>
        </Box>
      )
    }),
  ]
}
