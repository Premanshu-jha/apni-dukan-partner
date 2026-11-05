import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { dayApi, salonKeys, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment, InTheWay } from '../../api/types'
import { Banner, Button, Card, Chip, ErrorState, Field, Loading, Page } from '../../components/ui'
import { addDays, dateOfIst, dateTimeIst, istInstant, timeIst, todayIst } from '../../lib/ist'
import { can, myStaff } from '../../lib/roles'
import { useSession } from '../../store/session'

type Kind = 'BREAK' | 'LEAVE'

/** The backend's limits: a break at most 12 hours, leave at most 30 days. */
export const MAX_LEAVE_DAYS = 30

/** The time range a form fill means, or an error to show. Leave covers whole India days, last day included. */
export function blockRange(
  kind: Kind,
  f: { date: string; from: string; to: string; firstDay: string; lastDay: string },
): { startAt: string; endAt: string } | { error: string } {
  if (kind === 'BREAK') {
    if (!f.from || !f.to) return { error: 'Pick a start and an end time.' }
    if (f.to <= f.from) return { error: 'The end must be after the start.' }
    return { startAt: istInstant(f.date, f.from), endAt: istInstant(f.date, f.to) }
  }
  if (!f.firstDay || !f.lastDay) return { error: 'Pick the first and last day.' }
  if (f.lastDay < f.firstDay) return { error: 'The last day must be on or after the first day.' }
  if (f.lastDay > addDays(f.firstDay, MAX_LEAVE_DAYS - 1)) return { error: `Leave can be at most ${MAX_LEAVE_DAYS} days at a time.` }
  return { startAt: istInstant(f.firstDay, '00:00'), endAt: istInstant(addDays(f.lastDay, 1), '00:00') }
}

/**
 * A break (owner, helper, or the barber for himself) or leave (owner only). Bookings in the way must be moved or
 * cancelled first: the backend refuses with BLOCK_CONFLICTS, so we check first and list them.
 */
export function TimeOff() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const rights = can(shop.myRole)
  const user = useSession((s) => s.user)
  const staff = useStaff()
  const [params] = useSearchParams()
  const today = todayIst()
  const me = myStaff(staff.data, user?.phone)
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

  const barbers = shop.myRole === 'BARBER' ? (me ? [me] : []) : staff.data.filter((s) => s.active)
  const chosen = barbers.find((b) => b.id === (shop.myRole === 'BARBER' ? me?.id : staffId)) ?? null

  async function save() {
    if (!chosen || busy) return
    const range = blockRange(kind, { date, from, to, firstDay, lastDay })
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
      await qc.invalidateQueries({ queryKey: salonKeys.all })
      navigate(`/salon/day?date=${dateOfIst(range.startAt)}`, { replace: true })
    } catch (e) {
      if (isApiError(e, 'BLOCK_CONFLICTS')) {
        // Booked between our check and the save.
        const list = e.details.appointments as InTheWay[] | undefined
        setInTheWay(Array.isArray(list) ? list : [])
      }
      setError(fieldError(e, 'endAt') ? `End ${fieldError(e, 'endAt')}.` : messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page back="/salon/day" title={kind === 'BREAK' ? 'Add a break' : 'Add leave'}>
      {rights.leave && (
        <div className="flex gap-2" role="group" aria-label="Kind">
          <Chip selected={kind === 'BREAK'} onClick={() => setKind('BREAK')}>
            Break
          </Chip>
          <Chip selected={kind === 'LEAVE'} onClick={() => setKind('LEAVE')}>
            Leave (whole days)
          </Chip>
        </div>
      )}

      {shop.myRole === 'BARBER' ? (
        !me && <Banner tone="warn">Your sign-in isn't linked to a barber profile. Ask the owner.</Banner>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Barber">
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
            <Field id="break-date" label="Day" type="date" min={today} max={addDays(today, 60)} value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Field id="break-from" label="From" type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} />
              <Field id="break-to" label="To" type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id="leave-from" label="First day" type="date" min={today} value={firstDay} onChange={(e) => setFirstDay(e.target.value)} />
            <Field id="leave-to" label="Last day" type="date" min={firstDay} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
          </div>
        )}
        <p className="text-sm text-muted">Customers can't book {chosen?.name ?? 'the barber'} in this time. India time.</p>
      </Card>

      {inTheWay && (
        <Card className="flex flex-col gap-2 border-warn/50">
          <p className="font-semibold">
            {inTheWay.length ? `${inTheWay.length} already booked in this time` : 'Something is already booked in this time'}
          </p>
          <p className="text-sm text-muted">Give these to another barber or cancel them on the day board, then save again.</p>
          <ul className="flex flex-col gap-1 text-sm">
            {inTheWay.map((a) => (
              <li key={a.id}>
                <Link className="text-brand underline" to={`/salon/day?date=${dateOfIst(a.startsAt)}`}>
                  {dateTimeIst(a.startsAt)}–{timeIst(a.endsAt)}
                  {'customerName' in a && a.customerName ? ` · ${a.customerName}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <Button busy={busy} disabled={!chosen} onClick={save}>
        Save {kind === 'BREAK' ? 'break' : 'leave'}
      </Button>
    </Page>
  )
}
