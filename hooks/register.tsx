import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Fill } from '../types'

const fill = atom({ plugin: 'context-meter', key: 'fill' } as const, null)

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const label = (current: Fill) =>
  current.tokens === undefined
    ? `Context — / ${compact(current.window)}`
    : `Context ${current.percent ?? 0}% · ${compact(current.tokens)} / ${compact(current.window)}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { context } = await $.session.usage()
    await update($, fill, (): Fill => context)

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, fill, (): Fill => e.context)
    }

    return next(e)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const current = await read($, fill)

    if (current === null) {
      return next(e)
    }

    // A tree of our own: the desktop footer draws a hook's tree, not a rewritten `modes`.
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>{[...e.props.modes, label(current)].join(' & ')}</Text>
  })
}
