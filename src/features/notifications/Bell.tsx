import { Link } from 'react-router'
import { useUnreadCount } from '../../api/notifications'

/** The bell at the top of Home, with the number of unread messages. */
export function Bell() {
  const unread = useUnreadCount().data ?? 0
  // The backend counts up to 100 (NotificationStore.UNREAD_CAP): 100 means "100 or more"
  const label = unread ? `Messages, ${unread > 99 ? 'more than 99' : unread} unread` : 'Messages'
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
          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-bg"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
