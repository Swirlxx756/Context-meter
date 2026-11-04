import { atom, read, update } from 'claude-code'
import type { ContextCategory, Register, SessionContextBreakdown, TurnUsage } from 'claude-code'

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

// `135tok/s 18.2M(98.71%) 28%`: before any response the context figure alone.
const footerLabel = (current: Fill, s: Stats | null) => {
  const percent = percentOf(current)
  const context = percent === undefined ? '—' : `${percent}%`
  if (s === null || s.steps === 0) return context
  const rate = s.decodeMs > 0 ? `${Math.round((s.outputTokens * 1000) / s.decodeMs)}tok/s ` : ''
  return `${rate}${compact(totalTokens(s))}(${hitRate(s)}) ${context}`
}

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

  // The pointer over a figure's Client shows its card; leaving it hides the card again.
  on('ui.message', async ($, e, next) => {
    const match = /^segment-(stats|tokens|context|all)$/.exec(e.element)
    const hover = (e.data as { hover?: boolean } | null)?.hover
    if (match && hover !== undefined) {
      const which = match[1] as Section
      await update($, opened, now => (hover ? which : now === which ? null : now))
    }

    return next(e)
  })

  // The desktop draws no hint line, and the band above the prompt comes in a grey panel of its
  // own: so a short figure sits in the footer, beside the mode labels, and the band holds the
  // cards only while the pointer is over that figure. The footer's slot is short, cut with an
  // ellipsis: hence one compact line.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const current = await read($, fill)

    if (current === null) {
      return next(e)
    }

    const { Box, Text, Client } = $.ui.resolve(e) as unknown as Elements
    const modes = e.props.modes.join(' & ')
    const open = await read($, opened)

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {modes !== '' && <Text dimColor>{modes}</Text>}
        <Client key="segment-all" module="./segment.tsx" props={{ label: footerLabel(current, await read($, stats)), isActive: open === 'all' }} />
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, fill)

    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    const el = elementsFor($, e)
    const { Box } = el
    const totals = await read($, stats)
    const open = await read($, opened)
    const segments = segmentsOf(current, totals)
    // Where the footer holds the figure (terminal, desktop) the band shows the cards while it is
    // hovered, and nothing else; elsewhere (VS Code, mobile) the row stays here, opened on a click.
    const hasFooter = e.surface === 'terminal' || e.surface === 'desktop'
    const toggle = (which: Section) => () => void update($, opened, now => (now === which ? null : which))
    const close = () => void update($, opened, () => null)
    const bodyOf = async (segment: Segment): Promise<unknown[]> => {
      if (segment.id !== 'context') return rows(el, segment.id === 'stats' ? timingRows(totals!) : tokenRows(totals!))
      const { context } = await $.session.usage({ breakdown: 'summary' })
      return contextRows(el, current, context.breakdown)
    }

    if (hasFooter) {
      if (open !== 'all') return next(e)
      // Every card side by side, at the right, under which the footer's figure sits.
      const cards: unknown[] = []
      for (const segment of segments) cards.push(card(el, segment.svg, segment.title, await bodyOf(segment)))
      return (
        <Box flexDirection="row" justifyContent="flex-end" flexWrap="wrap" columnGap={2} rowGap={1}>
          {cards}
        </Box>
      )
    }

    const segment = segments.find(s => s.id === open)
    if (segment === undefined) {
      return <Box flexDirection="row" justifyContent="center">{row(el, segments, open, toggle)}</Box>
    }

    return (
      <Box flexDirection="column" alignItems="center">
        {card(el, segment.svg, segment.title, await bodyOf(segment), close)}
        {row(el, segments, open, toggle)}
      </Box>
    )
  })
}

type Segment = { id: Section; glyph: string; svg: string; title: string; label: string }

const segmentsOf = (current: Fill, totals: Stats | null): Segment[] => {
  const segments: Segment[] = []
  if (totals !== null && totals.steps > 0) {
    segments.push({ id: 'stats', glyph: '◷', svg: gaugeSvg(14), title: '用时与速度', label: turnsLabel(totals) })
    segments.push({ id: 'tokens', glyph: '⛁', svg: databaseSvg(14), title: 'Token', label: tokensLabel(totals) })
  }
  segments.push({ id: 'context', glyph: '◔', svg: ringSvg(14, percentOf(current)), title: '上下文', label: contextLabel(current) })
  return segments
}

// The terminal's table answers Svg with a stand-in that draws nothing: it gets glyphs instead.
const elementsFor = ($: { ui: { resolve: (e: never) => unknown } }, e: { surface: string }): Elements => {
  const resolved = $.ui.resolve(e as never) as Elements
  return e.surface === 'terminal' ? { ...resolved, Svg: undefined } : resolved
}

// The figures, each led by its icon, as Buttons pressed to open their card (VS Code, mobile).
const row = ({ Box, Text, Button, Svg }: Elements, segments: Segment[], open: Section | null, toggle: (which: Section) => () => void) => (
  <Box flexDirection="row" alignItems="center" columnGap={3}>
    {segments.map(s => (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {Svg ? <Svg source={s.svg} alt={s.title} width={14} height={14} /> : <Text dimColor>{s.glyph}</Text>}
        <Button key={s.id} plain dimColor={open !== s.id} label={s.label} onPress={toggle(s.id)} />
      </Box>
    ))}
  </Box>
)

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
