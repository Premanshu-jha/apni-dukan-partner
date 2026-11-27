import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { explain, isApiError, messageOf } from '../../api/errors'
import { dayApi, useStaff, refreshSalonWork } from '../../api/salon'
import { useShop } from '../../api/shop'
import { AHEAD_DAYS } from './Today'
import type { Appointment, InTheWay } from '../../api/types'
import { Banner, Button, Card, Chip, ErrorBanner, ErrorState, Field, Loading, Page } from '../../components/ui'
import { addDays, dateOfIst, dateTimeIst, isDate, istInstant, timeIst, todayIst } from '../../lib/ist'
import { can } from '../../lib/roles'
import { t, useT } from '../../i18n'
import { unsavedWarning } from '../../lib/unsaved'

type Kind = 'BREAK' | 'LEAVE'

/**
 * The backend's limits: leave at most 30 days; a break at most 12 hours, or for a barber's own breaks at most 4 hours
 * a day in all, today or tomorrow only.
 */
export const MAX_LEAVE_DAYS = 30
export const OWN_BREAK_MINUTES = 240

/** The time range a form fill means, or an error to show. Leave covers whole India days, last day included. */
export function blockRange(
  kind: Kind,
  f: { date: string; from: string; to: string; firstDay: string; lastDay: string; own?: boolean },
): { startAt: string; endAt: string } | { error: string } {
  if (kind === 'BREAK') {
    if (!isDate(f.date)) return { error: t('day.pickTheDay') }
    if (!f.from || !f.to) return { error: t('day.pickStartEnd') }
    if (f.to <= f.from) return { error: t('day.endAfterStart') }
    if (f.own && f.date > addDays(todayIst(), 1)) return { error: t('day.ownBreakDays') }
    if (f.own && minutesBetween(f.from, f.to) > OWN_BREAK_MINUTES) return { error: t('day.ownBreakHours') }
    return { startAt: istInstant(f.date, f.from), endAt: istInstant(f.date, f.to) }
  }
  if (!isDate(f.firstDay) || !isDate(f.lastDay)) return { error: t('day.pickFirstLast') }
  if (f.lastDay < f.firstDay) return { error: t('day.lastAfterFirst') }
  if (f.lastDay > addDays(f.firstDay, MAX_LEAVE_DAYS - 1)) return { error: t('day.leaveTooLong', { days: MAX_LEAVE_DAYS }) }
  return { startAt: istInstant(f.firstDay, '00:00'), endAt: istInstant(addDays(f.lastDay, 1), '00:00') }
}

function minutesBetween(from: string, to: string): number {
  const m = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  return m(to) - m(from)
}

/**
 * A break (owner, helper, or the barber for himself) or leave (owner only). Bookings in the way must be moved or
 * cancelled first: the backend refuses with BLOCK_CONFLICTS, so we check first and list them.
 */
