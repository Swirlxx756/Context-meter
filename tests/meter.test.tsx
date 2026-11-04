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

// A left press on a figure, as the desktop and terminal report one over its Client.
const click = (ui: { pointer: (e: any) => Promise<void> }, id: string) =>
  ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `segment-${id}` })

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

test('the footer adds turns, speed, tokens and cache hits; each opens its card', async ($, on) => {
  drawModes(on)
  const clock = mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
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

  // Each figure toggles its own card above the row.
  await click(ui, 'stats')
  expect(((await ui.find({ key: 'segment-stats' }))?.props.props as { isActive: boolean }).isActive).toBe(true)
  for (const text of ['用时与速度', '6.0s', '4.0s', '2.0s']) {
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
  }
  await click(ui, 'tokens')
  expect(await ui.find({ type: 'Text', text: '用时与速度' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '19k' })).toBeDefined()
  await click(ui, 'tokens')
  expect(await ui.find({ type: 'Text', text: '19k' })).toBeUndefined()
  await click(ui, 'context')
  expect(await ui.find({ type: 'Text', text: '84k (42%)' })).toBeDefined()
  await ui.press({ key: 'close' })
  expect(await ui.find({ type: 'Text', text: '84k (42%)' })).toBeUndefined()
  await ui.unmount()
})
