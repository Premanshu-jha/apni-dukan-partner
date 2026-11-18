import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useBill, useBills, useDay, type Bill, type ChangeResult, type KhataCustomer, type PaidBy, type Payment } from '../../api/kirana'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Page, Pill, Sheet } from '../../components/ui'
import { addDays, dateOfIst, dateTimeIst, dayLabel, timeIst, todayIst } from '../../lib/ist'
import { HELPER_MINUTES, parseQty, parseRupees, qtyText, qtyWithUnit, toMilli } from '../../lib/kirana'
import { rupees } from '../../lib/money'
import { useSession } from '../../store/session'
import { minutesSince, MoreButton, outcomeUnknown, paidByText, paymentText, SumRow, UnsureNote, useRefreshOnStale, useUnsureSend } from './common'
import { KhataPicker } from './KhataPicker'
import { UpiQrCode } from './UpiQrCode'

/** Bills: today's totals at the top (the full day one tap away), then every bill, newest first. */
export function Bills() {
  const bills = useBills()
  const today = useDay(null)
  return (
    <Page title="Bills">
      <Link to="/kirana/day" className="block">
        <Card className="flex flex-col gap-1 hover:bg-raised">
          <p className="font-semibold">Today</p>
          {today.data ? (
            <>
              <SumRow label={`${today.data.bills} ${today.data.bills === 1 ? 'bill' : 'bills'}`} value={rupees(today.data.salesPaise)} />
              <SumRow label="Cash in the drawer should be up by" value={rupees(today.data.cashInPaise)} />
              <SumRow label="UPI in" value={rupees(today.data.upiInPaise)} />
            </>
          ) : today.isError ? (
            <p className="text-sm text-bad">{messageOf(today.error)}</p>
          ) : (
            <p className="text-sm text-muted">…</p>
          )}
          <span className="text-sm text-link">See the whole day ›</span>
        </Card>
      </Link>
      {bills.isPending ? (
        <Loading />
      ) : bills.isError && !bills.data ? (
        <ErrorState message={messageOf(bills.error)} onRetry={() => bills.refetch()} />
      ) : bills.data.pages[0].items.length === 0 ? (
        <EmptyState title="No bills yet" body="Bills made at the counter show here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {bills.data.pages.flatMap((p) => p.items).map((b) => (
            <li key={b.id}>
              <Link to={`/kirana/bills/${b.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-raised">
                <span className="min-w-0">
                  <span className="block font-medium">
                    Bill {b.billNo} · {timeIst(b.createdAt)}
                    {dateOfIst(b.createdAt) !== todayIst() && <span className="text-muted"> · {dayLabel(dateOfIst(b.createdAt))}</span>}
                  </span>
                  <span className="block text-xs text-muted break-words">
                    {b.preview}
                    {b.lines > 3 && ` +${b.lines - 3} more`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`font-semibold ${b.voided ? 'line-through text-muted' : ''}`}>{rupees(b.totalPaise)}</span>
                  {b.voided ? (
                    <Pill tone="bad">Cancelled</Pill>
                  ) : (
                    <Pill tone={b.payment === 'KHATA' ? 'warn' : 'muted'}>
                      {b.payment === 'KHATA' ? `Khata${b.khataCustomerName ? `: ${b.khataCustomerName}` : ''}` : paymentText(b.payment)}
                    </Pill>
                  )}
                  {b.refundedPaise > 0 && !b.voided && <span className="text-xs text-muted">{rupees(b.refundedPaise)} returned</span>}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <MoreButton shown={bills.hasNextPage} busy={bills.isFetchingNextPage} onClick={() => void bills.fetchNextPage()} />
          </li>
        </ul>
      )}
    </Page>
  )
}

/**
 * One bill: its lines, discount and payment, returns and payment changes, and what can be done with it: cancel it,
 * take items back, or change how it was paid. A helper only on his own bill within 10 minutes; the owner always.
 */
export function BillPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const back = typeof from === 'string' && from.startsWith('/kirana/') ? from : '/kirana/bills'
  const bill = useBill(id)
  const shop = useShop()
  const userId = useSession((s) => s.user?.id ?? '')
  const [action, setAction] = useState<'cancel' | 'return' | 'payment' | null>(null)
  const [changed, setChanged] = useState<ChangeResult | null>(null)
  const [qrBusy, setQrBusy] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  if (bill.isPending) return <Page back={back} title="Bill"><Loading /></Page>
  if (bill.isError && !bill.data) {
    return (
      <Page back={back} title="Bill">
        <ErrorState message={messageOf(bill.error)} onRetry={() => bill.refetch()} />
      </Page>
    )
  }
  const b = bill.data
  const owner = shop.myRole === 'OWNER'
  // By who made it, not the name: two helpers can share a name, and a name can change
  const mine = !!b.byId && b.byId === userId
  const inWindow = minutesSince(b.createdAt) < HELPER_MINUTES
  const mayChange = !b.voidedAt && (owner || (mine && inWindow))
  const returnsLeft = b.lines.some((l) => l.quantity > l.returnedQuantity)
  return (
    <Page back={back} title={`Bill ${b.billNo}`}>
      {b.voidedAt && <Banner tone="bad">Cancelled {dateTimeIst(b.voidedAt)}: {b.voidReason}</Banner>}
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          {dateTimeIst(b.createdAt)}
          {b.byName && ` · by ${b.byName}`}
        </p>
        <ul className="flex flex-col gap-1">
          {b.lines.map((l) => (
            <li key={l.lineNo} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block break-words">{l.name}</span>
                <span className="block text-xs text-muted">
                  {qtyWithUnit(toMilli(l.quantity), l.unit)} × {rupees(l.pricePaise)}
                  {l.unit === 'KG' ? '/kg' : ''}
                  {!l.productId && ' · not in your list'}
                  {l.returnedQuantity > 0 && ` · ${qtyText(toMilli(l.returnedQuantity))} returned`}
                </span>
              </span>
              <span className="shrink-0">{rupees(l.amountPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line pt-2">
          {b.discountPaise > 0 && (
            <>
              <SumRow label="Items" value={rupees(b.subtotalPaise)} />
              <SumRow label="Discount" value={`−${rupees(b.discountPaise)}`} />
            </>
          )}
          <SumRow strong label="Total" value={rupees(b.totalPaise)} />
          <SumRow label="Paid by" value={payText(b)} />
          {b.refundedPaise > 0 && <SumRow label="Given back for returns" value={rupees(b.refundedPaise)} />}
        </div>
      </Card>

      {b.returns.length > 0 && (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">Returns</p>
          {b.returns.map((r) => (
            <p key={r.id} className="text-sm">
              {dateTimeIst(r.at)}: {rupees(r.refundPaise)}
              {r.offKhataPaise > 0 && ` (${rupees(r.offKhataPaise)} off the khata)`}
              {r.handBackPaise > 0 && ` (${rupees(r.handBackPaise)} handed back in ${paidByText(r.handBackBy)})`}
              {r.byName && ` · ${r.byName}`}
              {r.reason && ` · ${r.reason}`}
            </p>
          ))}
        </Card>
      )}
      {b.changes.length > 0 && (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">Payment changed</p>
          {b.changes.map((c, i) => (
            <p key={i} className="text-sm">
              {dateTimeIst(c.at)}: {paymentText(c.fromPayment)}
              {c.fromKhataCustomer && ` (${c.fromKhataCustomer.name})`} → {paymentText(c.toPayment)}
              {c.toKhataCustomer && ` (${c.toKhataCustomer.name})`}
              {c.byName && ` · ${c.byName}`}
            </p>
          ))}
        </Card>
      )}

      {!b.voidedAt && (
        mayChange ? (
          <div className="flex flex-col gap-2">
            {(b.payment === 'UPI' || (b.payment === 'KHATA' && b.paidNowBy === 'UPI' && b.paidNowPaise)) && b.returns.length === 0 && (
              <Button
                busy={qrBusy}
                onClick={async () => {
                  // The same payment again changes nothing and answers with the bill's QR (BillService.changePayment)
                  setQrBusy(true)
                  setQrError(null)
                  try {
                    setChanged(
                      await kiranaApi.changePayment(b.id, {
                        version: b.version,
                        payment: b.payment,
                        khataCustomerId: b.khataCustomer?.id,
                        paidNowPaise: b.paidNowPaise ?? undefined,
                        paidNowBy: b.paidNowBy ?? undefined,
                      }),
                    )
                  } catch (e) {
                    setQrError(messageOf(e))
                  } finally {
                    setQrBusy(false)
                  }
                }}
              >
                Show the UPI QR again
              </Button>
            )}
            {qrError && <Banner tone="bad">{qrError}</Banner>}
            {b.returns.length === 0 && (
              <Button variant="secondary" onClick={() => setAction('payment')}>
                Change how it was paid
              </Button>
            )}
            {returnsLeft && (
              <Button variant="secondary" onClick={() => setAction('return')}>
                Items brought back
              </Button>
            )}
            {b.returns.length === 0 && (
              <Button variant="ghost" className="text-bad" onClick={() => setAction('cancel')}>
                Cancel the bill
              </Button>
            )}
            {b.returns.length > 0 && <p className="text-xs text-muted">Items came back on this bill, so how it was paid stays as it is.</p>}
            {!owner && <p className="text-xs text-muted">You can change your own bill for {HELPER_MINUTES} minutes after making it.</p>}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Only the owner can change this bill now. A helper can change his own bill within {HELPER_MINUTES} minutes of making it.
          </p>
        )
      )}

      <Sheet open={action === 'cancel'} title={`Cancel bill ${b.billNo}?`} onClose={() => setAction(null)}>
        {action === 'cancel' && <CancelForm b={b} onDone={() => setAction(null)} />}
      </Sheet>
      <Sheet open={action === 'return'} title="Items brought back" onClose={() => setAction(null)}>
        {action === 'return' && <ReturnForm b={b} onDone={() => setAction(null)} />}
      </Sheet>
      <Sheet open={action === 'payment'} title="Change how it was paid" onClose={() => setAction(null)}>
        {action === 'payment' && (
          <ChangePaymentForm
            b={b}
            onDone={(r) => {
              setAction(null)
              if (r.upi || r.upiIdMissing) setChanged(r)
            }}
          />
        )}
      </Sheet>
      <Sheet open={changed !== null} title="Show this QR" onClose={() => setChanged(null)}>
        {changed?.upi && <UpiQrCode upi={changed.upi} />}
        {changed?.upiIdMissing && <Banner tone="warn">No QR: the shop's UPI ID isn't set.</Banner>}
        <Button className="mt-3 w-full" onClick={() => setChanged(null)}>
          Done
        </Button>
      </Sheet>
    </Page>
  )
}

function payText(b: Bill): string {
  if (b.payment !== 'KHATA') return paymentText(b.payment)
  const who = b.khataCustomer ? ` (${b.khataCustomer.name})` : ''
  if (b.paidNowPaise) return `Khata${who}: ${rupees(b.onKhataPaise)}; ${rupees(b.paidNowPaise)} paid now by ${paidByText(b.paidNowBy)}`
  return `Khata${who}`
}

function useAfterBillChange() {
  const qc = useQueryClient()
  return (next: Bill) => {
    qc.setQueryData(kiranaKeys.bill(next.id), next)
    void qc.invalidateQueries({ queryKey: kiranaKeys.all })
  }
}

function CancelForm({ b, onDone }: { b: Bill; onDone: () => void }) {
  const stale = useRefreshOnStale()
  const after = useAfterBillChange()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function save() {
    setBusy(true)
    setError(null)
    try {
      after((await kiranaApi.cancel(b.id, reason.trim())).bill)
      onDone()
    } catch (e) {
      stale(e)
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted">
        Its items go back into stock
        {b.payment === 'KHATA' ? ` and ${rupees(b.onKhataPaise)} comes off ${b.khataCustomer?.name ?? 'the'}'s khata` : ''}.
        {b.payment !== 'KHATA' || b.paidNowPaise ? ' Hand back what they paid: it counts as given back today.' : ''}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick reasons">
        {CANCEL_REASONS.map((r) => (
          <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>
            {r}
          </Chip>
        ))}
      </div>
      <Field id="cancel-reason" label="Why?" hint="Tap one above or write your own." value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} error={fieldError(error, 'reason')} />
      {error !== null && !fieldError(error, 'reason') && <Banner tone="bad">{messageOf(error)}</Banner>}
      <Button variant="danger" busy={busy} disabled={reason.trim().length < 2} onClick={save}>
        Cancel the bill
      </Button>
    </div>
  )
}

/** Choose what came back and how much: listed products go back into stock; the refund goes back the way it was paid. */
function ReturnForm({ b, onDone }: { b: Bill; onDone: () => void }) {
  const stale = useRefreshOnStale()
  const after = useAfterBillChange()
  const send = useUnsureSend<{ lines: { lineNo: number; quantity: number }[]; reason?: string }>(`return:${b.id}`)
  const held = send.unsure
  const left = b.lines.filter((l) => l.quantity > l.returnedQuantity || held?.lines.some((h) => h.lineNo === l.lineNo))
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries((held?.lines ?? []).map((h) => [h.lineNo, qtyText(toMilli(h.quantity))])),
  )
  const [reason, setReason] = useState(held?.reason ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    setError(null)
    if (held) return send2(held)
    const lines: { lineNo: number; quantity: number }[] = []
    for (const l of left) {
      const typed = qty[l.lineNo]?.trim()
      if (!typed) continue
      const q = parseQty(typed, l.unit)
      if ('error' in q) return setError(`${l.name}: ${q.error}`)
      const most = toMilli(l.quantity - l.returnedQuantity)
      if (q.milli > most) return setError(`${l.name}: at most ${qtyText(most)} can come back`)
      lines.push({ lineNo: l.lineNo, quantity: q.milli / 1000 })
    }
    if (!lines.length) return setError('Enter how much of an item came back')
    return send2({ lines, reason: reason.trim() || undefined })
  }
  async function send2(values: { lines: { lineNo: number; quantity: number }[]; reason?: string }) {
    setBusy(true)
    try {
      const r = await kiranaApi.returnItems(b.id, { clientRef: send.clientRef, ...values })
      send.settle()
      after(r.bill)
      onDone()
    } catch (e) {
      stale(e)
      if (outcomeUnknown(e)) send.keep(values)
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex max-h-[80dvh] flex-col gap-3 overflow-y-auto">
      {held && <UnsureNote what="return" onStartOver={() => { send.settle(); setError(null) }} />}
      {left.map((l) => {
        const most = toMilli(l.quantity - l.returnedQuantity)
        return (
          <div key={l.lineNo} className="flex items-end gap-3">
            <div className="flex-1">
              <Field
                id={`return-${l.lineNo}`}
                label={`${l.name} (up to ${qtyWithUnit(most, l.unit)})`}
                inputMode="decimal"
                value={qty[l.lineNo] ?? ''}
                disabled={!!held}
                onChange={(e) => setQty((q) => ({ ...q, [l.lineNo]: e.target.value }))}
              />
            </div>
            <Button variant="ghost" disabled={!!held} onClick={() => setQty((q) => ({ ...q, [l.lineNo]: qtyText(most) }))}>
              All
            </Button>
          </div>
        )
      })}
      <Field id="return-reason" label="Reason (optional)" value={reason} disabled={!!held} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      <p className="text-sm text-muted">
        {b.payment === 'KHATA' ? 'It comes off their khata first; anything they paid now is handed back as they paid it.' : `Hand back the refund in ${paidByText(b.payment === 'UPI' ? 'UPI' : 'CASH')}.`}
      </p>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button busy={busy} onClick={save}>
        Save the return
      </Button>
    </div>
  )
}

/** UPI failed and they paid cash, put on khata after all, or moved to another customer's khata. */
function ChangePaymentForm({ b, onDone }: { b: Bill; onDone: (r: ChangeResult) => void }) {
  const stale = useRefreshOnStale()
  const after = useAfterBillChange()
  const [payment, setPayment] = useState<Payment>(b.payment)
  const [who, setWho] = useState<KhataCustomer | null>(null)
  const [picking, setPicking] = useState(false)
  const [paid, setPaid] = useState('')
  const [by, setBy] = useState<PaidBy>('CASH')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advanceAsk, setAdvanceAsk] = useState<number | null>(null)

  async function save(advance = false) {
    setError(null)
    const r = payment === 'KHATA' && paid.trim() ? parseRupees(paid) : null
    if (r && 'error' in r) return setError(r.error)
    const khataId = payment === 'KHATA' ? (who?.id ?? b.khataCustomer?.id) : undefined
    if (payment === 'KHATA' && !khataId) return setPicking(true)
    setBusy(true)
    try {
      const res = await kiranaApi.changePayment(b.id, {
        version: b.version,
        payment,
        khataCustomerId: khataId,
        paidNowPaise: r && 'paise' in r ? r.paise : undefined,
        paidNowBy: r && 'paise' in r ? by : undefined,
        advance: advance || undefined,
      })
      after(res.bill)
      onDone(res)
    } catch (e) {
      stale(e)
      if (isApiError(e, 'KHATA_ALREADY_PAID')) setAdvanceAsk(Number(e.details.advanceAfterPaise ?? 0))
      else setError(messageOf(e))
      if (isApiError(e, 'BILL_CHANGED')) setError(`${messageOf(e)} The bill above is up to date now.`)
    } finally {
      setBusy(false)
    }
  }

  if (advanceAsk !== null) {
    return (
      <div className="flex flex-col gap-3">
        <p>Their payments already cover this bill: moving it leaves them {rupees(advanceAsk)} as an advance. Keep it as their advance?</p>
        {error && <Banner tone="bad">{error}</Banner>}
        <Button busy={busy} onClick={() => void save(true)}>
          Yes, keep it as advance
        </Button>
        <Button variant="secondary" onClick={() => setAdvanceAsk(null)}>
          No
        </Button>
      </div>
    )
  }
  if (picking) {
    return (
      <KhataPicker
        chosenId={who?.id}
        onPick={(c) => {
          setWho(c)
          setPicking(false)
        }}
      />
    )
  }
  const khataName = who?.name ?? b.khataCustomer?.name
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">Now: {payText(b)}</p>
      <div className="flex gap-2" role="group" aria-label="Paid by">
        {(['CASH', 'UPI', 'KHATA'] as Payment[]).map((p) => (
          <Chip key={p} selected={payment === p} onClick={() => setPayment(p)}>
            {paymentText(p)}
          </Chip>
        ))}
      </div>
      {payment === 'KHATA' && (
        <>
          <Card className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words">{khataName ?? 'Whose khata?'}</span>
            <button type="button" className="shrink-0 text-sm text-link underline" onClick={() => setPicking(true)}>
              {khataName ? 'Change' : 'Choose'}
            </button>
          </Card>
          <Field id="change-paid-now" label="Paid now (optional, ₹)" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />
          {paid.trim() && (
            <div className="flex gap-2" role="group" aria-label="Paid now by">
              <Chip selected={by === 'CASH'} onClick={() => setBy('CASH')}>
                Cash
              </Chip>
              <Chip selected={by === 'UPI'} onClick={() => setBy('UPI')}>
                UPI
              </Chip>
            </div>
          )}
        </>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <Button busy={busy} onClick={() => void save()}>
        Save
      </Button>
    </div>
  )
}

/** One India day at the counter: what was sold and how, what came in on khata, returns and cancellations, the drawer. */
export function Day() {
  const navigate = useNavigate()
  const params = new URLSearchParams(useLocation().search)
  const today = todayIst()
  const asked = params.get('date')
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today
  const day = useDay(date === today ? null : date)
  const go = (d: string) => navigate(d === today ? '/kirana/day' : `/kirana/day?date=${d}`, { replace: true })
  return (
    <Page back="/kirana/bills" title="Day's totals">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" aria-label="Day before" onClick={() => go(addDays(date, -1))}>
          ‹
        </Button>
        <label className="flex flex-col items-center text-sm">
          <span className="font-semibold">{date === today ? 'Today' : dayLabel(date)}</span>
          <input type="date" aria-label="Pick a day" max={today} value={date} onChange={(e) => e.target.value && go(e.target.value)} className="mt-1 min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
        </label>
        <Button variant="secondary" aria-label="Next day" disabled={date >= today} onClick={() => go(addDays(date, 1))}>
          ›
        </Button>
      </div>
      {day.isPending ? (
        <Loading />
      ) : day.isError && !day.data ? (
        <ErrorState message={messageOf(day.error)} onRetry={() => day.refetch()} />
      ) : (
        <>
          <Card className="flex flex-col gap-1">
            <p className="font-semibold">The drawer and UPI</p>
            <SumRow strong label="Cash in" value={rupees(day.data.cashInPaise)} />
            <SumRow strong label="UPI in" value={rupees(day.data.upiInPaise)} />
            <p className="text-xs text-muted">What the drawer and the shop's UPI should have gained, after returns and cancellations.</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <p className="font-semibold">Sales</p>
            <SumRow label="Bills" value={day.data.bills} />
            <SumRow label="Sold (after discounts)" value={rupees(day.data.salesPaise)} />
            {day.data.discountPaise > 0 && <SumRow label="Discounts given" value={rupees(day.data.discountPaise)} />}
            <SumRow label="Cash" value={rupees(day.data.cashPaise)} />
            <SumRow label="UPI" value={rupees(day.data.upiPaise)} />
            <SumRow label="On khata" value={rupees(day.data.khataPaise)} />
          </Card>
          {day.data.paymentChanges > 0 && (
            <Card className="flex flex-col gap-1">
              <p className="font-semibold">Payments changed ({day.data.paymentChanges})</p>
              <SumRow label="Into cash" value={signedRupees(day.data.changedCashPaise)} />
              <SumRow label="Into UPI" value={signedRupees(day.data.changedUpiPaise)} />
              <SumRow label="Onto khata" value={signedRupees(day.data.changedKhataPaise)} />
            </Card>
          )}
          <Card className="flex flex-col gap-1">
            <p className="font-semibold">Khata payments received</p>
            <SumRow label="Total" value={rupees(day.data.khataReceivedPaise)} />
            <SumRow label="Cash" value={rupees(day.data.khataReceivedCashPaise)} />
            <SumRow label="UPI" value={rupees(day.data.khataReceivedUpiPaise)} />
          </Card>
          {(day.data.returns > 0 || day.data.cancelledBills > 0) && (
            <Card className="flex flex-col gap-1">
              <p className="font-semibold">Returns and cancellations</p>
              {day.data.returns > 0 && (
                <>
                  <SumRow label={`Returns (${day.data.returns})`} value={rupees(day.data.returnedPaise)} />
                  <SumRow label="Handed back: cash / UPI" value={`${rupees(day.data.returnedCashPaise)} / ${rupees(day.data.returnedUpiPaise)}`} />
                  <SumRow label="Off khata" value={rupees(day.data.returnedKhataPaise)} />
                </>
              )}
              {day.data.cancelledBills > 0 && (
                <>
                  <SumRow label={`Cancelled bills (${day.data.cancelledBills})`} value={rupees(day.data.cancelledPaise)} />
                  <SumRow label="Handed back: cash / UPI" value={`${rupees(day.data.cancelledCashPaise)} / ${rupees(day.data.cancelledUpiPaise)}`} />
                  <SumRow label="Off khata" value={rupees(day.data.cancelledKhataPaise)} />
                </>
              )}
            </Card>
          )}
          <p className="text-xs text-muted">Everything counts on the day it happened, so a day's figures never change after you counted the drawer.</p>
        </>
      )}
    </Page>
  )
}

function signedRupees(paise: number): string {
  return paise === 0 ? rupees(0) : `${paise < 0 ? '−' : '+'}${rupees(Math.abs(paise))}`
}

/** The usual reasons a bill is cancelled, one tap each. */
const CANCEL_REASONS = ['Billed twice', 'Customer left', 'Wrong items billed', 'Wrong amount']
