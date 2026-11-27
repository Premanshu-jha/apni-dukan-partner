import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { explain, isApiError, messageOf } from '../../api/errors'
import { refreshSalonWork, salonKeys, setupApi, SETUP_KEYS, useSalonHours } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { InTheWay, SalonHours } from '../../api/types'
import { Banner, Button, Card, ErrorBanner, ErrorState, Field, Loading, Page, Switch } from '../../components/ui'
import { useT } from '../../i18n'
import { clock12, weekdayName } from '../../lib/ist'
import { can } from '../../lib/roles'
import {
  checkSalonWeek,
  defaultWeek,
  fromSalonWeek,
  toSalonWeek,
  WEEKDAYS,
  weekLines,
  type SalonWeek,
} from '../../lib/salonHours'
import { BookingsInTheWay } from './StaffDetail'
import { FirstTimeHint } from '../guide/FirstTimeHint'
import { unsavedWarning, useReportUnsaved, useUnsavedParts } from '../../lib/unsaved'
import { cameFrom } from '../shop/Register'

/** Barbers whose hours fall outside the new week (409 STAFF_HOURS_OUTSIDE names them). */
interface Outside {
  staffId: string
  name: string
}

/**
 * The salon's week: each day open (with its opening and closing time) or closed, the weekly off. Saves the whole week
 * with the version it was read with. Barbers working outside the new hours: the owner is told who, and may let the app
 * cut their hours to fit (bookings that wouldn't fit any more are listed instead, and nothing changes).
 */
