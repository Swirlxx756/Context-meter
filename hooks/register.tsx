import { atom, read, update } from 'claude-code'
import type { Register, SessionContextBreakdown, TurnUsage } from 'claude-code'

import type { Fill, Popover, Stats } from '../types'

const fill = atom({ plugin: 'context-meter', key: 'fill' } as const, null)
const stats = atom({ plugin: 'context-meter', key: 'stats' } as const, null)
const popover = atom({ plugin: 'context-meter', key: 'popover' } as const, null)

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

const contextLabel = (current: Fill) => {
  const percent = percentOf(current)
  return percent === undefined ? '—' : `${percent}%`
}

const speed = (s: Stats) => (s.decodeMs > 0 ? `${Math.round((s.outputTokens * 1000) / s.decodeMs)} tok/s` : '— tok/s')

const prompted = (s: Stats) => s.inputTokens + s.cacheRead + s.cacheWrite

const hitRate = (s: Stats) => {
  const total = prompted(s)
  return total > 0 ? `${((s.cacheRead * 100) / total).toFixed(2)}%` : '—'
}

const totalTokens = (s: Stats) => prompted(s) + s.outputTokens

const turnsLabel = (s: Stats) => `${s.turns} 轮·${s.steps} 步 · ${speed(s)}`

const tokensLabel = (s: Stats) => `${compact(totalTokens(s))} tok · 缓存 ${hitRate(s)}`

// Vector icons for the surfaces that draw Svg (desktop, VS Code, mobile); a glyph stands in on the terminal.
// A mid grey reads on light and dark alike, since an Svg is drawn as an image and inherits no text color.
const GREY = '#8b8b8b'
const ACCENT = '#d97757'
const RULE = '─'.repeat(32)

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
const barSvg = (fraction: number) => {
  const w = Math.max(2, Math.min(60, fraction * 60)).toFixed(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="6" viewBox="0 0 60 6"><rect width="60" height="6" rx="3" fill="${GREY}" fill-opacity="0.25"/><rect width="${w}" height="6" rx="3" fill="${ACCENT}"/></svg>`
}

const GLYPH = { gauge: '◷', database: '⛁', ring: '◔' } as const

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

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const current = await read($, fill)
    const totals = await read($, stats)
    const open = await read($, popover)

    if (current === null) {
      return next(e)
    }

    // A tree of our own: the desktop footer draws a hook's tree, not a rewritten `modes`.
    // The terminal's table answers Svg with a stand-in that draws nothing: it gets glyphs instead.
    const resolved = $.ui.resolve(e) as unknown as Elements
    const el: Elements = e.surface === 'terminal' ? { ...resolved, Svg: undefined } : resolved
    const { Box, Text, Button, Svg } = el
    const icon = (name: keyof typeof GLYPH, svg: string) =>
      Svg ? <Svg source={svg} alt={name} width={14} height={14} /> : <Text dimColor>{GLYPH[name]}</Text>
    const toggle = (which: Popover) => () => void update($, popover, now => (now === which ? null : which))
    const close = () => void update($, popover, () => null)
    const modes = e.props.modes.join(' & ')

    let card: unknown = null
    if (open === 'stats' && totals !== null) {
      card = statsCard(el, totals, close)
    } else if (open === 'context') {
      const { context } = await $.session.usage({ breakdown: 'summary' })
      card = contextCard(el, current, context.breakdown, close)
    }

    // Each figure is its own control: a click toggles its floating card. Context sits rightmost.
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {modes !== '' && <Text dimColor>{modes}</Text>}
        {totals !== null && icon('gauge', gaugeSvg(14))}
        {totals !== null && <Button key="stats" plain dimColor label={turnsLabel(totals)} onPress={toggle('stats')} />}
        {totals !== null && icon('database', databaseSvg(14))}
        {totals !== null && <Button key="tokens" plain dimColor label={tokensLabel(totals)} onPress={toggle('stats')} />}
        {icon('ring', ringSvg(14, percentOf(current)))}
        <Button key="context" plain dimColor label={contextLabel(current)} onPress={toggle('context')} />
        {card}
      </Box>
    )
  })
}

// The element constructors a footer drawing uses; Svg exists on the desktop, VS Code and mobile tables.
type Elements = { Box: any; Text: any; Button: any; Svg?: any }

// The floating card: out of the flow, above the footer's right edge, opaque over the transcript.
const floating = (Box: any, children: unknown[]) => (
  <Box
    position="absolute"
    bottom={1}
    right={0}
    width={36}
    flexDirection="column"
    borderStyle="round"
    borderDimColor
    backgroundColor="inverseText"
    paddingX={1}
  >
    {children}
  </Box>
)

const header = ({ Box, Text, Button, Svg }: Elements, svg: string, title: string, close: () => void) => (
  <Box flexDirection="row" alignItems="center" gap={1}>
    {Svg ? <Svg source={svg} alt={title} width={16} height={16} /> : null}
    <Text bold>{title}</Text>
    <Box flexGrow={1} />
    <Button key="close" plain dimColor role="dismiss" label="×" onPress={close} />
  </Box>
)

const rows = ({ Box, Text }: Elements, list: [string, string][]) =>
  list.map(([name, value]) => (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>{name}</Text>
      <Text>{value}</Text>
    </Box>
  ))

const rule = ({ Text }: Elements) => <Text dimColor>{RULE}</Text>

const statsCard = (el: Elements, s: Stats, close: () => void) =>
  floating(el.Box, [
    header(el, gaugeSvg(16), '用时与速度', close),
    ...rows(el, timingRows(s)),
    rule(el),
    ...rows(el, tokenRows(s)),
  ])

const contextCard = (el: Elements, current: Fill, breakdown: SessionContextBreakdown | undefined, close: () => void) => {
  const { Box, Text, Svg } = el
  const head: [string, string][] = [
    ['已用', current.tokens === undefined ? '—' : `${compact(current.tokens)} (${current.percent ?? 0}%)`],
    ['窗口', compact(current.window)],
  ]
  if (breakdown) head.push(['模型', breakdown.model])
  const categories = (breakdown?.categories ?? []).filter(c => c.tokens > 0)
  const whole = breakdown?.rawMaxTokens ?? current.window

  return floating(Box, [
    header(el, ringSvg(16, percentOf(current)), '上下文', close),
    ...rows(el, head),
    ...(categories.length > 0 ? [rule(el)] : []),
    ...categories.map(c => (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Text dimColor>{c.name}</Text>
        <Box flexDirection="row" alignItems="center" gap={1}>
          {Svg ? <Svg source={barSvg(c.tokens / whole)} alt={c.name} width={60} height={6} /> : null}
          <Text>{compact(c.tokens)}</Text>
        </Box>
      </Box>
    )),
  ])
}
