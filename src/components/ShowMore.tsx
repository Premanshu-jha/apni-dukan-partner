import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/errors'
import { Button } from './ui'

/**
 * "Show more" for a paged list (the admin app's shop list and the customer app's salon list do the same):
 * - a tap while the phone is offline says so at once and sends nothing;
 * - after a page loads, focus moves to the first new item (keyboard and screen readers); when the page brought
 *   nothing (exactly a full page was left, so the last page is empty) the button is gone and focus goes to the count;
 *   after a failed page it stays on the button;
 * - the offline note belongs to the list as it was (gone with another list, or once a page loads).
 *
 * The list marks each item with `data-index` (its place in the whole list); the count is a `tabIndex={-1}` element.
 */
export function useShowMore(listKey: string, loaded: number, fetchingMore: boolean) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const countRef = useRef<HTMLParagraphElement | null>(null)
  // Index of the first item the next page brings (set when "Show more" is tapped)
  const focusIndex = useRef<number | null>(null)
  const [offlineAt, setOfflineAt] = useState<{ key: string; loaded: number } | null>(null)
  // Another list forgets the note (React's "adjust state while rendering")
  const [shownKey, setShownKey] = useState(listKey)
  if (shownKey !== listKey) {
    setShownKey(listKey)
    setOfflineAt(null)
  }
  const offline = offlineAt !== null && offlineAt.key === listKey && offlineAt.loaded === loaded

  useEffect(() => {
    if (focusIndex.current === null || fetchingMore) return
    if (loaded > focusIndex.current) {
      const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${focusIndex.current}"]`)
      const target = item?.matches('a, button') ? item : item?.querySelector<HTMLElement>('a, button')
      target?.focus()
    } else if (!document.activeElement || document.activeElement === document.body) {
      countRef.current?.focus()
    }
    focusIndex.current = null
  }, [loaded, fetchingMore])

  function showMore(fetchNext: () => Promise<unknown>) {
    if (fetchingMore) return
    if (!navigator.onLine) {
      setOfflineAt({ key: listKey, loaded })
      return
    }
    setOfflineAt(null)
    focusIndex.current = loaded
    void fetchNext()
  }

  return { listRef, countRef, offline, showMore }
}

/** The note under a paged list (a failed page, offline, a failed refresh) and its "Show more" button. */
export function ShowMoreFooter({
  label,
  loadingLabel,
  more,
  busy,
  failed,
  offline,
  refreshFailed,
  error,
  onShowMore,
}: {
  label: string
  loadingLabel: string
  more: boolean
  busy: boolean
  failed: boolean
  offline: boolean
  refreshFailed: boolean
  error: unknown
  onShowMore: () => void
}) {
  const network = error instanceof ApiError && error.code === 'NETWORK'
  return (
    <>
      {(failed || offline || refreshFailed) && (
        <p role="alert" className="text-sm text-bad">
          {offline
            ? `You're offline. Connect to the internet and tap ${label} again.`
            : failed
              ? network
                ? `You're offline or the server can't be reached. Connect and tap ${label} again.`
                : `Couldn't load more. Tap ${label} to try again.`
              : "Couldn't refresh the list. It may be a little out of date."}
        </p>
      )}
      {more && (
        // aria-busy, not disabled: a disabled button would drop the keyboard focus while it loads
        <Button variant="secondary" aria-busy={busy} onClick={onShowMore}>
          {busy ? loadingLabel : label}
        </Button>
      )}
    </>
  )
}

/**
 * A long list's items are drawn only near the screen (content-visibility: the browser skips the layout and paint of
 * cards far off screen but keeps them in the page, so find-in-page, focus and screen readers still reach every one).
 * The size is a guess for a card until it has been drawn once.
 */
export const OFFSCREEN_CHEAP = '[content-visibility:auto] [contain-intrinsic-size:auto_88px]'
