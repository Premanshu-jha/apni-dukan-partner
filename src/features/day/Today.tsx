import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { messageOf } from '../../api/errors'
import { useDay, useServices, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment, BarberColumn } from '../../api/types'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Loading, Page, Pill } from '../../components/ui'
import { addDays, clock12, dayLabel, timeIst, todayIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { can, myStaff } from '../../lib/roles'
import { useSession } from '../../store/session'
import { Bell } from '../notifications/Bell'
import { NotificationsPrompt } from '../profile/Notifications'
import { WaitingForVisit } from '../shop/Home'
import { AppointmentSheet } from './AppointmentSheet'
import { PauseControl } from './Pause'
import { isLive, servicesText, statusText, statusTone, totalPaise, whoText } from './status'

/** How far the board goes back and ahead (customers book at most 30 days ahead). */
const PAST_DAYS = 31
const AHEAD_DAYS = 30

/**
 * The day board: every barber's day (or, for a barber, his own), refreshed every 30 seconds. Tap an appointment
 * to act on it. The date is in the address (?date=), which is also where the backend's messages point.
 */
export function Today() {
  const shop = useShop()
  const rights = can(shop.myRole)
  const [params, setParams] = useSearchParams()
  const today = todayIst()
  const asked = params.get('date')
  const date =
    asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= addDays(today, -PAST_DAYS) && asked <= addDays(today, AHEAD_DAYS)
      ? asked
      : today
  const day = useDay(date)
  const [barber, setBarber] = useState<string | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const suspended = shop.status === 'SUSPENDED'
  const waiting = shop.status === 'PENDING_VISIT'

  const columns = day.data?.barbers ?? []
  const shown = barber === 'all' ? columns : columns.filter((c) => c.staffId === barber)
  const all = useMemo(
    () =>
      shown
        .flatMap((c) => c.appointments.map((a) => ({ a, barber: c.name })))
        .sort((x, y) => x.a.startsAt.localeCompare(y.a.startsAt)),
    [shown],
  )
  const live = all.filter((x) => isLive(x.a))
  const closed = all.filter((x) => !isLive(x.a))
  const open = columns.flatMap((c) => c.appointments).find((a) => a.id === openId) ?? null

  const go = (d: string) => {
    setParams(d === today ? {} : { date: d }, { replace: true })
    setOpenId(null)
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

      {day.isPending ? (
        <Loading />
      ) : day.isError ? (
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
          {!suspended && date >= today && <DayActions columns={shown} date={date} />}
          {live.length === 0 ? (
            <p className="py-6 text-center text-muted">Nothing booked {date === today ? 'today' : 'this day'} yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {live.map(({ a, barber: name }) => (
                <li key={a.id}>
                  <AppointmentCard a={a} barber={columns.length > 1 && barber === 'all' ? name : null} onOpen={() => setOpenId(a.id)} />
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && (
            <details className="rounded-2xl border border-line bg-surface p-3">
              <summary className="cursor-pointer text-sm text-muted">Done, cancelled and no-shows ({closed.length})</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {closed.map(({ a, barber: name }) => (
                  <li key={a.id}>
                    <AppointmentCard a={a} barber={columns.length > 1 && barber === 'all' ? name : null} onOpen={() => setOpenId(a.id)} />
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
          readOnly={suspended}
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
function DayActions({ columns, date }: { columns: BarberColumn[]; date: string }) {
  const navigate = useNavigate()
  const shop = useShop()
  const user = useSession((s) => s.user)
  const staff = useStaff()
  const me = myStaff(staff.data, user?.phone)
  const single = columns.length === 1 ? columns[0] : null
  // A barber adds breaks for himself only; the owner and helpers for the barber on screen.
  const breakFor = shop.myRole === 'BARBER' ? me?.id : single?.staffId
  const today = date === todayIst()
  return (
    <div className="flex gap-2">
      {today && (
        <Button className="flex-1" onClick={() => navigate('/salon/walk-in')}>
          + Walk-in
        </Button>
      )}
      {breakFor && (
        <Button variant="secondary" className="flex-1" onClick={() => navigate(`/salon/time-off?staff=${breakFor}&date=${date}`)}>
          Add break
        </Button>
      )}
    </div>
  )
}

export function AppointmentCard({ a, barber, onOpen }: { a: Appointment; barber: string | null; onOpen: () => void }) {
  const total = totalPaise(a)
  const block = a.kind === 'BLOCK'
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition hover:bg-raised ${a.notStarted ? 'border-warn/60' : 'border-line'} ${block ? 'bg-raised/60' : 'bg-surface'} ${isLive(a) ? '' : 'opacity-70'}`}
    >
      <span className="flex w-16 shrink-0 flex-col text-sm">
        <span className="font-semibold">{timeIst(a.startsAt)}</span>
        <span className="text-muted">{timeIst(a.endsAt)}</span>
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
}

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