export function TimeOff() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const rights = can(shop.myRole)
  const staff = useStaff()
  const [params] = useSearchParams()
  const today = todayIst()
  const [staffId, setStaffId] = useState<string | null>(params.get('staff'))
  const [kind, setKind] = useState<Kind>('BREAK')
  const startDate = params.get('date') && params.get('date')! >= today ? params.get('date')! : today
  const [date, setDate] = useState(startDate)
  const [from, setFrom] = useState('13:00')
  const [to, setTo] = useState('14:00')
  const [firstDay, setFirstDay] = useState(startDate)
  const [lastDay, setLastDay] = useState(startDate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inTheWay, setInTheWay] = useState<Array<Appointment | InTheWay> | null>(null)

  if (staff.isPending) return <Loading />
  if (staff.isError) return <ErrorState message={messageOf(staff.error)} onRetry={() => staff.refetch()} />

  const barbers = staff.data.filter((s) => s.active)
  // A barber comes here from his own column (?staff=); the backend only lets him add breaks for himself.
  const chosen = barbers.find((b) => b.id === staffId) ?? null
  const ownOnly = shop.myRole === 'BARBER'
  // Anything changed from how the screen opened and not saved: Back and Help ask first
  const unsaved =
    staffId !== params.get('staff') ||
    kind !== 'BREAK' ||
    date !== startDate ||
    from !== '13:00' ||
    to !== '14:00' ||
    firstDay !== startDate ||
    lastDay !== startDate

  async function save() {
    if (!chosen || busy) return
    const range = blockRange(kind, { date, from, to, firstDay, lastDay, own: ownOnly })
    if ('error' in range) {
      setError(range.error)
      return
    }
    setBusy(true)
    setError(null)
    setInTheWay(null)
    try {
      const hit = await dayApi.conflicts(chosen.id, range.startAt, range.endAt)
      if (hit.length) {
        setInTheWay(hit)
        return
      }
      await dayApi.addBlock(chosen.id, { type: kind, ...range })
      refreshSalonWork(qc)
      navigate(`/salon/day?date=${dateOfIst(range.startAt)}`, { replace: true })
    } catch (e) {
      if (isApiError(e, 'BLOCK_CONFLICTS')) {
        // Booked between our check and the save.
        const list = e.details.appointments as InTheWay[] | undefined
        setInTheWay(Array.isArray(list) ? list : [])
      }
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page back="/salon/day" title={kind === 'BREAK' ? t('day.addBreakTitle') : t('day.addLeaveTitle')} leaveWarning={unsavedWarning(unsaved)}>
      {rights.leave && (
        <div className="flex gap-2" role="group" aria-label={t('day.kind')}>
          <Chip selected={kind === 'BREAK'} onClick={() => setKind('BREAK')}>
            {t('day.break')}
          </Chip>
          <Chip selected={kind === 'LEAVE'} onClick={() => setKind('LEAVE')}>
            {t('day.leaveWholeDays')}
          </Chip>
        </div>
      )}

      {ownOnly ? (
        chosen ? (
          <p className="text-sm text-muted">{t('day.forBarber', { name: chosen.name })}</p>
        ) : (
          <Banner tone="warn">{t('day.openFromColumn')}</Banner>
        )
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('day.barber')}>
          {barbers.map((b) => (
            <Chip key={b.id} selected={staffId === b.id} onClick={() => setStaffId(b.id)}>
              {b.name}
            </Chip>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-4">
        {kind === 'BREAK' ? (
          <>
            <Field id="break-date" label={t('day.breakDay')} type="date" min={today} max={addDays(today, ownOnly ? 1 : AHEAD_DAYS)} value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Field id="break-from" label={t('day.breakFrom')} type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} />
              <Field id="break-to" label={t('day.breakTo')} type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id="leave-from" label={t('day.firstDay')} type="date" min={today} max={addDays(today, AHEAD_DAYS)} value={firstDay} onChange={(e) => setFirstDay(e.target.value)} />
            <Field id="leave-to" label={t('day.lastDay')} type="date" min={firstDay} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </div>
        )}
        <p className="text-sm text-muted">{chosen ? t('day.cantBookName', { name: chosen.name }) : t('day.cantBookBarber')}</p>
        {ownOnly && <p className="text-sm text-muted">{t('day.ownBreaksNote')}</p>}
      </Card>

      {inTheWay && (
        <Card className="flex flex-col gap-2 border-warn/50">
          <p className="font-semibold">
            {inTheWay.length ? t('day.alreadyBooked', { count: inTheWay.length }) : t('day.somethingBooked')}
          </p>
          <p className="text-sm text-muted">{t('day.moveThenSave')}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {inTheWay.map((a) => (
              <li key={a.id}>
                <Link className="text-link underline" to={`/salon/day?date=${dateOfIst(a.startsAt)}`}>
                  {dateTimeIst(a.startsAt)}–{timeIst(a.endsAt)}
                  {'customerName' in a && a.customerName ? ` · ${a.customerName}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {error && <ErrorBanner message={error} />}
      <Button busy={busy} disabled={!chosen} onClick={save}>
        {kind === 'BREAK' ? t('day.saveBreak') : t('day.saveLeave')}
      </Button>
    </Page>
  )
}
