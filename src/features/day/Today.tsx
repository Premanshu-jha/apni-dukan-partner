import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { messageOf } from '../../api/errors'
import { useDay, useServices, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment, BarberColumn } from '../../api/types'
import { OFFSCREEN_CHEAP } from '../../components/ShowMore'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Loading, Page, Pill } from '../../components/ui'
import { addDays, clock12, dateOfIst, dayLabel, isDate, timeIst, todayIst } from '../../lib/ist'
import { useTodayIst } from '../../lib/useNow'
import { rupees } from '../../lib/money'
import { can } from '../../lib/roles'
import { Bell } from '../notifications/Bell'
import { NotificationsPrompt } from '../profile/Notifications'
import { HandoverOffers } from '../shop/HandoverOffers'
import { WaitingForVisit } from '../shop/Home'
import { AppointmentSheet } from './AppointmentSheet'
import { PauseControl } from './Pause'
import { isLive, servicesText, statusText, statusTone, totalPaise, whoText } from './status'

/** How far the board goes back and ahead (customers book up to 30 days ahead; closed days up to 90). */
const PAST_DAYS = 31
export const AHEAD_DAYS = 90
/**
 * With more barbers than this the board opens on the first barber's column ("Everyone" is a tap away): a big salon's
 * whole day is up to 2,000 cards, too many to draw at once on a cheap phone, while one barber's day is a few dozen.
 */
export const MANY_BARBERS = 6

/** The day board with one appointment opened (from the bookings list, a conflict list or a message). */
export function dayLink(a: { id: string; startsAt: string }): string {
  return `/salon/day?date=${dateOfIst(a.startsAt)}&open=${encodeURIComponent(a.id)}`
}

/**
 * The day board: every barber's day (or, for a barber, his own), refreshed every 30 seconds. Tap an appointment
 * to act on it. The date is in the address (?date=), which is also where the backend's messages point; `&open=<id>`
 * opens that appointment once the day is read (or says it isn't on this day).
 *
 * Drawn for big salons (50 barbers, 2,000 cards): nothing here ticks (the date changes by a midnight timer), cards
 * are memoised with a stable handler and their times worked out once per appointment object (a refresh keeps the
 * objects of unchanged appointments, so only changed cards draw again), off-screen cards skip layout and paint, and
 * with many barbers the board opens on one barber's column.
 */
