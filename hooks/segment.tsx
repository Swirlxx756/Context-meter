import type { ClientModule } from 'claude-code'

// One figure of the row, drawn as plain text (a Button would bring the desktop's native chip).
// A left press posts `{ press: true }`: the hooks module toggles the figure's card. The pointer
// merely passing over it does nothing.
type Props = { label: string; isActive: boolean }

const Segment: ClientModule<Props> = (props, surface) => {
  const { Text } = surface.elements

  surface.onPointer(event => {
    if (event.type === 'down' && event.button === 'left') {
      surface.post({ press: true })
    }
  })

  return <Text dimColor={!props.isActive}>{props.label}</Text>
}

export default Segment
