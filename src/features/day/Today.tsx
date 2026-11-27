import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { messageOf } from '../../api/errors'
import { useDay } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment, BarberColumn } from '../../api/types'
import { OFFSCREEN_CHEAP } from '../../components/ShowMore'
import { Banner, Button, Chip, EmptyState, ErrorState, Loading, Page, Pill } from '../../components/ui'
import { addDays, clock12, dateOfIst, dayLabel, isDate, timeIst, todayIst } from '../../lib/ist'
import { useTodayIst } from '../../lib/useNow'
import { rupees } from '../../lib/money'
import { can } from '../../lib/roles'
import { language, useT } from '../../i18n'
import { Bell } from '../notifications/Bell'
import { HelpButton } from '../help/HelpButton'
import { helpHref } from '../help/links'
import { ContactUs } from '../../components/ContactUs'
import { ArrivedNote } from '../../components/ArrivedNote'
import { NotificationsPrompt } from '../profile/Notifications'
import { HandoverOffers } from '../shop/HandoverOffers'
import { InviteOffers } from '../shop/InviteOffers'
import { WaitingForVisit } from '../shop/Home'
import { SubscriptionBanner } from '../subscription/SubscriptionBanner'
import { RecheckWaiting } from '../shop/RecheckWaiting'
import { AppointmentSheet } from './AppointmentSheet'
import { PauseControl } from './Pause'
import { isLive, pillText, servicesText, statusTone, totalPaise, whoText } from './status'
import { NO_ICONS, useServiceIcons, type ServiceIconMap } from './serviceIconMap'
import { ServiceIcon } from '../../components/ServiceIcon'
import { iconOf } from '../../lib/serviceIcons'
import { SetupChecklist, type ChecklistState } from '../guide/SetupChecklist'
import { Tips, tipsKey } from '../guide/Tips'
import { useSeen } from '../guide/storage'
import { useLanguageOffer } from '../guide/languageOffer'

/** How far the board goes back and ahead (customers book up to 30 days ahead; closed days up to 90). */
const PAST_DAYS = 31
export const AHEAD_DAYS = 90
/**
 * With more barbers than this the board opens on the first barber's column with bookings ("Everyone" is a tap away): a big salon's
 * whole day is up to 2,000 cards, too many to draw at once on a cheap phone, while one barber's day is a few dozen.
 */
export const MANY_BARBERS = 6

/**
 * The column the board opens on: everyone, or with more than MANY_BARBERS barbers the first barber with a booking or
 * walk-in that day (breaks and leave don't count), so it never opens on an empty column; everyone if nobody has one.
 */
