import { createElement } from 'react'
import { ICON_DRAWINGS, iconOf, type ServiceIconName } from '../lib/serviceIcons'

/**
 * A service's picture: thin-line SVG in the text colour (so it follows light and dark), hidden from screen readers
 * next to the service's name (the name says it). Give {@code icon} to draw one icon (the picker), or {@code service}
 * to draw the service's own (its owner's choice, else the one its name fits).
 */
export function ServiceIcon({
  icon,
  service,
  size = 20,
  className = '',
}: {
  icon?: ServiceIconName
  service?: { name: string; icon?: string | null }
  size?: number
  className?: string
}) {
  const name = icon ?? (service ? iconOf(service) : 'OTHER')
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      data-icon={name}
    >
      {ICON_DRAWINGS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}
