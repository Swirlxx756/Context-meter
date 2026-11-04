import type { ClientModule } from 'claude-code'

// One figure of the capsule, drawn as plain text (a Button would bring the desktop's native chip):
// full strength while open or under the pointer, dim otherwise; a left press posts to the hooks module.
type Props = { label: string; isActive: boolean }

const Segment: ClientModule<Props, { isHovered: boolean }> = (props, surface) => {
  const { Text } = surface.elements
  const isHovered = surface.state?.isHovered ?? false

  surface.onPointer(event => {
    if (event.type === 'down' && event.button === 'left') {
      surface.post({ press: true })
    } else if (event.type === 'enter' || event.type === 'leave') {
      surface.setState({ isHovered: event.type === 'enter' })
    }
  })

  return <Text dimColor={!(props.isActive || isHovered)}>{props.label}</Text>
}

export default Segment