export function openingColumn(columns: BarberColumn[]): string | 'all' {
  if (columns.length <= MANY_BARBERS) return 'all'
  return columns.find((c) => c.appointments.some((a) => a.kind !== 'BLOCK'))?.staffId ?? 'all'
}

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
  const t = useT()
  const shop = useShop()
  const icons = useServiceIcons()
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

  // The first-time tips: once per account and role, or again from Help (?tips=1, then out of the address so a
  // reload doesn't open them again)
  const [tipsSeen, markTipsSeen] = useSeen(tipsKey(shop.myRole))
  const [tipsAsked, setTipsAsked] = useState(false)
  const tipsParam = params.get('tips') === '1'
  if (tipsParam && !tipsAsked) setTipsAsked(true)
  useEffect(() => {
    if (!tipsParam) return
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.delete('tips')
        return next
      },
      { replace: true },
    )
  }, [tipsParam, setParams])
  // One guide card at a time, so a first open is calm. The language offer at the top (someone who never chose one)
  // comes first: nothing else until it is answered, so a 740 px phone still shows the board's buttons. Then the
  // owner's needed setup steps (the board is empty until they are done); then the tips (not while waiting for the
  // visit or off the app: no booking can arrive yet); then the setup card's good-to-do steps. Helpers and barbers:
  // the tips first (using the board is their job). Tips asked for from Help come at once.
  const languageOffer = useLanguageOffer((s) => s.open)
  const [checklist, setChecklist] = useState<ChecklistState>('loading')
  const setupCard = shop.myRole !== 'BARBER'
  const tipsFirst = shop.myRole !== 'OWNER' || checklist === 'good' || checklist === 'none'
  const showTips = tipsAsked || (!tipsSeen && !suspended && !waiting && !languageOffer && tipsFirst)
  // The salon can take bookings (no needed setup step left): only then is pausing them worth offering. Barbers
  // have no setup card (and can't pause).
  const bookable = !setupCard || checklist === 'good' || checklist === 'none'
  const closeTips = useCallback(() => {
    setTipsAsked(false)
    markTipsSeen()
  }, [markTipsSeen])

  const columns = useMemo(() => day.data?.barbers ?? [], [day.data])
  const barber =
    chosenBarber === 'all' || (chosenBarber !== null && columns.some((c) => c.staffId === chosenBarber))
      ? chosenBarber
      : openingColumn(columns)
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
    <Page ownHelp>
      {/* Help beside the bell, not in a row of its own above them: the board keeps its room */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{shop.name}</p>
          <h1 className="text-xl font-bold">{dayLabel(date)}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HelpButton />
          <Bell />
        </div>
      </div>

      <ArrivedNote helpFrom="/salon/day" />
      {suspended && (
        <div className="flex flex-col gap-3">
          <Banner tone="bad">
            {shop.statusReason
              ? t('day.suspendedReason', { name: shop.name, reason: shop.statusReason })
              : t('day.suspended', { name: shop.name })}
          </Banner>
          {/* "Write to us to sort it out": the button right here, the salon and its code already in the message */}
          <Link
            to={helpHref({
              from: '/salon/day',
              write: true,
              about: t('help.topicSuspended'),
              text: t('help.suspendedText', { name: shop.name, code: String(shop.shopCode) }),
            })}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink"
          >
            {t('help.writeToUs')}
          </Link>
          <ContactUs screen={t('help.topicSuspended')} shopCode={shop.shopCode} />
        </div>
      )}
      {waiting && <WaitingForVisit />}
      {/* The salon's subscription: paying soon, or ended (customers can't find it) */}
      {!suspended && !waiting && <SubscriptionBanner />}
      {/* A live salon's changes wait for the field team (the owner's only: the backend sends recheckSince to him) */}
      <RecheckWaiting />
      {/* A request to take over a shop (this one, as its helper or barber, or another) */}
      {shop.myRole !== 'OWNER' && <HandoverOffers />}
      {/* An invitation to another shop (accepting says to leave this one first) */}
      {shop.myRole !== 'OWNER' && <InviteOffers />}
      {showTips && <Tips role={shop.myRole} onClose={closeTips} />}
      {/* The owner's and helpers' setup card asks about notifications itself (one of its steps): only barbers get this */}
      {!suspended && !showTips && !languageOffer && !setupCard && <NotificationsPrompt />}
      {setupCard && <SetupChecklist hidden={showTips || languageOffer} onState={setChecklist} />}
      {/* Paused: always said, with Resume. "Too busy?" only once customers can book (one next step at a time) */}
      {!suspended && !waiting && rights.pause && <PauseControl offer={bookable} />}

      <div className="flex items-center gap-2">
        <Button variant="secondary" aria-label={t('day.previousDay')} onClick={() => go(addDays(date, -1))} disabled={date <= addDays(today, -PAST_DAYS)}>
          ‹
        </Button>
        <Button variant={date === today ? 'secondary' : 'primary'} className="flex-1" onClick={() => go(today)} disabled={date === today}>
          {date === today ? t('day.todayButton') : t('day.backToToday')}
        </Button>
        <Button variant="secondary" aria-label={t('day.nextDay')} onClick={() => go(addDays(date, 1))} disabled={date >= addDays(today, AHEAD_DAYS)}>
          ›
        </Button>
      </div>

      {notHere && (
        <Banner tone="warn">{t('day.notOnBoard')}</Banner>
      )}
      {day.isError && day.data !== undefined && (
        <Banner tone="warn">{t('day.refreshFailed', { message: messageOf(day.error) })}</Banner>
      )}
      {day.isPending ? (
        <Loading />
      ) : day.isError && day.data === undefined ? (
        <ErrorState message={messageOf(day.error)} onRetry={() => day.refetch()} />
      ) : columns.length === 0 ? (
        <EmptyState
          title={t('day.noBarbersTitle')}
          body={rights.editSetup ? t('day.noBarbersOwner') : t('day.noBarbersOther')}
          action={
            // While the setup card has a needed step, it is the one next step: no second "Add barbers" here
            rights.editSetup && checklist !== 'needed' ? (
              <Link to="/setup/staff" className="text-link underline">
                {t('day.addBarbers')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {columns.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t('day.showBarber')}>
              <Chip selected={barber === 'all'} onClick={() => setBarber('all')}>
                {t('day.everyone')}
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
            <p className="py-6 text-center text-muted">{date === today ? t('day.nothingToday') : t('day.nothingThisDay')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {live.map(({ a, barber: name }) => (
                <li key={a.id} className={OFFSCREEN_CHEAP}>
                  <AppointmentCard a={a} barber={columns.length > 1 && barber === 'all' ? name : null} onOpen={openCard} icons={icons} />
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && (
            <details className="rounded-2xl border border-line bg-surface p-3">
              <summary className="cursor-pointer text-sm text-muted">{t('day.closedSummary', { count: closed.length })}</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {closed.map(({ a, barber: name }) => (
                  <li key={a.id} className={OFFSCREEN_CHEAP}>
                    <AppointmentCard a={a} barber={columns.length > 1 && barber === 'all' ? name : null} onOpen={openCard} icons={icons} />
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
  const t = useT()
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted">
      {columns.map((c) => (
        <li key={c.staffId}>
          <span className="text-ink">{c.name}</span> ·{' '}
          {c.hours.length ? c.hours.map((h) => `${clock12(h.start)}–${clock12(h.end)}`).join(', ') : t('day.offThisDay')}
        </li>
      ))}
    </ul>
  )
}

/** Walk-in (today only) and a break for the barber shown, or for himself. */
function DayActions({ columns, date, myStaffId }: { columns: BarberColumn[]; date: string; myStaffId: string | null }) {
  const t = useT()
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
          {t('day.addWalkIn')}
        </Button>
      )}
      {showBreak && (
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => navigate(`/salon/time-off?${breakFor ? `staff=${breakFor}&` : ''}date=${date}`)}
        >
          {t('day.addBreak')}
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
const cardTimesCache = new WeakMap<Appointment, CardTimes & { lang: string }>()

export function cardTimes(a: Appointment): CardTimes {
  const held = cardTimesCache.get(a)
  if (held && held.lang === language()) return held
  const firstDay = dateOfIst(a.startsAt)
  const t: CardTimes =
    firstDay === dateOfIst(a.endsAt)
      ? { start: timeIst(a.startsAt), end: timeIst(a.endsAt), firstDay: null, lastDay: null }
      : { start: '', end: '', firstDay, lastDay: dateOfIst(new Date(new Date(a.endsAt).getTime() - 1).toISOString()) }
  const held2 = { ...t, lang: language() }
  cardTimesCache.set(a, held2)
  return held2
}

/**
 * One appointment on the board or in the bookings list. Memoised: `onOpen` must be the same function from one draw
 * to the next (it gets the appointment), so a refresh draws only the cards whose appointment changed.
 */
export const AppointmentCard = memo(function AppointmentCard({
  a,
  barber,
  onOpen,
  icons = NO_ICONS,
}: {
  a: Appointment
  barber: string | null
  onOpen: (a: Appointment) => void
  /** The salon's own picture for each service id (useServiceIcons); without one, the picture its name fits. */
  icons?: ServiceIconMap
}) {
  const total = totalPaise(a)
  const block = a.kind === 'BLOCK'
  const times = cardTimes(a)
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => onOpen(a)}
      className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition hover:bg-raised ${a.notStarted ? 'border-warn/60' : 'border-line'} ${block ? 'bg-raised/60' : 'bg-surface'} ${isLive(a) ? '' : 'opacity-70'}`}
    >
      <span className="flex w-16 shrink-0 flex-col text-sm">
        {times.firstDay === null || times.lastDay === null ? (
          <>
            <span className="font-semibold">{times.start}</span>
            <span className="text-muted">{times.end}</span>
          </>
        ) : (
          // Leave or a closed day over several days: its days, not two midnights
          <>
            <span className="font-semibold">{dayLabel(times.firstDay)}</span>
            <span className="text-muted">{t('day.toDay', { day: dayLabel(times.lastDay) })}</span>
          </>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          {/* The name wraps; the status pill beside it stays whole */}
          <span className="min-w-0 font-semibold break-words">{whoText(a)}</span>
          {!block && <Pill tone={statusTone(a)}>{pillText(a)}</Pill>}
        </span>
        {!block && a.services.length > 0 && <CardServiceIcons a={a} icons={icons} />}
        {/* Two lines at most, so the price at the end still shows with several services in a long language */}
        {!block && (
          <span className="line-clamp-2 text-sm break-words text-muted">
            {a.kind === 'WALK_IN'
              ? t('day.cardWalkIn', { services: servicesText(a), price: rupees(total.paise, total.from) })
              : `${servicesText(a)} · ${rupees(total.paise, total.from)}`}
          </span>
        )}
        {barber && <span className="text-xs text-muted">{barber}</span>}
      </span>
    </button>
  )
})

/**
 * The services' pictures on a card (at most 3, one per kind), so whoever can't read the names still sees what the
 * customer is in for. Hidden from screen readers: the services line says it.
 */
function CardServiceIcons({ a, icons }: { a: Appointment; icons: ServiceIconMap }) {
  const kinds = [...new Set(a.services.map((s) => iconOf({ name: s.name, icon: icons.get(s.serviceId) })))].slice(0, 3)
  return (
    <span className="flex items-center gap-1.5 text-muted" data-testid="card-service-icons">
      {kinds.map((icon) => (
        <ServiceIcon key={icon} icon={icon} size={18} />
      ))}
    </span>
  )
}
