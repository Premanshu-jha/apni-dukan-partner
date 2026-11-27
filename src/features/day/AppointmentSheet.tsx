import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { explain, isApiError } from '../../api/errors'
import { dayApi, useStaff, refreshSalonWork } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { Appointment, BarberColumn } from '../../api/types'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Chip, Sheet, TextArea } from '../../components/ui'
import { dateOfIst, dateTimeIst, timeIst } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { formatPhone } from '../../lib/phone'
import { can } from '../../lib/roles'
import { t, useT } from '../../i18n'
import { useNow } from '../../lib/useNow'
import { helpHref } from '../help/links'
import { HelpIcon } from '../help/HelpButton'
import { SheetContext } from '../../components/sheetState'
import { kindText, servicesText, statusText, statusTextOr, totalPaise, whoText } from './status'

type Mode = 'menu' | 'start' | 'finish' | 'noShow' | 'reassign' | 'cancel' | 'removeBlock'

/** The backend's late allowance (SalonDayService.LATE_ALLOWANCE), used only if an answer has no noShowFrom. */
const LATE_ALLOWANCE_MS = 10 * 60_000

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
  const t = useT()
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
      refreshSalonWork(qc)
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
  // The backend's windows: Start from 15 minutes before until the customer is no longer held (noShowFrom: the start
  // plus the backend's late allowance, 10 minutes); undo a no-show within 24 hours
  const startMs = new Date(a.startsAt).getTime()
  const startFrom = startMs - 15 * 60_000
  const heldUntil = a.noShowFrom ? new Date(a.noShowFrom).getTime() : startMs + LATE_ALLOWANCE_MS
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

  // Help from the booking itself, at the top in every step (the sheet covers the screen's Help, and the code step is
  // where a refusal shows): its number, time and the words the app showed go with it
  const bookingHelp = (
    <SheetButton
      onClick={() =>
        navigate(
          helpHref({
            // Back to this booking's day after sending (not today's)
            from: `/salon/day?date=${dateOfIst(a.startsAt)}`,
            about: a.bookingNo ? t('help.topicBooking', { number: a.bookingNo }) : t('help.topicWalkIn'),
            text:
              `${a.bookingNo ? `${a.bookingNo} · ` : ''}${dateTimeIst(a.startsAt)} · ${servicesText(a)}${barberName ? ` · ${barberName}` : ''}\n` +
              (error ? t('help.errorText', { message: error }) : ''),
            write: true,
          }),
        )
      }
    >
      <HelpIcon />
      {t('help.sheetHelp')}
    </SheetButton>
  )
  return (
    <Sheet open busy={busy} title={block ? kindText(a) : whoText(a)} onClose={onClose} help={block ? undefined : bookingHelp}>
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
                {a.bookingNo && ` · ${a.bookingNo}`} · {statusText(a.status)}
              </p>
              <p>{servicesText(a)}</p>
              <p className="font-semibold">{rupees(total.paise, total.from)}</p>
            </>
          )}
          {a.cancelReason && <p className="text-muted">{t('day.cancelReasonShown', { reason: a.cancelReason })}</p>}
          {a.status === 'IN_SERVICE' && a.startedWithCode === false && <p className="text-muted">{t('day.startedWithoutCode')}</p>}
          {a.notStarted && confirmed && <Banner tone="warn">{t('day.timeHasStarted')}</Banner>}
        </div>

        {gone && <Banner tone="warn">{t('day.sheetGone')}</Banner>}
        {done && <Banner tone="good">{done}</Banner>}
        {error && <Banner tone="bad">{error}</Banner>}

        {readOnly ? null : mode === 'menu' ? (
          <div className="flex flex-col gap-2">
            {confirmed && !block && mine && startOpen && (
              <Button onClick={() => (booking ? setMode('start') : run(() => dayApi.start(a.id, {}), t('day.doneStarted')))} busy={busy && !booking}>
                {t('day.start')}
              </Button>
            )}
            {confirmed && !block && mine && now < startFrom && (
              <p className="text-sm text-muted">{t('day.startOpensAt', { time: timeIst(new Date(startFrom).toISOString()) })}</p>
            )}
            {inChair && mayFinish && beforeEnd && (
              <Button variant="secondary" onClick={() => setMode('finish')}>
                {t('day.doneEarly')}
              </Button>
            )}
            {confirmed && !block && rights.callCustomer && a.customerPhone && (
              <a
                href={`tel:+91${a.customerPhone}`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-raised px-5"
              >
                {t('day.callPhone', { phone: formatPhone(a.customerPhone) })}
              </a>
            )}
            {confirmed && !block && mine && (
              <Button variant="secondary" disabled={!noShowOpen} onClick={() => setMode('noShow')}>
                {noShowOpen ? t('day.markNoShow') : t('day.noShowFrom', { time: timeIst(a.noShowFrom ?? a.startsAt) })}
              </Button>
            )}
            {canReassign && (
              <Button variant="secondary" onClick={() => setMode('reassign')}>
                {t('day.giveToAnother')}
              </Button>
            )}
            {walkInInChair && mayFix && !canCancel && (
              <p className="text-sm text-muted">{t('day.inChairTooLong', { minutes: MISTAKE_MINUTES })}</p>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setMode('cancel')}>
                {booking ? t('day.cancelBooking') : t('day.cancelWalkIn')}
              </Button>
            )}
            {a.status === 'NO_SHOW' && rights.undoNoShow && undoOpen && (
              <Button variant="secondary" busy={busy} onClick={() => run(() => dayApi.undoNoShow(a.id), t('day.doneNoShowUndone'))}>
                {t('day.undoNoShow')}
              </Button>
            )}
            {canRemoveBlock && (
              <Button variant="secondary" onClick={() => setMode('removeBlock')}>
                {a.blockType === 'LEAVE' ? t('day.removeLeave') : t('day.removeBreak')}
              </Button>
            )}
            {block && a.blockType === 'CLOSED' && rights.closures && (
              <Button variant="secondary" onClick={() => navigate('/salon/closures')}>
                {t('day.closedDays')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        ) : mode === 'start' ? (
          <div className="flex flex-col gap-3">
            <CodeInput id="start-code" label={t('day.startCodeLabel')} length={4} value={code} onChange={setCode} />
            <p className="text-sm text-muted">{t('day.startCodeHint')}</p>
            {!startOpen && <Banner tone="warn">{now < startFrom ? t('day.startClosedOpensAt', { time: timeIst(new Date(startFrom).toISOString()) }) : t('day.startClosedHoldOver', { time: timeIst(new Date(heldUntil).toISOString()) })}</Banner>}
            <Button busy={busy} disabled={code.length !== 4 || !startOpen} onClick={() => run(() => dayApi.start(a.id, { code }), t('day.doneStarted'))}>
              {t('day.start')}
            </Button>
            {rights.startWithoutCode ? (
              <Button variant="ghost" disabled={busy || !startOpen} onClick={() => run(() => dayApi.start(a.id, { withoutCode: true }), t('day.doneStartedNoCode'))}>
                {t('day.startAnyway')}
              </Button>
            ) : (
              // A barber can't start without the code: who can, said right here (not only in the first-time tips)
              <p className="text-sm text-muted">{t('day.startCodeAskOwner')}</p>
            )}
            <Button variant="ghost" onClick={() => setMode('menu')}>
              {t('common.back')}
            </Button>
          </div>
        ) : mode === 'finish' ? (
          <Confirm
            text={t('day.confirmFinish')}
            action={t('day.doneEarly')}
            busy={busy}
            onYes={() => run(() => dayApi.finish(a.id), t('day.doneFinished'))}
            onNo={() => setMode('menu')}
          />
        ) : mode === 'noShow' ? (
          <Confirm
            text={
              booking
                ? t('day.confirmNoShowBooking')
                : t('day.confirmNoShowWalkIn')
            }
            action={t('day.markNoShow')}
            busy={busy}
            onYes={() => run(() => dayApi.noShow(a.id), t('day.doneNoShow'))}
            onNo={() => setMode('menu')}
          />
        ) : mode === 'reassign' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {walkInInChair
                ? t('day.reassignInChair')
                : t('day.reassignBooked')}
            </p>
            <div className="flex flex-wrap gap-2">
              {others.map((b) => (
                <Chip key={b.staffId} selected={target === b.staffId} onClick={() => setTarget(b.staffId)}>
                  {b.name}
                </Chip>
              ))}
            </div>
            <Button busy={busy} disabled={!target} onClick={() => run(() => dayApi.reassign(a.id, target!), t('day.doneReassigned'))}>
              {t('day.giveTo', { name: others.find((b) => b.staffId === target)?.name ?? '…' })}
            </Button>
            <Button variant="ghost" onClick={() => setMode('menu')}>
              {t('common.back')}
            </Button>
          </div>
        ) : mode === 'cancel' ? (
          <div className="flex flex-col gap-3">
            <TextArea
              id="cancel-reason"
              label={booking ? t('day.cancelReasonSent') : t('day.cancelReason')}
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('day.cancelReasonExample')}
              hint={`${reason.trim().length}/200`}
            />
            <Button
              variant="danger"
              busy={busy}
              disabled={reason.trim().length < 2}
              onClick={() => run(() => dayApi.cancel(a.id, reason.trim()), booking ? t('day.doneCancelledBooking') : t('day.doneCancelled'))}
            >
              {booking ? t('day.cancelBooking') : t('day.cancelWalkIn')}
            </Button>
            <Button variant="ghost" onClick={() => setMode('menu')}>
              {t('common.back')}
            </Button>
          </div>
        ) : (
          <Confirm
            text={t('day.confirmRemoveBlock')}
            action={a.blockType === 'LEAVE' ? t('day.removeLeave') : t('day.removeBreak')}
            busy={busy}
            onYes={() =>
              run(async () => {
                await dayApi.removeBlock(a.staffId, a.id)
                onClose()
              }, t('day.doneRemoved'))
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
    return t('day.triesLeft', { message: explain(e), count: left })
  }
  if (isApiError(e, 'WRONG_STATUS') && e.details.reason === 'CHANGED' && typeof e.details.status === 'string') {
    return t('day.statusChanged', { status: statusTextOr(e.details.status) })
  }
  return explain(e)
}

function Confirm({ text, action, busy, onYes, onNo }: { text: string; action: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">{text}</p>
      <Button variant="danger" busy={busy} onClick={onYes}>
        {action}
      </Button>
      <Button variant="ghost" onClick={onNo}>
        {t('common.back')}
      </Button>
    </div>
  )
}

/**
 * The booking's help button in the sheet's header: never while something is on its way, and asking first when a
 * reason or a code was typed (the sheet goes when Help opens).
 */
function SheetButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const t = useT()
  const sheet = useContext(SheetContext)
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1.5 px-1 text-right text-sm text-link underline"
      onClick={() => {
        if (sheet?.busy()) return
        if (sheet?.typed() && !window.confirm(t('help.leaveUnsaved'))) return
        onClick()
      }}
    >
      {children}
    </button>
  )
}
