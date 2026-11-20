import { useCallback, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { messageOf } from '../../api/errors'
import { atCap, uniqueById } from '../../api/pages'
import { HISTORY_MAX_PAGES, UPCOMING_MAX_PAGES, useHistory, useMoreAfterCap, useUpcoming, useUpcomingPoll } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment } from '../../api/types'
import { OFFSCREEN_CHEAP, ShowMoreFooter, useShowMore } from '../../components/ShowMore'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { addDays, dateOfIst, dayLabel, isDate, todayIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { can } from '../../lib/roles'
import { AppointmentCard, dayLink } from './Today'
import { statusTextOr } from './status'
import { useServiceIcons } from './serviceIconMap'

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
  const t = useT()
  const shop = useShop()
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming')
  return (
    <Page title={t('day.bookingsTitle')}>
      {can(shop.myRole).history && (
        <div className="flex gap-2" role="group" aria-label={t('day.show')}>
          <Chip selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
            {t('day.comingUp')}
          </Chip>
          <Chip selected={tab === 'history'} onClick={() => setTab('history')}>
            {t('day.history')}
          </Chip>
        </div>
      )}
      {tab === 'upcoming' ? <Upcoming /> : <History />}
    </Page>
  )
}

/** Opens the appointment on its day's board (one function for every card, so the memoised cards aren't drawn again). */
function useOpenOnBoard() {
  const navigate = useNavigate()
  return useCallback((a: Appointment) => navigate(dayLink(a)), [navigate])
}

function Upcoming() {
  const t = useT()
  const openOnBoard = useOpenOnBoard()
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
            <Banner tone="warn">{t('day.listRefreshFailed')}</Banner>
            <Button variant="secondary" onClick={() => void poll.refetch()}>
              {t('common.retry')}
            </Button>
          </>
        )}
        <EmptyState title={t('day.noUpcomingTitle')} body={t('day.noUpcomingBody')} />
      </>
    )
  }
  const capped = full && afterCap.data === true
  const n = items.length
  return (
    <section aria-label={t('day.upcomingSection')} className="flex flex-col gap-3">
      <p ref={pager.countRef} tabIndex={-1} className="text-sm text-muted focus:outline-none">
        {list.hasNextPage || capped ? t('day.nextBookings', { count: n }) : t('day.bookingsComingUp', { count: n })}
      </p>
      <p aria-live="polite" className="sr-only">
        {t('day.bookingsShown', { count: n })}
      </p>
      <Grouped
        list={items}
        listRef={pager.listRef}
        busy={list.isFetchingNextPage}
        onOpen={openOnBoard}
      />
      {capped && (
        <Banner tone="info">{t('day.upcomingCapped', { count: n })}</Banner>
      )}
      <ShowMoreFooter
        label={t('day.showMoreBookings')}
        loadingLabel={t('day.loadingMoreBookings')}
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
  const t = useT()
  const openOnBoard = useOpenOnBoard()
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
        <Field id="history-from" label={t('day.historyFrom')} type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field id="history-to" label={t('day.historyTo')} type="date" min={from} max={today} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {!valid ? (
        <Banner tone="warn">{t('day.historyRange')}</Banner>
      ) : list.isPending ? (
        <Loading />
      ) : list.isError && !totals ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : (
        totals && (
          <>
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-muted">{t('day.historyDone')}</p>
              <p className="text-2xl font-bold">{rupees(totals.completedPaise ?? 0)}</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {Object.entries(totals.counts ?? {}).map(([status, count]) => (
                  <li key={status}>
                    {statusTextOr(status)}: <span className="font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            {n === 0 ? (
              <EmptyState title={t('day.historyEmpty')} />
            ) : (
              <section aria-label={t('day.history')} className="flex flex-col gap-3">
                <p ref={pager.countRef} tabIndex={-1} className="text-sm text-muted focus:outline-none">
                  {list.hasNextPage || capped ? t('day.historyLatest', { count: n }) : t('day.historyCount', { count: n })}
                </p>
                <p aria-live="polite" className="sr-only">
                  {t('day.historyShown', { count: n })}
                </p>
                <Grouped
                  list={items}
                  listRef={pager.listRef}
                  busy={list.isFetchingNextPage}
                  onOpen={openOnBoard}
                />
              </section>
            )}
            {capped && <Banner tone="info">{t('day.historyCapped', { count: n })}</Banner>}
            <ShowMoreFooter
              label={t('day.showMore')}
              loadingLabel={t('day.loadingMore')}
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
  const icons = useServiceIcons()
  let index = 0
  return (
    <div ref={listRef} aria-busy={busy} className="flex flex-col gap-4">
      {byDate(list).map((g) => (
        <section key={g.date} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">{dayLabel(g.date)}</h2>
          <ul className="flex flex-col gap-2">
            {g.items.map((a) => (
              <li key={a.id} data-index={index++} className={OFFSCREEN_CHEAP}>
                <AppointmentCard a={a} barber={null} onOpen={onOpen} icons={icons} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
