import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { explain, isApiError } from '../../api/errors'
import { dayApi, salonKeys, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment, BarberColumn } from '../../api/types'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Chip, Sheet, TextArea } from '../../components/ui'
import { dateOfIst, dateTimeIst, timeIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { formatPhone } from '../../lib/phone'
import { can } from '../../lib/roles'
import { useNow } from '../../lib/useNow'
import { kindText, servicesText, statusText, totalPaise, whoText } from './status'

type Mode = 'menu' | 'start' | 'finish' | 'noShow' | 'reassign' | 'cancel' | 'removeBlock'

/** A walk-in already in the chair can be cancelled as a mistake only this soon after it started (the backend's rule). */
export const MISTAKE_MINUTES = 15

/**
 * Everything staff can do to one appointment. Each action locks its buttons while it runs (a double tap sends
 * one request). Any refusal reloads the day: usually the customer or someone else changed it first.
 */
export function AppointmentSheet({
  a,
  barbers,
  readOnly,
  gone = false,
  myStaffId = null,
  onClose,
}: {
  a: Appointment
  barbers: BarberColumn[]
  readOnly: boolean
  /** The barber's own profile (from the day), so a barber who sees every column acts only on his own. */
  myStaffId?: string | null
  /** No longer on this day's board (moved by the customer, or given to a barber this person can't see). */
  gone?: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const rights = can(shop.myRole)
  const [mode, setMode] = useState<Mode>('menu')
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>, message: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await action()
      setDone(message)
      setMode('menu')
    } catch (e) {
      setError(sheetError(e))
      if (isApiError(e, 'WRONG_START_CODE') || isApiError(e, 'START_CODE_LOCKED') || isApiError(e, 'VALIDATION_FAILED')) setCode('')
    } finally {
      setBusy(false)
      // Whatever happened, show the day as the backend has it now.
      void qc.invalidateQueries({ queryKey: salonKeys.all })
    }
  }

  // Each step of the sheet replaces the button that had focus: put focus on the new step's first control.
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    body.current?.querySelector<HTMLElement>('input, textarea, button:not([disabled]), a[href]')?.focus()
  }, [mode])

  const total = totalPaise(a)
  const booking = a.kind === 'BOOKING'
  const block = a.kind === 'BLOCK'
  const confirmed = a.status === 'CONFIRMED'
  // Ticks, so "No-show from 4:45 PM" turns on by itself while the sheet is open.
  const now = useNow(15_000)
  const noShowOpen = a.noShowFrom ? now >= new Date(a.noShowFrom).getTime() : false
  // The backend's windows: Start from 15 minutes before until 15 after; undo a no-show within 24 hours
  const startMs = new Date(a.startsAt).getTime()
  const startFrom = startMs - 15 * 60_000
  const heldUntil = startMs + 15 * 60_000
  const startOpen = now >= startFrom && now < heldUntil
  const undoOpen = now <= startMs + 24 * 3600_000
  const beforeEnd = now < new Date(a.endsAt).getTime()
  // Only barbers who can take it: working here and doing every one of its services
  const staffList = useStaff().data
  const needs = a.services.map((s) => s.serviceId)
  const others = barbers.filter(
    (b) =>
      b.staffId !== a.staffId &&
      (staffList === undefined ||
        staffList.some((s) => s.id === b.staffId && s.active && needs.every((n) => s.serviceIds.includes(n)))),
  )
  const barberName = barbers.find((b) => b.staffId === a.staffId)?.name

  // Who may do what here (the backend checks the same): a barber works his own column only; a walk-in still in the
  // chair can be fixed (moved, or cancelled in its first 15 minutes) by the owner, a helper or whoever added it.
  const ownerOrHelper = shop.myRole !== 'BARBER'
  const mine = ownerOrHelper || a.staffId === myStaffId
  const inChair = a.status === 'IN_SERVICE'
  const walkInInChair = a.kind === 'WALK_IN' && inChair
  const addedInChair = walkInInChair && a.addedByMe
  const mayFix = rights.cancel || addedInChair
  const mayFinish = mine || addedInChair
  // Counted from when it was put in a chair; moving it to another barber doesn't restart it
  const mistakeUntil = new Date(a.startedAt ?? a.startsAt).getTime() + MISTAKE_MINUTES * 60_000
  const canReassign = mayFix && (confirmed || walkInInChair) && others.length > 0
  const canCancel = mayFix && (confirmed || (walkInInChair && now < mistakeUntil))
  const canRemoveBlock =
    block &&
    a.status === 'BLOCKED' &&
    a.blockType !== 'CLOSED' &&
    (a.blockType === 'LEAVE' ? rights.leave : ownerOrHelper || (a.addedByMe && now < startMs))   // a barber: before it starts

  return (
    <Sheet open title={block ? kindText(a) : whoText(a)} onClose={onClose}>
      <div ref={body} className="flex max-h-[75dvh] flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col gap-1 text-sm">
          <p>
            {dateTimeIst(a.startsAt)} – {dateOfIst(a.endsAt) === dateOfIst(a.startsAt) ? timeIst(a.endsAt) : dateTimeIst(a.endsAt)}
            {barberName && ` · ${barberName}`}
          </p>
          {!block && (
            <>
              <p className="text-muted">
                {kindText(a)}
                {a.bookingNo && ` · ${a.bookingNo}`} · {statusText[a.status]}
              </p>
              <p>{servicesText(a)}</p>
              <p className="font-semibold">{rupees(total.paise, total.from)}</p>
            </>
          )}
          {a.cancelReason && <p className="text-muted">Reason: {a.cancelReason}</p>}
          {a.status === 'IN_SERVICE' && a.startedWithCode === false && <p className="text-muted">Started without the customer's code.</p>}
          {a.notStarted && confirmed && <Banner tone="warn">Its time has started. Press Start when the customer is here.</Banner>}
        </div>

        {gone && <Banner tone="warn">This isn't on this day's board any more: the customer may have moved it, or it went to another barber.</Banner>}
        {done && <Banner tone="good">{done}</Banner>}
        {error && <Banner tone="bad">{error}</Banner>}

        {readOnly ? null : mode === 'menu' ? (
          <div className="flex flex-col gap-2">
            {confirmed && !block && mine && startOpen && (
              <Button onClick={() => (booking ? setMode('start') : run(() => dayApi.start(a.id, {}), 'Started.'))} busy={busy && !booking}>
                Start
              </Button>
            )}
            {confirmed && !block && mine && now < startFrom && (
              <p className="text-sm text-muted">Start opens at {timeIst(new Date(startFrom).toISOString())}, 15 minutes before.</p>
            )}
            {inChair && mayFinish && beforeEnd && (
              <Button variant="secondary" onClick={() => setMode('finish')}>
                Done early
              </Button>
            )}
            {confirmed && !block && rights.callCustomer && a.customerPhone && (
              <a
                href={`tel:+91${a.customerPhone}`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-raised px-5"
              >
                Call {formatPhone(a.customerPhone)}
              </a>
            )}
            {confirmed && !block && mine && (
              <Button variant="secondary" disabled={!noShowOpen} onClick={() => setMode('noShow')}>
                {noShowOpen ? 'Mark no-show' : `No-show from ${timeIst(a.noShowFrom ?? a.startsAt)}`}
              </Button>
            )}
            {canReassign && (
              <Button variant="secondary" onClick={() => setMode('reassign')}>
                Give to another barber
              </Button>
            )}
            {walkInInChair && mayFix && !canCancel && (
              <p className="text-sm text-muted">In the chair for over {MISTAKE_MINUTES} minutes: use Done early instead of cancelling.</p>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setMode('cancel')}>
                Cancel {booking ? 'booking' : 'walk-in'}
              </Button>
            )}
            {a.status === 'NO_SHOW' && rights.undoNoShow && undoOpen && (
              <Button variant="secondary" busy={busy} onClick={() => run(() => dayApi.undoNoShow(a.id), 'No-show undone.')}>
                Undo no-show
              </Button>
            )}
            {canRemoveBlock && (
              <Button variant="secondary" onClick={() => setMode('removeBlock')}>
                Remove {a.blockType === 'LEAVE' ? 'leave' : 'break'}
              </Button>
            )}
            {block && a.blockType === 'CLOSED' && rights.closures && (
              <Button variant="secondary" onClick={() => navigate('/salon/closures')}>
                Closed days
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : mode === 'start' ? (
          <div className="flex flex-col gap-3">
            <CodeInput id="start-code" label="The customer's 4-digit code" length={4} value={code} onChange={setCode} />
            <p className="text-sm text-muted">It is on the customer's booking screen. The code shows they are here.</p>
            {!startOpen && <Banner tone="warn">Start is closed now: {now < startFrom ? `it opens at ${timeIst(new Date(startFrom).toISOString())}` : 'the 15-minute hold is over'}.</Banner>}
            <Button busy={busy} disabled={code.length !== 4 || !startOpen} onClick={() => run(() => dayApi.start(a.id, { code }), 'Started.')}>
              Start
            </Button>
            {rights.startWithoutCode && (
              <Button variant="ghost" disabled={busy || !startOpen} onClick={() => run(() => dayApi.start(a.id, { withoutCode: true }), 'Started without a code.')}>
                Customer can't show the code: start anyway
              </Button>
            )}
            <Button variant="ghost" onClick={() => setMode('menu')}>
              Back
            </Button>
          </div>
        ) : mode === 'finish' ? (
          <Confirm
            text="The customer is done: the rest of this time becomes free for others. This can't be undone."
            action="Done early"
            busy={busy}
            onYes={() => run(() => dayApi.finish(a.id), 'Done. The rest of the time is free.')}
            onNo={() => setMode('menu')}
          />
        ) : mode === 'noShow' ? (
          <Confirm
            text={
              booking
                ? 'The customer didn’t come. Their time is freed and they get a missed-booking strike.'
                : 'The walk-in left. Their time is freed.'
            }
            action="Mark no-show"
            busy={busy}
            onYes={() => run(() => dayApi.noShow(a.id), 'Marked as no-show.')}
            onNo={() => setMode('menu')}
          />
        ) : mode === 'reassign' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {walkInInChair
                ? 'The rest of the visit moves to him from now. He must do these services and be free now.'
                : 'Same time, another barber. He must do these services and be free then.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {others.map((b) => (
                <Chip key={b.staffId} selected={target === b.staffId} onClick={() => setTarget(b.staffId)}>
                  {b.name}
                </Chip>
              ))}
            </div>
            <Button busy={busy} disabled={!target} onClick={() => run(() => dayApi.reassign(a.id, target!), 'Given to another barber.')}>
              Give to {others.find((b) => b.staffId === target)?.name ?? '…'}
            </Button>
            <Button variant="ghost" onClick={() => setMode('menu')}>
              Back
            </Button>
          </div>
        ) : mode === 'cancel' ? (
          <div className="flex flex-col gap-3">
            <TextArea
              id="cancel-reason"
              label={booking ? 'Reason (sent to the customer)' : 'Reason'}
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Barber is unwell today"
              hint={`${reason.trim().length}/200`}
            />
            <Button
              variant="danger"
              busy={busy}
              disabled={reason.trim().length < 2}
              onClick={() => run(() => dayApi.cancel(a.id, reason.trim()), booking ? 'Cancelled. The customer has been told.' : 'Cancelled.')}
            >
              Cancel {booking ? 'booking' : 'walk-in'}
            </Button>
            <Button variant="ghost" onClick={() => setMode('menu')}>
              Back
            </Button>
          </div>
        ) : (
          <Confirm
            text="This time becomes free for bookings again."
            action={`Remove ${a.blockType === 'LEAVE' ? 'leave' : 'break'}`}
            busy={busy}
            onYes={() =>
              run(async () => {
                await dayApi.removeBlock(a.staffId, a.id)
                onClose()
              }, 'Removed.')
            }
            onNo={() => setMode('menu')}
          />
        )}
      </div>
    </Sheet>
  )
}

/** The words for a refusal here, using the backend's details where they say more than its message. */
export function sheetError(e: unknown): string {
  if (isApiError(e, 'WRONG_START_CODE') && typeof e.details.triesLeft === 'number') {
    const left = e.details.triesLeft
    return `${explain(e)} ${left} ${left === 1 ? 'try' : 'tries'} left.`
  }
  if (isApiError(e, 'WRONG_STATUS') && e.details.reason === 'CHANGED' && typeof e.details.status === 'string') {
    const now = statusText[e.details.status as keyof typeof statusText] ?? e.details.status
    return `Someone changed it meanwhile: it is now "${now}".`
  }
  return explain(e)
}

function Confirm({ text, action, busy, onYes, onNo }: { text: string; action: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{text}</p>
      <Button variant="danger" busy={busy} onClick={onYes}>
        {action}
      </Button>
      <Button variant="ghost" onClick={onNo}>
        Back
      </Button>
    </div>
  )
}
