import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

/** One message in the app's list (backend: GET /me/notifications?app=partner). */
export interface InboxItem {
  id: string
  type: string
  title: string
  body: string
  /** The screen it is about, for example /bookings/{id}. */
  url: string | null
  sentAt: string
  read: boolean
}

export interface InboxPage {
  items: InboxItem[]
  unread: number
  next: string | null
}

const APP = 'partner'

export const inboxKeys = {
  all: ['inbox'] as const,
  list: ['inbox', 'list'] as const,
  unread: ['inbox', 'unread'] as const,
}

/**
 * At most this many pages of 30 are loaded (300 messages; the backend keeps 90 days). A refresh of the list (marking
 * read, a push, coming back to the app) asks every loaded page again, one after the other, so the cap bounds both
 * the memory and each refresh to 10 small calls (each answered 304 when unchanged). TanStack's own `maxPages` would
 * drop the newest page from the top instead, and the backend has no "page before" to fetch it back.
 */
export const INBOX_MAX_PAGES = 10

export function useInbox() {
  return useInfiniteQuery({
    queryKey: inboxKeys.list,
    queryFn: ({ pageParam }) =>
      api<InboxPage>(
        'GET',
        `/api/v1/me/notifications?app=${APP}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last, all) => (all.length >= INBOX_MAX_PAGES ? undefined : last.next),
  })
}

/** The number on the bell. Checked every minute and whenever the app comes back into view. */
export function useUnreadCount() {
  return useQuery({
    queryKey: inboxKeys.unread,
    queryFn: () => api<{ unread: number }>('GET', `/api/v1/me/notifications/unread-count?app=${APP}`),
    select: (r) => r.unread,
    refetchInterval: 60_000,
  })
}

/** Marks these read, or everything when ids is empty. */
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<void>('POST', `/api/v1/me/notifications/read?app=${APP}`, { body: ids.length ? { ids } : {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: inboxKeys.all }),
  })
}
