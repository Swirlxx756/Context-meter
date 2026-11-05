import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} }
const above = { component: 'AbovePrompt', props: BAND } as const

// Stands for the engine's footer: draws the modes it is handed, joined as the engine joins them.
const drawModes = (on: On) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.modes.join(' & ')}</Text>
  })
  // And for the empty band above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
}

test('the row above the prompt shows the context fill on every surface', async ($, on) => {
  drawModes(on)

  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...above })
    expect(await label(ui, 'context')).toBe('Context 42% · 84k / 200k')
    if (surface === 'desktop') {
      expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('上下文')
    } else {
      expect(await ui.find({ type: 'Text', text: '◔' })).toBeDefined()
    }
    await ui.unmount()
  }
})

test('before any response the row shows a dash', async ($, on) => {
  drawModes(on)

  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...above })
  expect(await label(ui, 'context')).toBe('Context — / 1.0M')
  expect(await ui.find({ key: 'segment-stats' })).toBeUndefined()
  await ui.unmount()
})

// The pointer entering and leaving a figure, as the desktop and terminal report it over its Client.
const enter = (ui: { pointer: (e: any) => Promise<void> }, id: string) =>
  ui.pointer({ type: 'enter', x: 1, y: 0, in: `segment-${id}` })
const leave = (ui: { pointer: (e: any) => Promise<void> }, id: string) =>
  ui.pointer({ type: 'leave', x: 1, y: 0, in: `segment-${id}` })

// What a figure's Client is handed to draw.
const label = async (ui: { find: (q: any) => Promise<any> }, id: string) =>
  ((await ui.find({ key: `segment-${id}` }))?.props.props as { label: string } | undefined)?.label

const usage = (input: number, output: number, cacheRead: number, cacheWrite: number) => ({
  model: 'claude-opus-5-5',
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

test('the footer adds turns, speed, tokens and cache hits; each shows its card on hover', async ($, on) => {
  drawModes(on)
  const clock = mock.clock(on)
  mock.store(on)
  on('session.id', () => ({ value: 's1' }))
  const category = (name: string, tokens: number, kind: string) => ({ name, tokens, kind, color: 'text', isDeferred: kind === 'deferred' })
  const breakdown = {
    rawMaxTokens: 200_000,
    model: 'claude-opus-5-5',
    categories: [
      category('System prompt', 3_000, 'used'),
      category('System tools', 12_000, 'used'),
      category('MCP tools', 8_000, 'used'),
      category('Memory files', 1_000, 'used'),
      category('Messages', 60_000, 'used'),
      category('Free space', 83_000, 'free'),
      category('Autocompact buffer', 33_000, 'buffer'),
      category('MCP tools (deferred)', 9_000, 'deferred'),
    ],
  }
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, breakdown }, rateLimits: [] } }) as any)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  // Stands for the model: the first token 2 s after the request, 200 output tokens over 1 s more.
  on('turn.step', async function* (_, e) {
    await clock.set(clock.now() + 2000)
    yield { kind: 'text', index: 0, text: 'hi' } as const
    await clock.set(clock.now() + 1000)
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'hi',
      toolUses: [],
      stopReason: 'end_turn',
      usage: usage(100, 200, 9_400, 500),
    } as const
  })
  on('tool.call', async () => {
    await clock.set(clock.now() + 4000)
    return { result: {} }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })
  await $.turn.start({ text: 'go', turnId: 't1' })
  for (const index of [0, 1]) {
    for await (const _ of $.turn.step({ turnId: 't1', index, model: 'opus', messageCount: 1 })) {
      // drain
    }
  }
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...above })
  expect(await label(ui, 'stats')).toBe('1 轮·2 步 · 200 tok/s')
  expect(await label(ui, 'tokens')).toBe('20k tok · 缓存命中 94.00%')
  expect(await label(ui, 'context')).toBe('Context 42% · 84k / 200k')
  expect(await ui.find({ type: 'Text', text: '用时与速度' })).toBeUndefined()

  // The pointer over a figure shows its card above the row, with no × to press; leaving hides it.
  await enter(ui, 'stats')
  expect(((await ui.find({ key: 'segment-stats' }))?.props.props as { isActive: boolean }).isActive).toBe(true)
  for (const text of ['用时与速度', '6.0s', '4.0s', '2.0s']) {
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
  }
  expect(await ui.find({ key: 'close' })).toBeUndefined()
  // Moving straight onto the next figure: its enter can come before the last one's leave.
  await enter(ui, 'tokens')
  await leave(ui, 'stats')
  expect(await ui.find({ type: 'Text', text: '用时与速度' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '19k' })).toBeDefined()
  await leave(ui, 'tokens')
  expect(await ui.find({ type: 'Text', text: '19k' })).toBeUndefined()
  await enter(ui, 'context')
  expect(await ui.find({ type: 'Text', text: '84k (42%)' })).toBeDefined()
  // The window in four: system prompt and memory, tool definitions, messages, and what is left.
  for (const text of ['系统提示词', '4k · 2.0%', '工具定义', '20k · 10.0%', '对话消息', '60k · 30.0%', '剩余空间', '83k · 41.5%']) {
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
  }
  await leave(ui, 'context')
  expect(await ui.find({ type: 'Text', text: '84k (42%)' })).toBeUndefined()
  await ui.unmount()
})

// A session's totals as an earlier run of it kept them.
const kept = {
  startedAt: 0, turns: 3, steps: 7, llmMs: 60_000, toolMs: 30_000, ttftMs: 14_000, ttftCount: 7,
  outputTokens: 7_000, decodeMs: 35_000, inputTokens: 1_000, cacheRead: 90_000, cacheWrite: 9_000,
}

test('a resumed session goes on from the totals it had', async ($, on) => {
  drawModes(on)
  mock.store(on, { 'stats:s1': kept })
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { tokens: 84_000, window: 200_000, percent: 42 }, rateLimits: [], changed: ['context'] })
  await $.turn.start({ text: 'go', turnId: 't1' })

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...above })
  expect(await label(ui, 'stats')).toBe('4 轮·7 步 · 200 tok/s')
  expect(await label(ui, 'tokens')).toBe('107k tok · 缓存命中 90.00%')
  await ui.unmount()
})

test('a /clear hands the totals on to the session it starts', async ($, on) => {
  drawModes(on)
  mock.store(on, { 'stats:s1': kept })
  let id = 's1'
  on('session.id', () => ({ value: id }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: id }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.end({ reason: 'clear' } as any)
  id = 's2'
  await $.turn.start({ text: 'go', turnId: 't1' })

  await $.session.measure({ context: { tokens: 84_000, window: 200_000, percent: 42 }, rateLimits: [], changed: ['context'] })
  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...above })
  expect(await label(ui, 'stats')).toBe('4 轮·7 步 · 200 tok/s')
  await ui.unmount()
})

test('after a /clear that left no state, counting picks up the totals handed on', async ($, on) => {
  drawModes(on)
  mock.store(on, { carry: kept })
  on('session.id', () => ({ value: 's2' }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))

  // No session.start after a /clear: the first turn of the new session finds the state empty.
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.session.measure({ context: { tokens: 84_000, window: 200_000, percent: 42 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...above })
  expect(await label(ui, 'stats')).toBe('4 轮·7 步 · 200 tok/s')
  await ui.unmount()
})
