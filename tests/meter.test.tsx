import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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

test('the footer gains the context fill on every surface', async ($, on) => {
  drawModes(on)

  await $.session.measure({
    context: { tokens: 84_000, window: 200_000, percent: 42 },
    rateLimits: [],
    changed: ['context'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-meter', surface, ...footer(['focus']) })
    expect(await ui.find({ type: 'Text', text: 'focus' })).toBeDefined()
    expect((await ui.find({ key: 'meter' }))?.text).toBe('42%')
    await ui.unmount()
  }
})

test('before any response the footer shows a dash', async ($, on) => {
  drawModes(on)

  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...footer([]) })
  expect((await ui.find({ key: 'meter' }))?.text).toBe('—')
  await ui.unmount()
})

const BAND = { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} }

const usage = (input: number, output: number, cacheRead: number, cacheWrite: number) => ({
  model: 'claude-opus-5-5',
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

test('the footer adds turns, speed, tokens and cache hits; a click opens the card above the prompt', async ($, on) => {
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

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...footer([]) })
  expect((await ui.find({ key: 'meter' }))?.text).toBe('200tok/s 20k tok(94.00%) 42%')

  const band = { plugin: 'context-meter', surface: 'desktop', component: 'AbovePrompt', props: BAND } as const
  const closed = await $.ui.mount(band)
  expect(await closed.find({ type: 'Text', text: '会话统计' })).toBeUndefined()
  await closed.unmount()

  // A click on the footer opens the card above the prompt; × closes it.
  await ui.press({ key: 'meter' })
  const card = await $.ui.mount(band)
  for (const text of ['会话统计', '用时与速度', 'Token', '上下文', '6.0s', '4.0s', '2.0s', '19k', '84k (42%)']) {
    expect(await card.find({ type: 'Text', text })).toBeDefined()
  }
  expect((await card.find({ type: 'Svg' }))?.props.alt).toBe('用时与速度')
  await card.press({ key: 'close' })
  expect(await card.find({ type: 'Text', text: '会话统计' })).toBeUndefined()
  await card.unmount()
  await ui.unmount()
})
