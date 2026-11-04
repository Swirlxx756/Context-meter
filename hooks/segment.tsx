import type { ClientModule } from 'claude-code'

// One figure of the row, drawn as plain text (a Button would bring the desktop's native chip).
// The pointer entering it posts `{ hover: true }` and leaving it `{ hover: false }`: the hooks
// module shows the figure's card above the row for as long as the pointer stays.
type Props = { label: string; isActive: boolean }

const Segment: ClientModule<Props> = (props, surface) => {
  const { Text } = surface.elements

  surface.onPointer(event => {
    if (event.type === 'enter' || event.type === 'leave') {
      surface.post({ hover: event.type === 'enter' })
    }
  })

  return <Text dimColor={!props.isActive}>{props.label}</Text>
}

export default Segment
