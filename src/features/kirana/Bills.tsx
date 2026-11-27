import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useBill, useBills, useDay, type Bill, type ChangeResult, type KhataCustomer, type PaidBy, type Payment } from '../../api/kirana'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Page, Pill, Sheet } from '../../components/ui'
import { addDays, dateOfIst, dateTimeIst, dayLabel, timeIst, todayIst } from '../../lib/ist'
import { HELPER_MINUTES, parseQty, parseRupees, priceUnit, qtyText, qtyWithUnit, toMilli } from '../../lib/kirana'
import { rupees } from '../../lib/money'
import { inEnglish, shownAs, t as tPlain, useT } from '../../i18n'
import { useSession } from '../../store/session'
import { AskOwner, minutesSince, MoreButton, outcomeUnknown, paidByText, paymentText, SumRow, UnsureNote, useRefreshOnStale, useUnsureSend } from './common'
import { KhataPicker } from './KhataPicker'
import { UpiQrCode } from './UpiQrCode'

/** Bills: today's totals at the top (the full day one tap away), then every bill, newest first. */
export function Bills() {
  const t = useT()
  const bills = useBills()
  const today = useDay(null)
  return (
    <Page title={t('kiranaBills.billsTitle')}>
      <Card className="flex flex-col gap-2">
        <p className="font-semibold">{t('kiranaBills.today')}</p>
        {today.data ? (
          <div className="flex flex-col gap-1">
            <SumRow label={t('kiranaBills.billCount', { count: today.data.bills })} value={rupees(today.data.salesPaise)} />
            <SumRow label={t('kiranaBills.drawerShouldBeUp')} value={rupees(today.data.cashInPaise)} />
            <SumRow label={t('kiranaBills.upiIn')} value={rupees(today.data.upiInPaise)} />
          </div>
        ) : today.isError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-bad">{messageOf(today.error)}</p>
            <Button variant="secondary" busy={today.isFetching} onClick={() => void today.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">…</p>
        )}
        <Link to="/kirana/day" className="flex min-h-12 items-center justify-center rounded-xl border border-line bg-raised px-4 text-center hover:bg-line">
          {t('kiranaSetup.seeTodaysCash')}
        </Link>
      </Card>
      {bills.isPending ? (
        <Loading />
      ) : bills.isError && !bills.data ? (
        <ErrorState message={messageOf(bills.error)} onRetry={() => bills.refetch()} />
      ) : bills.data.pages[0].items.length === 0 ? (
        <EmptyState title={t('kiranaBills.noBillsTitle')} body={t('kiranaBills.noBillsBody')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {bills.data.pages.flatMap((p) => p.items).map((b) => (
            <li key={b.id}>
              <Link to={`/kirana/bills/${b.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-raised">
                <span className="min-w-0">
                  <span className="block font-medium">
                    {t('kiranaBills.billRow', { billNo: String(b.billNo), time: timeIst(b.createdAt) })}
                    {dateOfIst(b.createdAt) !== todayIst() && <span className="text-muted"> · {dayLabel(dateOfIst(b.createdAt))}</span>}
                  </span>
                  <span className="block text-xs text-muted break-words">
                    {b.preview}
                    {b.lines > 3 && ` ${t('kiranaBills.moreLines', { count: b.lines - 3 })}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`font-semibold ${b.voided ? 'line-through text-muted' : ''}`}>{rupees(b.totalPaise)}</span>
                  {b.voided ? (
                    <Pill tone="bad">{t('kiranaBills.cancelled')}</Pill>
                  ) : (
                    <Pill tone={b.payment === 'KHATA' ? 'warn' : 'muted'}>
                      {/* A long customer name stays on one line, cut short: the amount beside it keeps its room */}
                      <span className="max-w-[9rem] truncate" title={b.khataCustomerName ?? undefined}>
                        {b.payment === 'KHATA' ? (b.khataCustomerName ? t('kiranaBills.khataWithName', { name: b.khataCustomerName }) : t('kiranaBills.khata')) : paymentText(b.payment)}
                      </span>
                    </Pill>
                  )}
                  {b.refundedPaise > 0 && !b.voided && <span className="text-xs text-muted">{t('kiranaBills.amountReturned', { amount: rupees(b.refundedPaise) })}</span>}
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
  const t = useT()
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
  if (bill.isPending) return <Page back={back} title={t('kiranaBills.billTitle')}><Loading /></Page>
  if (bill.isError && !bill.data) {
    return (
      <Page back={back} title={t('kiranaBills.billTitle')}>
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
    <Page back={back} title={t('kiranaBills.billNoTitle', { billNo: String(b.billNo) })}>
      {b.voidedAt && <Banner tone="bad">{t('kiranaBills.cancelledBanner', { when: dateTimeIst(b.voidedAt), reason: shownAs(b.voidReason ?? '', CANCEL_REASONS) })}</Banner>}
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          {dateTimeIst(b.createdAt)}
          {b.byName && ` · ${t('kiranaBills.byName', { name: b.byName })}`}
        </p>
        <ul className="flex flex-col gap-1">
          {b.lines.map((l) => (
            <li key={l.lineNo} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block break-words">{l.name}</span>
                <span className="block text-xs text-muted">
                  {qtyWithUnit(toMilli(l.quantity), l.unit)} × {rupees(l.pricePaise)}
                  {priceUnit(l.unit)}
                  {!l.productId && ` · ${t('kiranaBills.notInList')}`}
                  {l.returnedQuantity > 0 && ` · ${t('kiranaBills.qtyReturned', { qty: qtyText(toMilli(l.returnedQuantity)) })}`}
                </span>
              </span>
              <span className="shrink-0">{rupees(l.amountPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line pt-2">
          {b.discountPaise > 0 && (
            <>
              <SumRow label={t('kiranaBills.items')} value={rupees(b.subtotalPaise)} />
              <SumRow label={t('kiranaBills.discount')} value={`−${rupees(b.discountPaise)}`} />
            </>
          )}
          <SumRow strong label={t('kiranaBills.total')} value={rupees(b.totalPaise)} />
          <SumRow label={t('kiranaBills.paidBy')} value={payText(b)} />
          {b.refundedPaise > 0 && <SumRow label={t('kiranaBills.givenBackForReturns')} value={rupees(b.refundedPaise)} />}
        </div>
      </Card>

      {b.returns.length > 0 && (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">{t('kiranaBills.returnsTitle')}</p>
          {b.returns.map((r) => (
            <p key={r.id} className="text-sm">
              {dateTimeIst(r.at)}: {rupees(r.refundPaise)}
              {r.offKhataPaise > 0 && ` ${t('kiranaBills.offTheKhata', { amount: rupees(r.offKhataPaise) })}`}
              {r.handBackPaise > 0 && ` ${t('kiranaBills.handedBackIn', { amount: rupees(r.handBackPaise), by: paidByText(r.handBackBy) })}`}
              {r.byName && ` · ${r.byName}`}
              {r.reason && ` · ${shownAs(r.reason, RETURN_REASONS)}`}
            </p>
          ))}
        </Card>
      )}
      {b.changes.length > 0 && (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">{t('kiranaBills.paymentChangedTitle')}</p>
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
                {t('kiranaBills.showQrAgain')}
              </Button>
            )}
            {qrError && <Banner tone="bad">{qrError}</Banner>}
            {b.returns.length === 0 && (
              <Button variant="secondary" onClick={() => setAction('payment')}>
                {t('kiranaBills.changeHowPaid')}
              </Button>
            )}
            {returnsLeft && (
              <Button variant="secondary" onClick={() => setAction('return')}>
                {t('kiranaBills.itemsBroughtBack')}
              </Button>
            )}
            {b.returns.length === 0 && (
              <Button variant="ghost" className="text-bad" onClick={() => setAction('cancel')}>
                {t('kiranaBills.cancelBill')}
              </Button>
            )}
            {b.returns.length > 0 && <p className="text-xs text-muted">{t('kiranaBills.returnsLockPayment')}</p>}
            {!owner && <p className="text-xs text-muted">{t('kiranaBills.helperWindow', { count: HELPER_MINUTES })}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {t('kiranaBills.onlyOwnerNow', { count: HELPER_MINUTES })}{' '}
            <AskOwner message={t('kiranaSetup.askOwnerBill', { billNo: String(b.billNo) })} />
          </p>
        )
      )}

      <Sheet open={action === 'cancel'} title={t('kiranaBills.cancelBillTitle', { billNo: String(b.billNo) })} onClose={() => setAction(null)}>
        {action === 'cancel' && <CancelForm b={b} onDone={() => setAction(null)} />}
      </Sheet>
      <Sheet open={action === 'return'} title={t('kiranaBills.itemsBroughtBack')} onClose={() => setAction(null)}>
        {action === 'return' && <ReturnForm b={b} onDone={() => setAction(null)} />}
      </Sheet>
      <Sheet open={action === 'payment'} title={t('kiranaBills.changeHowPaid')} onClose={() => setAction(null)}>
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
      <Sheet open={changed !== null} title={t('kiranaBills.showThisQr')} onClose={() => setChanged(null)}>
        {changed?.upi && <UpiQrCode upi={changed.upi} />}
        {changed?.upiIdMissing && <Banner tone="warn">{t('kiranaBills.noQrNoUpiId')}</Banner>}
        <Button className="mt-3 w-full" onClick={() => setChanged(null)}>
          {t('common.done')}
        </Button>
      </Sheet>
    </Page>
  )
}

function payText(b: Bill): string {
  if (b.payment !== 'KHATA') return paymentText(b.payment)
  const name = b.khataCustomer?.name
  if (b.paidNowPaise) {
    const vars = { onKhata: rupees(b.onKhataPaise), paidNow: rupees(b.paidNowPaise), by: paidByText(b.paidNowBy) }
    return name ? tPlain('kiranaBills.payKhataPartFor', { ...vars, name }) : tPlain('kiranaBills.payKhataPart', vars)
  }
  return name ? tPlain('kiranaBills.payKhataFor', { name }) : tPlain('kiranaBills.khata')
}

function useAfterBillChange() {
  const qc = useQueryClient()
  return (next: Bill) => {
    qc.setQueryData(kiranaKeys.bill(next.id), next)
    void qc.invalidateQueries({ queryKey: kiranaKeys.all })
  }
}

function CancelForm({ b, onDone }: { b: Bill; onDone: () => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const after = useAfterBillChange()
  const [reason, setReason] = useState('')
  // The tapped chip, kept as its key: saved in English and still highlighted if the language changes meanwhile
  const [chip, setChip] = useState<(typeof CANCEL_REASONS)[number] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function save() {
    setBusy(true)
    setError(null)
    try {
      // A tapped reason is saved in English (one form for everyone, shown in each person's language)
      after((await kiranaApi.cancel(b.id, chip ? inEnglish(chip) : reason.trim())).bill)
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
        {b.payment !== 'KHATA'
          ? t('kiranaBills.cancelIntro')
          : b.khataCustomer
            ? t('kiranaBills.cancelIntroKhata', { amount: rupees(b.onKhataPaise), name: b.khataCustomer.name })
            : t('kiranaBills.cancelIntroKhataNoName', { amount: rupees(b.onKhataPaise) })}
        {b.payment !== 'KHATA' || b.paidNowPaise ? ` ${t('kiranaBills.cancelHandBack')}` : ''}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaBills.quickReasons')}>
        {CANCEL_REASONS.map((key) => {
          return (
            <Chip
              key={key}
              selected={chip === key}
              onClick={() => {
                setChip(key)
                setReason(t(key))
              }}
            >
              {t(key)}
            </Chip>
          )
        })}
      </div>
      <Field id="cancel-reason" label={t('kiranaBills.why')} hint={t('kiranaBills.cancelReasonHint')} value={chip ? t(chip) : reason} maxLength={200} onChange={(e) => {
          setChip(null)
          setReason(e.target.value)
        }} error={fieldError(error, 'reason')} />
      {error !== null && !fieldError(error, 'reason') && <Banner tone="bad">{messageOf(error)}</Banner>}
      <Button variant="danger" busy={busy} disabled={reason.trim().length < 2} onClick={save}>
        {t('kiranaBills.cancelBill')}
      </Button>
    </div>
  )
}

/** Choose what came back and how much: listed products go back into stock; the refund goes back the way it was paid. */
function ReturnForm({ b, onDone }: { b: Bill; onDone: () => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const after = useAfterBillChange()
  const send = useUnsureSend<{ lines: { lineNo: number; quantity: number }[]; reason?: string }>(`return:${b.id}`)
  const held = send.unsure
  const left = b.lines.filter((l) => l.quantity > l.returnedQuantity || held?.lines.some((h) => h.lineNo === l.lineNo))
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries((held?.lines ?? []).map((h) => [h.lineNo, qtyText(toMilli(h.quantity))])),
  )
  const [reason, setReason] = useState(held?.reason ?? '')
  // The tapped chip, kept as its key (as when cancelling): saved in English; what was typed is saved as typed
  const [chip, setChip] = useState<(typeof RETURN_REASONS)[number] | null>(
    () => RETURN_REASONS.find((k) => held?.reason !== undefined && inEnglish(k) === held.reason) ?? null,
  )
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
      if ('error' in q) return setError(t('kiranaBills.lineError', { name: l.name, error: q.error }))
      const most = toMilli(l.quantity - l.returnedQuantity)
      if (q.milli > most) return setError(t('kiranaBills.returnAtMost', { name: l.name, qty: qtyText(most) }))
      lines.push({ lineNo: l.lineNo, quantity: q.milli / 1000 })
    }
    if (!lines.length) return setError(t('kiranaBills.returnNothing'))
    return send2({ lines, reason: chip ? inEnglish(chip) : reason.trim() || undefined })
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
                label={t('kiranaBills.returnLineLabel', { name: l.name, qty: qtyWithUnit(most, l.unit) })}
                inputMode="decimal"
                value={qty[l.lineNo] ?? ''}
                disabled={!!held}
                onChange={(e) => setQty((q) => ({ ...q, [l.lineNo]: e.target.value }))}
              />
            </div>
            <Button variant="ghost" disabled={!!held} onClick={() => setQty((q) => ({ ...q, [l.lineNo]: qtyText(most) }))}>
              {t('kiranaBills.returnAll')}
            </Button>
          </div>
        )
      })}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaBills.quickReasons')}>
        {RETURN_REASONS.map((key) => (
          <Chip
            key={key}
            selected={chip === key}
            disabled={!!held}
            onClick={() => {
              setChip(chip === key ? null : key)
              setReason(chip === key ? '' : t(key))
            }}
          >
            {t(key)}
          </Chip>
        ))}
      </div>
      <Field
        id="return-reason"
        label={t('kiranaBills.reasonOptional')}
        value={chip ? t(chip) : reason}
        disabled={!!held}
        maxLength={200}
        onChange={(e) => {
          setChip(null)
          setReason(e.target.value)
        }}
      />
      <p className="text-sm text-muted">
        {b.payment === 'KHATA' ? t('kiranaBills.returnKhataNote') : t('kiranaBills.returnHandBackIn', { by: paidByText(b.payment === 'UPI' ? 'UPI' : 'CASH') })}
      </p>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button busy={busy} onClick={save}>
        {t('kiranaBills.saveReturn')}
      </Button>
    </div>
  )
}

/** UPI failed and they paid cash, put on khata after all, or moved to another customer's khata. */
function ChangePaymentForm({ b, onDone }: { b: Bill; onDone: (r: ChangeResult) => void }) {
  const t = useT()
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
      if (isApiError(e, 'BILL_CHANGED')) setError(t('kiranaBills.billChangedNow', { message: messageOf(e) }))
    } finally {
      setBusy(false)
    }
  }

  if (advanceAsk !== null) {
    return (
      <div className="flex flex-col gap-3">
        <p>{t('kiranaBills.billAdvanceAsk', { amount: rupees(advanceAsk) })}</p>
        {error && <Banner tone="bad">{error}</Banner>}
        <Button busy={busy} onClick={() => void save(true)}>
          {t('kiranaBills.yesKeepAsAdvance')}
        </Button>
        <Button variant="secondary" onClick={() => setAdvanceAsk(null)}>
          {t('kiranaBills.no')}
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
      <p className="text-sm text-muted">{t('kiranaBills.nowPaid', { payment: payText(b) })}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaBills.paidBy')}>
        {(['CASH', 'UPI', 'KHATA'] as Payment[]).map((p) => (
          <Chip key={p} selected={payment === p} onClick={() => setPayment(p)}>
            {paymentText(p)}
          </Chip>
        ))}
      </div>
      {payment === 'KHATA' && (
        <>
          <Card className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words">{khataName ?? t('kiranaBills.whoseKhata')}</span>
            <button type="button" className="shrink-0 text-sm text-link underline" onClick={() => setPicking(true)}>
              {khataName ? t('common.change') : t('kiranaBills.choose')}
            </button>
          </Card>
          <Field id="change-paid-now" label={t('kiranaBills.paidNowOptional')} inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} />
          {paid.trim() && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaBills.paidNowBy')}>
              <Chip selected={by === 'CASH'} onClick={() => setBy('CASH')}>
                {t('kiranaBills.cash')}
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
        {t('common.save')}
      </Button>
    </div>
  )
}

/** One India day at the counter: what was sold and how, what came in on khata, returns and cancellations, the drawer. */
export function Day() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  // Back goes where it was opened from (Bills, or More), F-15; opened straight from a link: Bills
  const [cameIn] = useState(() => location.key !== 'default')
  const today = todayIst()
  const asked = params.get('date')
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today
  const day = useDay(date === today ? null : date)
  const go = (d: string) => navigate(d === today ? '/kirana/day' : `/kirana/day?date=${d}`, { replace: true })
  return (
    <Page back={cameIn ? true : '/kirana/bills'} title={t('kiranaBills.dayTitle')}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" aria-label={t('kiranaBills.dayBefore')} onClick={() => go(addDays(date, -1))}>
          ‹
        </Button>
        <label className="flex flex-col items-center text-sm">
          <span className="font-semibold">{date === today ? t('kiranaBills.today') : dayLabel(date)}</span>
          <input type="date" aria-label={t('kiranaBills.pickADay')} max={today} value={date} onChange={(e) => e.target.value && go(e.target.value)} className="mt-1 min-h-11 rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
        </label>
        <Button variant="secondary" aria-label={t('kiranaBills.nextDay')} disabled={date >= today} onClick={() => go(addDays(date, 1))}>
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
            <p className="font-semibold">{t('kiranaBills.drawerAndUpi')}</p>
            <SumRow strong label={t('kiranaBills.cashIn')} value={rupees(day.data.cashInPaise)} />
            <SumRow strong label={t('kiranaBills.upiIn')} value={rupees(day.data.upiInPaise)} />
            <p className="text-xs text-muted">{t('kiranaBills.drawerNote')}</p>
          </Card>
          <Card className="flex flex-col gap-1">
            <p className="font-semibold">{t('kiranaBills.sales')}</p>
            <SumRow label={t('kiranaBills.dayBills')} value={day.data.bills} />
            <SumRow label={t('kiranaBills.soldAfterDiscounts')} value={rupees(day.data.salesPaise)} />
            {day.data.discountPaise > 0 && <SumRow label={t('kiranaBills.discountsGiven')} value={rupees(day.data.discountPaise)} />}
            <SumRow label={t('kiranaBills.cash')} value={rupees(day.data.cashPaise)} />
            <SumRow label="UPI" value={rupees(day.data.upiPaise)} />
            <SumRow label={t('kiranaBills.onKhata')} value={rupees(day.data.khataPaise)} />
          </Card>
          {day.data.paymentChanges > 0 && (
            <Card className="flex flex-col gap-1">
              <p className="font-semibold">{t('kiranaBills.paymentsChanged', { count: day.data.paymentChanges })}</p>
              <SumRow label={t('kiranaBills.intoCash')} value={signedRupees(day.data.changedCashPaise)} />
              <SumRow label={t('kiranaBills.intoUpi')} value={signedRupees(day.data.changedUpiPaise)} />
              <SumRow label={t('kiranaBills.ontoKhata')} value={signedRupees(day.data.changedKhataPaise)} />
            </Card>
          )}
          <Card className="flex flex-col gap-1">
            <p className="font-semibold">{t('kiranaBills.khataPaymentsReceived')}</p>
            <SumRow label={t('kiranaBills.total')} value={rupees(day.data.khataReceivedPaise)} />
            <SumRow label={t('kiranaBills.cash')} value={rupees(day.data.khataReceivedCashPaise)} />
            <SumRow label="UPI" value={rupees(day.data.khataReceivedUpiPaise)} />
          </Card>
          {(day.data.returns > 0 || day.data.cancelledBills > 0) && (
            <Card className="flex flex-col gap-1">
              <p className="font-semibold">{t('kiranaBills.returnsAndCancellations')}</p>
              {day.data.returns > 0 && (
                <>
                  <SumRow label={t('kiranaBills.returnsCount', { count: day.data.returns })} value={rupees(day.data.returnedPaise)} />
                  <SumRow label={t('kiranaBills.handedBackCashUpi')} value={`${rupees(day.data.returnedCashPaise)} / ${rupees(day.data.returnedUpiPaise)}`} />
                  <SumRow label={t('kiranaBills.offKhata')} value={rupees(day.data.returnedKhataPaise)} />
                </>
              )}
              {day.data.cancelledBills > 0 && (
                <>
                  <SumRow label={t('kiranaBills.cancelledBillsCount', { count: day.data.cancelledBills })} value={rupees(day.data.cancelledPaise)} />
                  <SumRow label={t('kiranaBills.handedBackCashUpi')} value={`${rupees(day.data.cancelledCashPaise)} / ${rupees(day.data.cancelledUpiPaise)}`} />
                  <SumRow label={t('kiranaBills.offKhata')} value={rupees(day.data.cancelledKhataPaise)} />
                </>
              )}
            </Card>
          )}
          <p className="text-xs text-muted">{t('kiranaBills.dayFiguresNote')}</p>
        </>
      )}
    </Page>
  )
}

function signedRupees(paise: number): string {
  return paise === 0 ? rupees(0) : `${paise < 0 ? '−' : '+'}${rupees(Math.abs(paise))}`
}

/**
 * The usual reasons a bill is cancelled, one tap each (keys: shown in the current language, saved in English with
 * {@link inEnglish}, and shown again in each person's language with {@link shownAs}).
 */
const CANCEL_REASONS = ['kiranaBills.reasonBilledTwice', 'kiranaBills.reasonCustomerLeft', 'kiranaBills.reasonWrongItems', 'kiranaBills.reasonWrongAmount'] as const

/** The usual reasons items come back, one tap each: like {@link CANCEL_REASONS}, saved in English. */
const RETURN_REASONS = ['kiranaBills.returnReasonDamaged', 'kiranaBills.returnReasonWrongItem', 'kiranaBills.returnReasonExpired', 'kiranaBills.returnReasonChangedMind'] as const
