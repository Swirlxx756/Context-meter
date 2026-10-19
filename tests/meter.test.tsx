import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const footer = (modes: string[]) => ({ component: 'SessionMode', props: { modes } }) as const

// Stands for the engine's footer: draws the modes it is handed, joined as the engine joins them.
const drawModes = (on: On) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'SessionMode' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.modes.join(' & ')}</Text>
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
    expect(await ui.find({ type: 'Text', text: 'focus & Context 42% · 84k / 200k' })).toBeDefined()
    await ui.unmount()
  }
})

test('before any response the footer shows the window alone', async ($, on) => {
  drawModes(on)

  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', ...footer([]) })
  expect(await ui.find({ type: 'Text', text: 'Context — / 1.0M' })).toBeDefined()
  await ui.unmount()
})
