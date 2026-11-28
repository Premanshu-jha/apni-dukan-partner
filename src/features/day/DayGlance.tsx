import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { pushSupported, turnOnPush } from '../../api/push'
import { dayApi, salonKeys } from '../../api/salon'
import { googleListingApi } from '../../api/shop'
import type { BarberColumn } from '../../api/types'
import { Button, Card } from '../../components/ui'
import { useT } from '../../i18n'
import { addDays, timeIst, todayIst } from '../../lib/ist'
import { useNow } from '../../lib/useNow'
import { storage } from '../../lib/storage'
import { isApp } from '../../lib/platform'
import { PushProblem, pushErrorText, resultText, useSubscribed } from '../profile/Notifications'

/** Bookings (and walk-ins kept for later) still to come: CONFIRMED and not over. */
function stillToCome(columns: BarberColumn[], nowMs: number) {
  const out: { startsAt: string; barber: string }[] = []
  for (const c of columns) {
    for (const a of c.appointments) {
      if (a.kind !== 'BLOCK' && a.status === 'CONFIRMED' && Date.parse(a.endsAt) > nowMs) {
        out.push({ startsAt: a.startsAt, barber: c.name })
      }
    }
  }
  return out.sort((x, y) => x.startsAt.localeCompare(y.startsAt))
}

/** The hour of the day in India (0-23). */
function hourIst(nowMs: number) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(nowMs))
}

/** Today's appointments that count as the day's work: bookings and walk-ins not cancelled (breaks aren't). */
function dayTotal(columns: BarberColumn[]) {
  let n = 0
  for (const c of columns) {
    for (const a of c.appointments) {
      if (a.kind !== 'BLOCK' && !a.status.startsWith('CANCELLED')) n++
    }
  }
  return n
}

/** A slow day has at most this many: after a full day the share card isn't shown. */
const SLOW_DAY_MAX = 2
/** The share card only in the salon's day (not at night or before opening). */
const SLOW_DAY_FROM_HOUR = 8

/** From this hour Today also says tomorrow's bookings (as the 8 pm message does), to plan the next day. */
const EVENING_HOUR = 18

/**
 * The day at a glance at the top of Today: how many bookings are still to come and the next one; from 6 pm also
 * tomorrow's, with "See tomorrow". A barber's day board holds only his own column, so he sees his own. Tomorrow's is
 * read every 5 minutes (not every 30 seconds as the board is), only in the evening.
 */
export function DaySummary({ columns, own, onTomorrow }: { columns: BarberColumn[]; own: boolean; onTomorrow: () => void }) {
  const t = useT()
  const now = useNow(60_000)
  const evening = hourIst(now) >= EVENING_HOUR
  const tomorrow = addDays(todayIst(), 1)
  const next = useQuery({
    // Under the day board's keys, so a change to the bookings (a move to tomorrow, a break) refreshes it too
    queryKey: [...salonKeys.days, 'glance', tomorrow],
    queryFn: () => dayApi.day(tomorrow),
    enabled: evening,
    refetchInterval: 300_000,
    staleTime: 240_000,
    retry: false,
  })
  const left = stillToCome(columns, now)
  const tomorrowList = next.data?.barbers ? stillToCome(next.data.barbers, now) : null
  const first = left[0]
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-raised px-4 py-3 text-sm" role="status">
      <p>
        <span className="font-semibold">
          {left.length === 0
            ? t('day.glanceNoneLeft')
            : t(own ? 'day.glanceLeftMine' : 'day.glanceLeft', { count: left.length })}
        </span>
        {first && (
          <span className="text-muted">
            {' · '}
            {own ? t('day.glanceNextMine', { time: timeIst(first.startsAt) }) : t('day.glanceNext', { time: timeIst(first.startsAt), name: first.barber })}
          </span>
        )}
      </p>
      {evening && tomorrowList && (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            <span className="font-semibold">
              {tomorrowList.length === 0 ? t('day.glanceTomorrowNone') : t('day.glanceTomorrow', { count: tomorrowList.length })}
            </span>
            {tomorrowList[0] && <span className="text-muted"> · {t('day.glanceFirst', { time: timeIst(tomorrowList[0].startsAt) })}</span>}
          </span>
          <button type="button" onClick={onTomorrow} className="inline-flex min-h-11 items-center font-medium text-link underline">
            {t('day.glanceSeeTomorrow')}
          </button>
        </p>
      )}
    </div>
  )
}

/**
 * "Booking alerts: on" or "off, you may miss bookings · Turn on", always on Today (where they'd wonder why no booking
 * came), so a phone that can't ring for a booking is never a surprise. Not shown where this phone can't have them.
 */
