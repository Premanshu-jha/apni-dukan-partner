import { Link } from 'react-router'
import { useUnreadCount } from '../../api/notifications'

/** The bell at the top of Home, with the number of unread messages. */
export function Bell() {
  const unread = useUnreadCount().data ?? 0
  const label = unread ? `Messages, ${unread} unread` : 'Messages'
  return (
    <Link
      to="/notifications"
      aria-label={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-xl hover:bg-raised"
    >
      <span aria-hidden>🔔</span>
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-brand-ink"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
