import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} }
const above = { component: 'AbovePrompt', props: BAND } as const
const footer = (modes: string[]) => ({ component: 'SessionMode', props: { modes } }) as const

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

test('the footer shows the context fill beside the modes on every surface', async ($, on) => {
  drawModes(on)

  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...footer(['focus']) })
    expect(await ui.find({ type: 'Text', text: 'focus' })).toBeDefined()
    expect(await label(ui, 'all')).toBe('42%')
    await ui.unmount()
  }
})

test('before any response the footer shows a dash', async ($, on) => {
  drawModes(on)

  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...footer([]) })
  expect(await label(ui, 'all')).toBe('—')
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

test('the footer adds turns, speed, tokens and cache hits; the band shows every card while it is hovered', async ($, on) => {
  drawModes(on)
  const clock = mock.clock(on)
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

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...footer([]) })
  const band = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...above })
  expect(await label(ui, 'all')).toBe('200tok/s 20k(94.00%) 42%')
  expect(await band.find({ type: 'Text', text: '用时与速度' })).toBeUndefined()

  // The pointer over the footer's figure shows every card in the band, with no × to press.
  await enter(ui, 'all')
  expect(((await ui.find({ key: 'segment-all' }))?.props.props as { isActive: boolean }).isActive).toBe(true)
  for (const text of ['用时与速度', '6.0s', '4.0s', '2.0s', 'Token', '19k', '上下文', '84k (42%)']) {
    expect(await band.find({ type: 'Text', text })).toBeDefined()
  }
  expect(await band.find({ key: 'close' })).toBeUndefined()
  // The window in four: system prompt and memory, tool definitions, messages, and what is left.
  for (const text of ['系统提示词', '4k · 2.0%', '工具定义', '20k · 10.0%', '对话消息', '60k · 30.0%', '剩余空间', '83k · 41.5%']) {
    expect(await band.find({ type: 'Text', text })).toBeDefined()
  }
  // Leaving it hides them all.
  await leave(ui, 'all')
  expect(await band.find({ type: 'Text', text: '用时与速度' })).toBeUndefined()
  await band.unmount()
  await ui.unmount()
})

test('where there is no footer figure, the row above the prompt opens a card on a click', async ($, on) => {
  drawModes(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))

  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })

  const band = await $.ui.mount({ plugin: 'context-meter', surface: 'vscode', ...above })
  expect((await band.find({ key: 'context' }))?.text).toBe('Context 42% · 84k / 200k')
  await band.press({ key: 'context' })
  expect(await band.find({ type: 'Text', text: '84k (42%)' })).toBeDefined()
  await band.press({ key: 'close' })
  expect(await band.find({ type: 'Text', text: '84k (42%)' })).toBeUndefined()
  await band.unmount()
})
