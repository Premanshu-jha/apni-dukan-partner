import { useNavigate } from 'react-router'
import { INBOX_MAX_PAGES, useInbox, useMarkRead, type InboxItem } from '../../api/notifications'
import { messageOf } from '../../api/errors'
import { Button, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { dateTimeIst, minutesUntil } from '../../lib/ist'

/** "Just now", "12 min ago", "3 h ago", else the date and time. */
function when(sentAt: string): string {
  const ago = -minutesUntil(sentAt)
  if (ago < 1) return 'Just now'
  if (ago < 60) return `${ago} min ago`
  if (ago < 24 * 60) return `${Math.floor(ago / 60)} h ago`
  return dateTimeIst(sentAt)
}

const icons: Record<string, string> = {
  SALON_NEW_BOOKING: '＋',
  SALON_BOOKING_MOVED: '↻',
  SALON_BOOKING_CANCELLED: '✕',
  SALON_BOOKING_REASSIGNED: '⇄',
  SALON_CANCELLED_BY_SALON: '✕',
  SALON_WALK_IN_CANCELLED: '✕',
  SHOP_APPROVED: '✓',
  SHOP_NOT_APPROVED: '!',
  SHOP_SUSPENDED: '!',
  SHOP_DOCUMENT_REMOVED: '!',
  SHOP_REINSTATED: '✓',
  SHOP_HANDOVER_REQUEST: '⇄',
  SHOP_HANDOVER_ACCEPTED: '⇄',
  SHOP_HANDOVER_DECLINED: '✕',
  SHOP_HANDOVER_DONE: '✓',
  SHOP_INVITE: '＋',
  SHOP_INVITE_ACCEPTED: '✓',
  SHOP_INVITE_DECLINED: '✕',
}

const alarming = new Set([
  'SALON_BOOKING_CANCELLED',
  'SALON_CANCELLED_BY_SALON',
  'SALON_WALK_IN_CANCELLED',
  'SHOP_NOT_APPROVED',
  'SHOP_SUSPENDED',
  'SHOP_DOCUMENT_REMOVED',
  'SHOP_HANDOVER_DECLINED',
  'SHOP_INVITE_DECLINED',
])

/**
 * Only this app's own pages are opened from a message: the day board, the start for shop news, or the hand-over
 * requests ("A shop for you": /handover), invitations to join a shop (/invites).
 */
export function safePath(url: string | null): string | null {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return null
  if (url.startsWith('/salon/')) return url
  if (url === '/handover' || url === '/invites' || url === '/setup/document') return url
  if (url.startsWith('/shops/')) return '/'
  return null
}

export function Inbox() {
  const navigate = useNavigate()
  const inbox = useInbox()
  const markRead = useMarkRead()
  const items = inbox.data?.pages.flatMap((p) => p.items) ?? []
  const unread = inbox.data?.pages[0]?.unread ?? 0

  function open(item: InboxItem) {
    if (!item.read) markRead.mutate([item.id])
    const path = safePath(item.url)
    if (path) navigate(path)
  }

  return (
    <Page back="/salon/day" title="Messages">
      {unread > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{unread > 99 ? '99+' : unread} unread</p>
          <button
            type="button"
            className="text-sm font-semibold text-link disabled:opacity-50"
            disabled={markRead.isPending}
            // Only what is on screen: a message that arrived after the list loaded stays unread.
            onClick={() => {
              const ids = items.filter((i) => !i.read).map((i) => i.id)
              // An empty list would mean "everything" to the backend
              if (ids.length) markRead.mutate(ids)
              else void inbox.refetch()
            }}
          >
            Mark all read
          </button>
        </div>
      )}
      {inbox.isPending ? (
        <Loading />
      ) : inbox.isError ? (
        <ErrorState message={messageOf(inbox.error)} onRetry={() => inbox.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No messages yet" body="New bookings, changes, cancellations and news about your salon show up here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => open(m)}
                className={`flex w-full gap-3 rounded-2xl border p-4 text-left transition hover:bg-raised ${m.read ? 'border-line bg-surface' : 'border-brand/50 bg-brand/5'}`}
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${alarming.has(m.type) ? 'bg-bad/15 text-bad' : 'bg-brand/15 text-link'}`}
                >
                  {icons[m.type] ?? '•'}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={m.read ? 'font-medium' : 'font-semibold'}>{m.title}</span>
                    {!m.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand">
                        <span className="sr-only">Unread</span>
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted">{m.body}</span>
                  <span className="text-xs text-muted">{when(m.sentAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {inbox.hasNextPage && (
        <Button variant="secondary" busy={inbox.isFetchingNextPage} onClick={() => inbox.fetchNextPage()}>
          Show older
        </Button>
      )}
      {inbox.data && inbox.data.pages.length >= INBOX_MAX_PAGES && inbox.data.pages[inbox.data.pages.length - 1].next && (
        <p className="text-center text-sm text-muted">Showing the latest {items.length} messages.</p>
      )}
      <p className="text-center text-xs text-muted">Messages are kept for 90 days.</p>
    </Page>
  )
}
