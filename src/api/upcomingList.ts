import type { AfterCursor } from './pages'
import type { Appointment } from './types'

/**
 * The coming-up list kept as its loaded pages, each with where the next page starts (the backend's keyset cursor:
 * the last item of the answer, exactly as received; null when the answer was short, the last page). The cursors stay
 * as they came even when a delta changes the items, so "Show more" goes on exactly where the loaded list ends.
 */
export interface UpcomingPage {
  items: Appointment[]
  next: AfterCursor | null
}

/** GET /salon/upcoming?since= (backend README, "Upcoming list deltas"). */
export interface UpcomingChanges {
  /** True: load the list's pages again (then go on with `seq`). */
  full: boolean
  seq: string
  setupVersion: number
  /** New or changed bookings now on the list, in the order written (null when full). */
  changed: Appointment[] | null
  /** Ids no longer on the list (null when full). */
  removed: string[] | null
}

/** An instant's microseconds since 1970 from the backend's text (a JavaScript Date keeps only milliseconds). */
export function micros(instant: string): number {
  const fraction = (instant.match(/\.(\d+)Z$/)?.[1] ?? '').padEnd(6, '0').slice(0, 6)
  return Math.floor(Date.parse(instant) / 1000) * 1_000_000 + Number(fraction)
}

/** The list's order: startsAt, then id. */
export function compareKey(a: { startsAt: string; id: string }, b: { startsAt: string; id: string }): number {
  const d = micros(a.startsAt) - micros(b.startsAt)
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

const asKey = (c: AfterCursor) => ({ startsAt: c.afterStart, id: c.afterId })

/** A page as the backend answered it: its items and the cursor after its last item when it was full. */
export function pageOf(items: Appointment[], pageSize: number): UpcomingPage {
  const end = items[items.length - 1]
  return { items, next: items.length < pageSize || !end ? null : { afterStart: end.startsAt, afterId: end.id } }
}

/**
 * The loaded pages with a delta applied: `removed` and changed ids leave; each changed booking goes back in sorted
 * place, into the page whose range holds it (up to that page's `next`). A booking that now sorts after the end of the
 * loaded list (when more pages exist) isn't added: it comes with "Show more". Ids not held are ignored.
 */
export function applyUpcoming(pages: UpcomingPage[], delta: UpcomingChanges): UpcomingPage[] {
  if (pages.length === 0) return pages
  const changed = new Map<string, Appointment>()
  for (const a of delta.changed ?? []) changed.set(a.id, a)   // a later copy of the same id wins
  const gone = new Set<string>([...(delta.removed ?? []), ...changed.keys()])
  const end = pages[pages.length - 1].next
  const kept = pages.flatMap((p) => p.items).filter((a) => !gone.has(a.id))
  const added = [...changed.values()].filter((a) => !(delta.removed ?? []).includes(a.id) && (end === null || compareKey(a, asKey(end)) <= 0))
  const all = [...kept, ...added].sort(compareKey)
  let at = 0
  return pages.map((p, i) => {
    const last = i === pages.length - 1
    const bound = p.next
    const items: Appointment[] = []
    while (at < all.length && (last || bound === null || compareKey(all[at], asKey(bound)) <= 0)) items.push(all[at++])
    return { items, next: p.next }
  })
}
