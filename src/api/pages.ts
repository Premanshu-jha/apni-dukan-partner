/**
 * Keyset pages (the backend's "Pages (the exact contract)"): the next page is everything after the last item, asked
 * with that item's values sent back exactly as received (the backend reads times back to the microsecond).
 */

/** Where an appointment page ended: the last item's startsAt and id (or the history's `next`). */
export interface AfterCursor {
  afterStart: string
  afterId: string
}

/** The query text for a cursor ("&afterStart=…&afterId=…"), or "" for the first page. */
export function cursorQuery(after: AfterCursor | null | undefined): string {
  if (!after) return ''
  return `&afterStart=${encodeURIComponent(after.afterStart)}&afterId=${encodeURIComponent(after.afterId)}`
}

/**
 * The cursor of the next page of a list that ends when a page is short (upcoming): after the last item, unless this
 * page was short (the last one) or `maxPages` pages are loaded already (the cap: see `atCap`).
 */
export function nextAfterLast<T extends { startsAt: string; id: string }>(
  last: T[],
  all: T[][],
  pageSize: number,
  maxPages: number,
): AfterCursor | undefined {
  if (last.length < pageSize || all.length >= maxPages) return undefined
  const end = last[last.length - 1]
  return { afterStart: end.startsAt, afterId: end.id }
}

/**
 * True when the list stopped at the cap with more still on the backend, so the screen says why there is no "Show
 * more". `more` says whether the last loaded page pointed to another one.
 */
export function atCap(pages: number, maxPages: number, more: boolean): boolean {
  return pages >= maxPages && more
}

/**
 * Every page's items in order, each id once. Within one answer keyset pages never overlap, but a booking moved
 * between two "Show more" taps can come again on a later page: the first one stays.
 */
export function uniqueById<T extends { id: string }>(pages: T[][]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}