export function AlertsLine() {
  const t = useT()
  const [on, setOn] = useSubscribed()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!pushSupported() || on === null) return null
  if (on) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <BellIcon />
        {t('day.alertsOn')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-2">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <BellIcon />
        {t('day.alertsOff')}
      </p>
      {error && <PushProblem text={error} />}
      <Button
        busy={busy}
        className="min-h-11"
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const r = await turnOnPush()
            if (r === 'on') setOn(true)
            else setError(resultText(r))
          } catch (e) {
            setError(pushErrorText(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('day.alertsTurnOn')}
      </Button>
    </div>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0 text-link" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

const slowDayKey = (day: string) => `adp.slowDayShare.${day}`

/**
 * A slow day (nothing more booked today, before the evening): "Few bookings today? Share your salon link", one tap to
 * the share screen. "Not today" puts it away until tomorrow. Owner and helpers (who can share the salon).
 */
export function SlowDayShare({ columns }: { columns: BarberColumn[] }) {
  const t = useT()
  const now = useNow(60_000)
  const day = todayIst()
  // Read for the day on screen (Today left open past midnight: the next day's card comes back)
  const [hiddenDay, setHiddenDay] = useState<string | null>(null)
  const hidden = hiddenDay === day || storage.get(slowDayKey(day)) === '1'
  const hour = hourIst(now)
  if (hidden || hour < SLOW_DAY_FROM_HOUR || hour >= EVENING_HOUR || stillToCome(columns, now).length > 0
    || dayTotal(columns) > SLOW_DAY_MAX) return null
  return (
    <Card className="flex flex-col gap-2">
      <p className="font-semibold">{t('day.slowDayTitle')}</p>
      <p className="text-sm text-muted">{t('day.slowDayBody')}</p>
      <div className="flex gap-2">
        <Link
          to="/salon/share"
          state={{ from: '/salon/day' }}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-brand px-4 font-semibold text-brand-ink"
        >
          {t('day.slowDayShare')}
        </Link>
        <Button
          variant="ghost"
          onClick={() => {
            storage.set(slowDayKey(day), '1')
            setHiddenDay(day)
          }}
        >
          {t('day.slowDayNotToday')}
        </Button>
      </div>
    </Card>
  )
}

/**
 * "Get found on Google Maps too": the owner's card while his salon is known not to be on Google Maps (the backend
 * asks Google once after approval). Three short steps, the button to Google's own free page, and "I've added it" or
 * "Not now" to put it away for good. Customers in the app find the salon anyway (its directions go to its pin): this
 * is about people searching Google.
 */
/** The owner's Google Maps card, read once every 10 minutes at most (Today asks whether it shows, to show one card). */
export function useGoogleCard(enabled: boolean) {
  return useQuery({ queryKey: ['shop', 'google-listing'], queryFn: googleListingApi.get, staleTime: 600_000, retry: false, enabled })
}

export function GoogleListingCard() {
  const t = useT()
  const qc = useQueryClient()
  const card = useGoogleCard(true)
  const [busy, setBusy] = useState<'ADDED' | 'NOT_NOW' | null>(null)
  if (!card.data?.show) return null
  const answer = async (a: 'ADDED' | 'NOT_NOW') => {
    setBusy(a)
    try {
      qc.setQueryData(['shop', 'google-listing'], await googleListingApi.answer(a))
    } catch {
      // Put away on this phone anyway: it is asked again only if the answer reached the server
      qc.setQueryData(['shop', 'google-listing'], { ...card.data, show: false })
    } finally {
      setBusy(null)
    }
  }
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-semibold">{t('day.googleTitle')}</p>
      <p className="text-sm">{t('day.googleBody')}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
        <li>{t('day.googleStep1')}</li>
        <li>{t('day.googleStep2')}</li>
        <li>{t('day.googleStep3')}</li>
      </ol>
      {/* Google's own page, in the phone's browser (the app opens outside links there) */}
      <a
        href={card.data.addUrl}
        {...(isApp() ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink"
      >
        {t('day.googleAdd')}
      </a>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" busy={busy === 'ADDED'} disabled={busy !== null} onClick={() => void answer('ADDED')}>
          {t('day.googleDone')}
        </Button>
        <Button variant="ghost" className="flex-1" busy={busy === 'NOT_NOW'} disabled={busy !== null} onClick={() => void answer('NOT_NOW')}>
          {t('day.googleNotNow')}
        </Button>
      </div>
    </Card>
  )
}