export function Today() {
  const shop = useShop()
  const rights = can(shop.myRole)
  const [params, setParams] = useSearchParams()
  // Moves on by itself: a board left open overnight shows the new day.
  const today = useTodayIst()
  const asked = params.get('date')
  const date =
    isDate(asked) && asked >= addDays(today, -PAST_DAYS) && asked <= addDays(today, AHEAD_DAYS)
      ? asked
      : today
  const day = useDay(date)
  // null: not chosen yet (everyone, or the first barber when there are many)
  const [chosenBarber, setBarber] = useState<string | 'all' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // ?open=<id>: open it once this day is read (`linked`), then take it out of the address so a reload doesn't
  // open it again
  const openParam = params.get('open')
  const [seenParam, setSeenParam] = useState<string | null>(null)
  const [linked, setLinked] = useState<string | null>(null)
  const [notHere, setNotHere] = useState(false)
  if (openParam !== seenParam) {
    setSeenParam(openParam)
    if (openParam) {
      setOpenId(openParam)
      setLinked(openParam)
      setNotHere(false)
    }
  }
  useEffect(() => {
    if (!openParam) return
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.delete('open')
        return next
      },
      { replace: true },
    )
  }, [openParam, setParams])
  const suspended = shop.status === 'SUSPENDED'
  const waiting = shop.status === 'PENDING_VISIT'

  const columns = useMemo(() => day.data?.barbers ?? [], [day.data])
  const barber =
    chosenBarber === 'all' || (chosenBarber !== null && columns.some((c) => c.staffId === chosenBarber))
      ? chosenBarber
      : columns.length > MANY_BARBERS
        ? columns[0].staffId
        : 'all'
  const shown = useMemo(() => (barber === 'all' ? columns : columns.filter((c) => c.staffId === barber)), [columns, barber])
  const { live, closed } = useMemo(() => {
    const all = shown
      .flatMap((c) => c.appointments.map((a) => ({ a, barber: c.name })))
      .sort((x, y) => x.a.startsAt.localeCompare(y.a.startsAt))
    return { live: all.filter((x) => isLive(x.a)), closed: all.filter((x) => !isLive(x.a)) }
  }, [shown])
  const found = useMemo(() => {
    if (!openId) return null
    for (const c of columns) for (const a of c.appointments) if (a.id === openId) return a
    return null
  }, [columns, openId])
  // The linked appointment, once its day is read: open it (in its barber's column when one column is shown), or say
  // it isn't here (moved to another day, cancelled and gone, or given to a barber this person can't see)
  if (linked && day.data && day.data.date === date) {
    setLinked(null)
    if (!found) {
      setOpenId(null)
      setNotHere(true)
    } else if (barber !== 'all' && found.staffId !== barber) {
      setBarber(found.staffId)
    }
  }
  const openCard = useCallback((a: Appointment) => {
    setNotHere(false)
    setOpenId(a.id)
  }, [])
  // The open appointment as last seen: if a refresh no longer has it on this day (the customer moved it, or it was
  // given to a barber this person can't see), the sheet stays with a note instead of vanishing mid-action.
  const [lastOpen, setLastOpen] = useState<Appointment | null>(null)
  if (found && found !== lastOpen) setLastOpen(found)
  const open = found ?? (openId && lastOpen?.id === openId ? lastOpen : null)
  const gone = Boolean(openId && !found && open)

  const go = (d: string) => {
    setParams(d === today ? {} : { date: d }, { replace: true })
    setOpenId(null)
    setNotHere(false)
  }

  return (
    <Page>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{shop.name}</p>
          <h1 className="text-xl font-bold">{dayLabel(date)}</h1>
        </div>
        <Bell />
      </div>

      {suspended && (
        <Banner tone="bad">
          {shop.name} is off the app{shop.statusReason ? `: ${shop.statusReason}` : ''}. Customers can't book, and the
          day can only be viewed. Write to us to sort it out.
        </Banner>
      )}
      {waiting && <WaitingForVisit />}
      {/* A request to take over a shop (this one, as its helper or barber, or another) */}
      {shop.myRole !== 'OWNER' && <HandoverOffers />}
      {!suspended && <NotificationsPrompt />}
      {shop.myRole === 'OWNER' && <SetupChecklist />}
      {!suspended && !waiting && rights.pause && <PauseControl />}

      <div className="flex items-center gap-2">
        <Button variant="secondary" aria-label="Previous day" onClick={() => go(addDays(date, -1))} disabled={date <= addDays(today, -PAST_DAYS)}>
          ‹
        </Button>
        <Button variant={date === today ? 'secondary' : 'primary'} className="flex-1" onClick={() => go(today)} disabled={date === today}>
          {date === today ? 'Today' : 'Back to today'}
        </Button>
        <Button variant="secondary" aria-label="Next day" onClick={() => go(addDays(date, 1))} disabled={date >= addDays(today, AHEAD_DAYS)}>
          ›
        </Button>
      </div>

      {notHere && (
        <Banner tone="warn">That booking isn't on this day's board any more. It may have been moved or cancelled.</Banner>
      )}
      {day.isError && day.data !== undefined && (
        <Banner tone="warn">Couldn't refresh: {messageOf(day.error)} Showing what we had.</Banner>
      )}
      {day.isPending ? (
        <Loading />
      ) : day.isError && day.data === undefined ? (
        <ErrorState message={messageOf(day.error)} onRetry={() => day.refetch()} />
      ) : columns.length === 0 ? (
        <EmptyState
          title="No barbers yet"
          body={rights.editSetup ? 'Add your barbers and their hours to start taking bookings.' : 'The owner hasn’t added barbers yet.'}
          action={
            rights.editSetup ? (
              <Link to="/setup/staff" className="text-brand underline">
                Add barbers
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {columns.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Show barber">
              <Chip selected={barber === 'all'} onClick={() => setBarber('all')}>
                Everyone
              </Chip>
              {columns.map((c) => (
                <Chip key={c.staffId} selected={barber === c.staffId} onClick={() => setBarber(c.staffId)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          )}
          <Hours columns={shown} />
          {!suspended && date >= today && <DayActions columns={shown} date={date} myStaffId={day.data?.myStaffId ?? null} />}
          {live.length === 0 ? (
            <p className="py-6 text-center text-muted">Nothing booked {date === today ? 'today' : 'this day'} yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {live.map(({ a, barber: name }) => (
                <li key={a.id} className={OFFSCREEN_CHEAP}>
                  <AppointmentCard a={a} barber={columns.length > 1 && barber === 'all' ? name : null} onOpen={openCard} />
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && (
            <details className="rounded-2xl border border-line bg-surface p-3">
              <summary className="cursor-pointer text-sm text-muted">Done, cancelled and no-shows ({closed.length})</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {closed.map(({ a, barber: name }) => (
                  <li key={a.id} className={OFFSCREEN_CHEAP}>
                    <AppointmentCard a={a} barber={columns.length > 1 && barber === 'all' ? name : null} onOpen={openCard} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {open && (
        <AppointmentSheet
          a={open}
          barbers={columns}
          readOnly={suspended || gone}
          gone={gone}
          myStaffId={day.data?.myStaffId ?? null}
          onClose={() => setOpenId(null)}
        />
      )}
    </Page>
  )
}

function Hours({ columns }: { columns: BarberColumn[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted">
      {columns.map((c) => (
        <li key={c.staffId}>
          <span className="text-ink">{c.name}</span> ·{' '}
          {c.hours.length ? c.hours.map((h) => `${clock12(h.start)}–${clock12(h.end)}`).join(', ') : 'Off this day'}
        </li>
      ))}
    </ul>
  )
}

/** Walk-in (today only) and a break for the barber shown, or for himself. */
function DayActions({ columns, date, myStaffId }: { columns: BarberColumn[]; date: string; myStaffId: string | null }) {
  const navigate = useNavigate()
  // A barber adds breaks for himself only (the backend tells the app which profile is his), today or tomorrow; the
  // owner and helpers for the barber on screen, or pick one on the next screen.
  const todayDate = todayIst()
  const today = date === todayDate
  const barber = myStaffId !== null
  const showBreak = barber ? date <= addDays(todayDate, 1) : columns.length > 0
  const breakFor = myStaffId ?? (columns.length === 1 ? columns[0].staffId : null)
  return (
    <div className="flex gap-2">
      {today && (
        <Button className="flex-1" onClick={() => navigate('/salon/walk-in')}>
          + Walk-in
        </Button>
      )}
      {showBreak && (
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => navigate(`/salon/time-off?${breakFor ? `staff=${breakFor}&` : ''}date=${date}`)}
        >
          Add break
        </Button>
      )}
    </div>
  )
}

interface CardTimes {
  start: string
  end: string
  /** Leave or a closed day over several days: its first and last date instead of two midnights */
  firstDay: string | null
  lastDay: string | null
}

/** Each appointment's times, worked out once per appointment object (date formatting is the costly part of a card). */
const cardTimesCache = new WeakMap<Appointment, CardTimes>()

export function cardTimes(a: Appointment): CardTimes {
  const held = cardTimesCache.get(a)
  if (held) return held
  const firstDay = dateOfIst(a.startsAt)
  const t: CardTimes =
    firstDay === dateOfIst(a.endsAt)
      ? { start: timeIst(a.startsAt), end: timeIst(a.endsAt), firstDay: null, lastDay: null }
      : { start: '', end: '', firstDay, lastDay: dateOfIst(new Date(new Date(a.endsAt).getTime() - 1).toISOString()) }
  cardTimesCache.set(a, t)
  return t
}

/**
 * One appointment on the board or in the bookings list. Memoised: `onOpen` must be the same function from one draw
 * to the next (it gets the appointment), so a refresh draws only the cards whose appointment changed.
 */
export const AppointmentCard = memo(function AppointmentCard({
  a,
  barber,
  onOpen,
}: {
  a: Appointment
  barber: string | null
  onOpen: (a: Appointment) => void
}) {
  const total = totalPaise(a)
  const block = a.kind === 'BLOCK'
  const t = cardTimes(a)
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition hover:bg-raised ${a.notStarted ? 'border-warn/60' : 'border-line'} ${block ? 'bg-raised/60' : 'bg-surface'} ${isLive(a) ? '' : 'opacity-70'}`}
    >
      <span className="flex w-16 shrink-0 flex-col text-sm">
        {t.firstDay === null || t.lastDay === null ? (
          <>
            <span className="font-semibold">{t.start}</span>
            <span className="text-muted">{t.end}</span>
          </>
        ) : (
          // Leave or a closed day over several days: its days, not two midnights
          <>
            <span className="font-semibold">{dayLabel(t.firstDay)}</span>
            <span className="text-muted">to {dayLabel(t.lastDay)}</span>
          </>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-semibold">{whoText(a)}</span>
          {!block && <Pill tone={statusTone(a)}>{a.notStarted ? 'Not started' : statusText[a.status]}</Pill>}
        </span>
        {!block && (
          <span className="truncate text-sm text-muted">
            {a.kind === 'WALK_IN' ? 'Walk-in · ' : ''}
            {servicesText(a)} · {rupees(total.paise, total.from)}
          </span>
        )}
        {barber && <span className="text-xs text-muted">{barber}</span>}
      </span>
    </button>
  )
})

/** The owner's to-do list until customers can book: services, barbers, and barbers' skills and hours. */
function SetupChecklist() {
  const services = useServices()
  const staff = useStaff()
  if (!services.data || !staff.data) return null
  const anyService = services.data.some((s) => s.active)
  const activeStaff = staff.data.filter((s) => s.active)
  const ready = activeStaff.some((s) => s.hours.length > 0 && s.serviceIds.some((id) => services.data.some((v) => v.id === id && v.active)))
  if (anyService && ready) return null
  const items = [
    { done: anyService, text: 'Add your services and prices', to: '/setup/services' },
    { done: activeStaff.length > 0, text: 'Add your barbers', to: '/setup/staff' },
    { done: ready, text: 'Give a barber his services and weekly hours', to: '/setup/staff' },
  ]
  return (
    <Card className="flex flex-col gap-2">
      <p className="font-semibold">Before customers can book</p>
      <ul className="flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.text}>
            <Link to={i.to} className="flex items-center gap-2 text-sm">
              <span aria-hidden className={i.done ? 'text-good' : 'text-muted'}>
                {i.done ? '✓' : '○'}
              </span>
              <span className={i.done ? 'text-muted line-through' : 'text-brand underline'}>{i.text}</span>
              <span className="sr-only">{i.done ? '(done)' : '(to do)'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
