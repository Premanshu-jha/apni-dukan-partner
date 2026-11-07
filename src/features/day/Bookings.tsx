import { useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { messageOf } from '../../api/errors'
import { atCap, uniqueById } from '../../api/pages'
import { HISTORY_MAX_PAGES, UPCOMING_MAX_PAGES, useHistory, useMoreAfterCap, useUpcoming, useUpcomingPoll } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment } from '../../api/types'
import { OFFSCREEN_CHEAP, ShowMoreFooter, useShowMore } from '../../components/ShowMore'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Page } from '../../components/ui'
import { addDays, dateOfIst, dayLabel, isDate, todayIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { can } from '../../lib/roles'
import { AppointmentCard } from './Today'
import { statusText } from './status'

/** Groups appointments by India date, keeping their order. */
export function byDate(list: Appointment[]): Array<{ date: string; items: Appointment[] }> {
  const groups: Array<{ date: string; items: Appointment[] }> = []
  for (const a of list) {
    const d = dateOfIst(a.startsAt)
    const last = groups.at(-1)
    if (last && last.date === d) last.items.push(a)
    else groups.push({ date: d, items: [a] })
  }
  return groups
}

/** Coming bookings across days, and (owner and helpers) the history with totals. */
export function Bookings() {
  const shop = useShop()
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  return (
    <Page title="Bookings">
      {can(shop.myRole).history && (
        <div className="flex gap-2" role="group" aria-label="Show">
          <Chip selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
            Coming up
          </Chip>
          <Chip selected={tab === 'history'} onClick={() => setTab('history')}>
            History
          </Chip>
        </div>
      )}
      {tab === 'upcoming' ? <Upcoming /> : <History />}
    </Page>
  )
}

function Upcoming() {
  const navigate = useNavigate()
  const list = useUpcoming()
  // Only what changed, every minute and on return to the app (once the pages are on screen)
  // On while anything is listed, also after a failed reload (that is when the next poll matters most)
  const poll = useUpcomingPoll(list.data !== undefined)
  const items = uniqueById((list.data?.pages ?? []).map((p) => p.items))
  const pager = useShowMore('upcoming', items.length, list.isFetchingNextPage)
  // At the cap with a full last page: ask whether anything really comes after (exactly 500 left: nothing)
  const pages = list.data?.pages ?? []
  const last = pages[pages.length - 1]
  const full = pages.length >= UPCOMING_MAX_PAGES && last !== undefined && last.next !== null
  const afterCap = useMoreAfterCap(full ? last.next : null)
  const refreshFailed = list.isRefetchError || poll.isError
  if (list.isPending) return <Loading />
  // Only when nothing is on screen yet: a failed "Show more" or refresh keeps the list and says so
  if (list.isError && !list.data) return <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
  if (items.length === 0) {
    return (
      <>
        {refreshFailed && (
          <>
            <Banner tone="warn">Couldn't refresh the list. It may be a little out of date.</Banner>
            <Button variant="secondary" onClick={() => void poll.refetch()}>
              Try again
            </Button>
          </>
        )}
        <EmptyState title="No bookings coming up" body="New online bookings show here and on the day board." />
      </>
    )
  }
  const capped = full && afterCap.data === true
  const n = items.length
  return (
    <section aria-label="Bookings coming up" className="flex flex-col gap-3">
      <p ref={pager.countRef} tabIndex={-1} className="text-sm text-muted focus:outline-none">
        {list.hasNextPage || capped ? `The next ${n} bookings, soonest first` : `${n} ${n === 1 ? 'booking' : 'bookings'} coming up`}
      </p>
      <p aria-live="polite" className="sr-only">
        {n} bookings shown
      </p>
      <Grouped
        list={items}
        listRef={pager.listRef}
        busy={list.isFetchingNextPage}
        onOpen={(a) => navigate(`/salon/day?date=${dateOfIst(a.startsAt)}`)}
      />
      {capped && (
        <Banner tone="info">Showing the next {n} bookings. Open a day on Today to see the ones after.</Banner>
      )}
      <ShowMoreFooter
        label="Show more bookings"
        loadingLabel="Loading more bookings…"
        more={list.hasNextPage}
        busy={list.isFetchingNextPage}
        failed={list.isFetchNextPageError}
        offline={pager.offline}
        refreshFailed={refreshFailed}
        error={list.isRefetchError ? list.error : poll.isError ? poll.error : list.error}
        onShowMore={() => pager.showMore(list.fetchNextPage)}
        onRetryRefresh={() => void poll.refetch()}
      />
    </section>
  )
}

function History() {
  const navigate = useNavigate()
  const today = todayIst()
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const valid = isDate(from) && isDate(to) && from <= to && to <= today && to <= addDays(from, 30)
  const list = useHistory(from, to, valid)
  const items = uniqueById(list.data?.pages.map((p) => p.appointments) ?? [])
  const pager = useShowMore(`history ${from} ${to}`, items.length, list.isFetchingNextPage)
  // The totals cover the whole range and come on the first page only (null on later pages): the first page's stand
  const totals = list.data?.pages[0]
  const pages = list.data?.pages ?? []
  const capped = atCap(pages.length, HISTORY_MAX_PAGES, pages[pages.length - 1]?.next != null)
  const n = items.length
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id="history-from" label="From" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field id="history-to" label="To" type="date" min={from} max={today} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {!valid ? (
        <Banner tone="warn">Pick up to 31 days, ending today or earlier.</Banner>
      ) : list.isPending ? (
        <Loading />
      ) : list.isError && !totals ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : (
        totals && (
          <>
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-muted">Done (at list prices)</p>
              <p className="text-2xl font-bold">{rupees(totals.completedPaise ?? 0)}</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {Object.entries(totals.counts ?? {}).map(([status, count]) => (
                  <li key={status}>
                    {statusText[status as keyof typeof statusText] ?? status}: <span className="font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            {n === 0 ? (
              <EmptyState title="Nothing in these days" />
            ) : (
              <section aria-label="History" className="flex flex-col gap-3">
                <p ref={pager.countRef} tabIndex={-1} className="text-sm text-muted focus:outline-none">
                  {list.hasNextPage || capped ? `The latest ${n}, latest first` : `${n} ${n === 1 ? 'booking or walk-in' : 'bookings and walk-ins'}, latest first`}
                </p>
                <p aria-live="polite" className="sr-only">
                  {n} shown
                </p>
                <Grouped
                  list={items}
                  listRef={pager.listRef}
                  busy={list.isFetchingNextPage}
                  onOpen={(a) => navigate(`/salon/day?date=${dateOfIst(a.startsAt)}`)}
                />
              </section>
            )}
            {capped && <Banner tone="info">Showing the latest {n}. Pick fewer days to see the earlier ones.</Banner>}
            <ShowMoreFooter
              label="Show more"
              loadingLabel="Loading more…"
              more={list.hasNextPage}
              busy={list.isFetchingNextPage}
              failed={list.isFetchNextPageError}
              offline={pager.offline}
              refreshFailed={list.isRefetchError}
              error={list.error}
              onShowMore={() => pager.showMore(list.fetchNextPage)}
            />
          </>
        )
      )}
    </>
  )
}

/**
 * The list by day. Every loaded page is drawn (at most 500 or 1,000 cards), each card only near the screen
 * (OFFSCREEN_CHEAP); `data-index` is the card's place in the whole list, for "Show more" focus.
 */
function Grouped({
  list,
  onOpen,
  listRef,
  busy,
}: {
  list: Appointment[]
  onOpen: (a: Appointment) => void
  listRef: RefObject<HTMLDivElement | null>
  busy: boolean
}) {
  let index = 0
  return (
    <div ref={listRef} aria-busy={busy} className="flex flex-col gap-4">
      {byDate(list).map((g) => (
        <section key={g.date} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">{dayLabel(g.date)}</h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((a) => (
              <li key={a.id} data-index={index++} className={OFFSCREEN_CHEAP}>
                <AppointmentCard a={a} barber={null} onOpen={() => onOpen(a)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