export function SalonHoursEditor({
  hours,
  saveLabel,
  onSaved,
  onSaving,
  onDirty,
}: {
  hours: SalonHours
  saveLabel: string
  onSaved: (saved: SalonHours) => void
  /** A save starts (a "Saved." shown for an earlier one goes) */
  onSaving?: () => void
  /** Told whether the week on screen differs from the one saved (the screen asks before leaving then) */
  onDirty?: (part: string, dirty: boolean) => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outside, setOutside] = useState<Outside[] | null>(null)
  const [inTheWay, setInTheWay] = useState<InTheWay[] | null>(null)
  const startWeek = () => (hours.days.length ? toSalonWeek(hours.days) : defaultWeek())
  const [week, setWeek] = useState<SalonWeek>(startWeek)
  // A newer copy from the backend (after a save, or after HOURS_CHANGED) starts the form again; the message stays
  // (React's "adjust state while rendering")
  const [shown, setShown] = useState(hours.version)
  if (shown !== hours.version) {
    setShown(hours.version)
    setWeek(startWeek())
    setOutside(null)
  }

  const problem = checkSalonWeek(week)
  // Not saved yet: a changed week (the suggested week of a salon with none set isn't the owner's own yet)
  useReportUnsaved(onDirty, 'week', JSON.stringify(week) !== JSON.stringify(startWeek()))
  const firstOpen = WEEKDAYS.find((d) => week[d])

  // Any change to the week: the list of barbers outside was for the week saved before, and "Cut their hours"
  // would cut to this new one, maybe others never named; it goes until the next save says again
  const change = (next: SalonWeek) => {
    setWeek(next)
    setOutside(null)
  }
  const setDay = (d: number, k: 'open' | 'close', v: string) => {
    const day = week[d]
    if (day) change({ ...week, [d]: { ...day, [k]: v } })
  }
  const copyFirst = () => {
    if (!firstOpen) return
    const h = week[firstOpen]!
    change(Object.fromEntries(WEEKDAYS.map((d) => [d, week[d] ? { ...h } : null])))
  }

  async function save(trim: boolean) {
    onSaving?.()
    setBusy(true)
    setError(null)
    setInTheWay(null)
    try {
      const saved = await setupApi.setHours(hours.version, fromSalonWeek(week), trim)
      setOutside(null)
      qc.setQueryData(salonKeys.hours, saved)
      refreshSalonWork(qc, SETUP_KEYS)
      onSaved(saved)
    } catch (e) {
      if (isApiError(e, 'STAFF_HOURS_OUTSIDE')) {
        const list = e.details.staff
        setOutside(Array.isArray(list) ? (list as Outside[]) : [])
      } else if (isApiError(e, 'BOOKINGS_IN_THE_WAY')) {
        const list = e.details.appointments
        setInTheWay(Array.isArray(list) ? (list as InTheWay[]) : [])
        setError(messageOf(e))
      } else {
        setError(
          isApiError(e, 'HOURS_CHANGED')
            ? t('setup.hoursChanged')
            : explain(e),
        )
        if (isApiError(e, 'HOURS_CHANGED')) await qc.invalidateQueries({ queryKey: salonKeys.hours })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{t('setup.hoursTitle')}</p>
        {firstOpen && (
          <button type="button" className="text-sm text-link underline" onClick={copyFirst}>
            {t('setup.sameTimes')}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">{t('setup.hoursHint')}</p>
      <ul className="flex flex-col gap-3">
        {WEEKDAYS.map((d) => {
          const h = week[d]
          return (
            <li key={d} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-medium">{weekdayName(d)}</span>
                <span className="flex items-center gap-2 text-sm text-muted">
                  {h ? t('setup.dayOpen') : t('setup.dayClosed')}
                  <Switch
                    label={t('setup.dayOpenSwitch', { day: weekdayName(d) })}
                    checked={Boolean(h)}
                    onChange={(on) => change({ ...week, [d]: on ? { open: '10:00', close: '21:00' } : null })}
                  />
                </span>
              </div>
              {h && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field id={`open-${d}`} label={t('setup.opens')} type="time" step={900} value={h.open} onChange={(e) => setDay(d, 'open', e.target.value)} />
                    {h.close === '24:00' ? (
                      <p className="flex min-h-12 items-end pb-3 text-sm">{t('setup.closesMidnight')}</p>
                    ) : (
                      <Field id={`close-${d}`} label={t('setup.closes')} type="time" step={900} value={h.close} onChange={(e) => setDay(d, 'close', e.target.value)} />
                    )}
                  </div>
                  {/* A time box can't say 24:00, so midnight is its own choice */}
                  <label className="flex min-h-9 items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand"
                      checked={h.close === '24:00'}
                      onChange={(e) => setDay(d, 'close', e.target.checked ? '24:00' : '23:45')}
                    />
                    {t('setup.openTillMidnight')}
                  </label>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {problem && <Banner tone="warn">{problem}</Banner>}
      {outside && (
        <div className="flex flex-col gap-2 rounded-xl border border-warn/50 p-3">
          <p className="font-semibold">{t('setup.barbersOutside')}</p>
          <p className="text-sm text-muted">{outside.map((o) => o.name).join(', ')}</p>
          <Button variant="secondary" busy={busy} disabled={Boolean(problem)} onClick={() => save(true)}>
            {t('setup.cutAndSave')}
          </Button>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
      <BookingsInTheWay list={inTheWay} />
      <Button busy={busy} disabled={Boolean(problem)} onClick={() => save(false)}>
        {saveLabel}
      </Button>
    </Card>
  )
}

/** Setup → Opening hours: the owner changes them; helpers see them. */
export function SalonHoursPage() {
  const t = useT()
  const shop = useShop()
  const edit = can(shop.myRole).editSetup
  const hours = useSalonHours()
  const [saved, setSaved] = useState(false)
  const location = useLocation()
  const [unsaved, report] = useUnsavedParts()
  return (
    // Back where it was opened from (Today's setup card, More), else the Salon tab; a changed week asks first
    <Page back={cameFrom(location, '/setup')} title={t('setup.hoursTitle')} leaveWarning={unsavedWarning(edit && unsaved)}>
      <FirstTimeHint screen="hours" text={edit ? t('guide.hintHours') : t('guide.hintHoursHelper')} />
      {hours.isPending ? (
        <Loading />
      ) : hours.isError && !hours.data ? (
        // Only when nothing was read: a failed refetch in the background must not drop the owner's edits
        <ErrorState message={messageOf(hours.error)} onRetry={() => hours.refetch()} />
      ) : edit ? (
        <>
          {saved && <Banner tone="good">{t('setup.saved')}</Banner>}
          <SalonHoursEditor
            hours={hours.data}
            saveLabel={t('setup.saveSalonHours')}
            onSaved={() => setSaved(true)}
            onSaving={() => setSaved(false)}
            onDirty={report}
          />
        </>
      ) : (
        <Card className="flex flex-col gap-1">
          {hours.data.days.length === 0 ? (
            <p className="text-sm text-muted">{t('setup.hoursNotSetByOwner')}</p>
          ) : (
            weekLines(hours.data.days, clock12).map((l) => (
              <p key={l} className="text-sm">
                {l}
              </p>
            ))
          )}
        </Card>
      )}
      <p className="text-sm text-muted">
        {t('setup.closedDaysBefore')}{' '}
        {can(shop.myRole).closures ? (
          <Link to="/salon/closures" className="text-link underline">
            {t('setup.closedDays')}
          </Link>
        ) : (
          t('setup.closedDaysOwnerSets')
        )}
        {t('setup.closedDaysAfter')}
      </p>
    </Page>
  )
}
