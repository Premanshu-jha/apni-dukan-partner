import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import {
  kiranaApi,
  kiranaKeys,
  useProducts,
  type BillResult,
  type KhataCustomer,
  type PaidBy,
  type Payment,
  type Product,
} from '../../api/kirana'
import { useShop } from '../../api/shop'
import { t, useT } from '../../i18n'
import { Banner, Button, Card, Chip, ErrorBanner, Field, Loading, Page, Sheet } from '../../components/ui'
import {
  addLoose,
  addOther,
  addProduct,
  HELPER_DISCOUNT_PAISE,
  lineAmount,
  MAX_LINES,
  linesToSend,
  parseQty,
  parseRupees,
  priceUnit,
  qtyText,
  qtyWithUnit,
  rupeesInput,
  setLine,
  subtotalOf,
  totalOf,
  weightFor,
  type CartLine,
  type PendingPayment,
} from '../../lib/kirana'
import { rupees } from '../../lib/money'
import { storage } from '../../lib/storage'
import { useSession } from '../../store/session'
import { cartOwner, useCart } from './cart'
import { AskOwner, outcomeUnknown, paidByText, paymentText, SearchBox, SumRow, useDebounced } from './common'
import { KhataPicker } from './KhataPicker'
import { forgetLater, keepForLater } from './later'
import { Scanner } from './Scanner'
import { SetupCard } from './Setup'
import { ArrivedNote } from '../../components/ArrivedNote'
import { UpiQrCode } from './UpiQrCode'

/**
 * The counter: scan or search what the customer buys, then Cash, UPI (the shop's own QR) or Khata. The bill being made
 * stays on this phone until it is saved; its clientRef makes a retried Save bill once.
 */
export function Counter() {
  const t = useT()
  const qc = useQueryClient()
  const shop = useShop()
  const userId = useSession((s) => s.user?.id ?? '')
  const owner = shop.myRole === 'OWNER'
  const { cart, open, set, clear, receipt: done, setReceipt: setDone } = useCart()
  useEffect(() => open(cartOwner(userId, shop.id)), [open, userId, shop.id])

  const [search, setSearch] = useState('')
  const settled = useDebounced(search)
  const results = useProducts(settled)
  const found = settled.trim() ? (results.data?.pages[0]?.items.filter((p) => p.active).slice(0, 8) ?? []) : []

  const [scanning, setScanning] = useState(false)
  const location = useLocation()
  // A loose product just added from here (Add a product): its weight-or-amount sheet, once
  const [loose, setLoose] = useState<Product | null>(() => {
    const st = location.state as { loose?: Product } | null
    return st?.loose && !useCart.getState().cart.unsure ? st.loose : null
  })
  useEffect(() => {
    if ((location.state as { loose?: Product } | null)?.loose) window.history.replaceState({ ...window.history.state, usr: null }, '')
  }, [location.state])
  const [other, setOther] = useState<{ name: string } | null>(null)
  const [discounting, setDiscounting] = useState(false)
  // Back from raising a khata customer's limit (F-10): the khata sheet again, with the same customer and amounts
  const [khataResume] = useState(() => (useCart.getState().cart.lines.length ? takeKhataReturn() : null))
  const [khata, setKhata] = useState(khataResume !== null)
  const [editingLine, setEditingLine] = useState<CartLine | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gone, setGone] = useState<string[]>([])
  const [confirmEdit, setConfirmEdit] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [limitHit, setLimitHit] = useState(false)
  /** The total the screen showed when Save was tapped: the receipt says so if the bill came out different. */
  const [shownTotal, setShownTotal] = useState<number | null>(null)
  const sending = useRef(false)

  const subtotal = subtotalOf(cart)
  const total = totalOf(cart)
  const locked = cart.unsure || busy

  function pickProduct(p: Product) {
    setError(null)
    if (billFull(p.unit === 'KG' ? undefined : p.id)) return setError(full())
    if (p.unit === 'KG') {
      setLoose(p)
      return
    }
    set((c) => addProduct(c, p, 1000))
    setSearch('')
  }

  /** At {@link MAX_LINES} items a new line can't be added (more of one already on the bill still can). */
  function billFull(productId?: string): boolean {
    const lines = useCart.getState().cart.lines
    return lines.length >= MAX_LINES && !lines.some((l) => l.kind !== 'other' && l.productId === productId)
  }

  async function save(payment: Payment, extra: { khataCustomerId?: string; khataName?: string; paidNowPaise?: number; paidNowBy?: PaidBy } = {}) {
    if (sending.current || cart.lines.length === 0) return
    // An unsure bill is tried again exactly as it was sent: another payment would come back as the first one
    if (cart.unsure && cart.pending && (cart.pending.payment !== payment || cart.pending.khataCustomerId !== extra.khataCustomerId
      || cart.pending.paidNowPaise !== extra.paidNowPaise || cart.pending.paidNowBy !== extra.paidNowBy)) return
    sending.current = true
    setBusy(true)
    setError(null)
    setGone([])
    setLimitHit(false)
    setShownTotal(total)
    const { khataName: _shownName, ...sent } = extra
    try {
      const result = await kiranaApi.bill({
        clientRef: cart.clientRef,
        lines: linesToSend(cart),
        payment,
        discountPaise: cart.discountPaise || undefined,
        ...sent,
      })
      setDone(result)
      setKhata(false)
      clear()
      // The catalogue's stock, the bills, the day and a khata changed
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
    } catch (e) {
      if (outcomeUnknown(e)) {
        // It may have been saved: the same clientRef again bills once, so only the same Save is safe as it stands
        set((c) => ({ ...c, unsure: true, pending: { payment, ...extra } }))
        // The khata sheet closes: the page's "Try again" is the one way on, with the same customer and amounts
        setKhata(false)
        setError(t('kiranaCounter.unsureSaved', { message: messageOf(e) }))
      } else {
        // A clear answer (4xx): the backend finds a clientRef already used before checking anything else, so a refusal
        // means no bill was made. The bill can be changed again; the same clientRef stays (nothing was saved with it)
        if (cart.unsure) set((c) => ({ ...c, unsure: false, pending: null }))
        if (isApiError(e, 'PRODUCT_GONE')) setGone(((e.details.productIds as string[] | undefined) ?? []).map(String))
        if (isApiError(e, 'KHATA_CUSTOMER_NOT_FOUND')) void qc.invalidateQueries({ queryKey: kiranaKeys.khataAll })
        if (isApiError(e, 'KHATA_LIMIT')) setLimitHit(true)
        setError(messageOf(e))
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <Page title={t('kiranaCounter.title')}>
      <CounterArrivedNote />
      <SetupCard />
      {!owner && <HelperHint shopId={shop.id} shopName={shop.name} userId={userId} />}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setScanning(true)} disabled={locked}>
          {t('kiranaCounter.scan')}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setOther({ name: '' })} disabled={locked}>
          {t('kiranaCounter.itemNotInList')}
        </Button>
      </div>
      <SearchBox id="counter-search" label={t('kiranaCounter.searchLabel')} placeholder={t('kiranaCounter.searchPlaceholder')} value={search} onChange={setSearch} />
      {settled.trim() && (
        <div aria-live="polite">
          {results.isPending ? (
            <Loading />
          ) : results.isError && !results.data ? (
            <Banner tone="bad">{messageOf(results.error)}</Banner>
          ) : found.length === 0 ? (
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-muted">{t('kiranaCounter.nothingCalled', { name: settled.trim() })}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={locked} onClick={() => setOther({ name: settled.trim() })}>
                  {t('kiranaCounter.billNamedWithoutProduct', { name: settled.trim() })}
                </Button>
                {!locked && (
                  <Link to={`/kirana/products/new?${new URLSearchParams({ name: settled.trim(), from: '/kirana/counter' })}`} className="self-center text-sm text-link underline">
                    {t('kiranaCounter.addAsProduct')}
                  </Link>
                )}
              </div>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2" aria-label={t('kiranaCounter.productsFound')}>
              {found.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => pickProduct(p)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:bg-raised disabled:opacity-50"
                  >
                    <span className="min-w-0 break-words">{p.name}</span>
                    <span className="shrink-0 text-sm">
                      {rupees(p.pricePaise)}
                      {priceUnit(p.unit)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section aria-labelledby="bill-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="bill-heading" className="font-semibold">
            {cart.lines.length ? t('kiranaCounter.billHeadingCount', { count: cart.lines.length }) : t('kiranaCounter.billHeading')}
          </h2>
          {cart.lines.length > 0 && !locked && (
            <button type="button" className="min-h-11 px-2 text-sm text-bad underline" onClick={() => setClearing(true)}>
              {t('kiranaCounter.clearBill')}
            </button>
          )}
        </div>
        {cart.lines.length >= MAX_LINES && <Banner tone="warn">{full()}</Banner>}
        {cart.lines.length === 0 ? (
          <p className="text-sm text-muted">{t('kiranaCounter.emptyBill')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cart.lines.map((l) => (
              <LineRow
                key={l.key}
                line={l}
                gone={l.kind !== 'other' && gone.includes(l.productId)}
                disabled={locked}
                onChange={(next) => set((c) => setLine(c, l.key, () => next))}
                onEdit={() => setEditingLine(l)}
              />
            ))}
          </ul>
        )}
      </section>

      {cart.lines.length > 0 && (
        <Card className="flex flex-col gap-1">
          <SumRow label={t('kiranaCounter.items')} value={rupees(subtotal)} />
          <SumRow
            label={
              <button type="button" className="text-link underline disabled:opacity-50" disabled={locked} onClick={() => setDiscounting(true)}>
                {cart.discountPaise ? t('kiranaCounter.discountChange') : t('kiranaCounter.addDiscount')}
              </button>
            }
            value={cart.discountPaise ? `−${rupees(cart.discountPaise)}` : '—'}
          />
          <SumRow strong label={t('kiranaCounter.total')} value={rupees(total)} />
        </Card>
      )}

      {error && !khata && (cart.unsure ? <Banner tone="warn">{error}</Banner> : <ErrorBanner message={error} />)}
      {cart.unsure && cart.pending && (
        <Button busy={busy} onClick={() => save(cart.pending!.payment, { ...cart.pending! })}>
          {t('kiranaCounter.tryAgainPay', { payment: pendingLabel(cart.pending), amount: rupees(total) })}
        </Button>
      )}
      {cart.unsure && (
        <div className="flex flex-col gap-2">
          <Link to="/kirana/bills" className="text-sm text-link underline">
            {t('kiranaCounter.checkBills')}
          </Link>
          <Button variant="ghost" onClick={() => setConfirmEdit(true)}>
            {t('kiranaCounter.changeAnyway')}
          </Button>
        </div>
      )}

      {cart.lines.length > 0 && !cart.unsure && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] -mx-4 grid grid-cols-3 gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
          <Button busy={busy} onClick={() => save('CASH')} aria-label={t('kiranaCounter.cashAria', { amount: rupees(total) })}>
            {t('kiranaCounter.cash')}
          </Button>
          <Button busy={busy} onClick={() => save('UPI')} aria-label={t('kiranaCounter.upiAria', { amount: rupees(total) })}>
            {t('kiranaCounter.upi')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setKhata(true)} aria-label={t('kiranaCounter.khataAria', { amount: rupees(total) })}>
            {t('kiranaCounter.khata')}
          </Button>
        </div>
      )}

      <Sheet open={scanning} title={t('kiranaCounter.scanSheetTitle')} onClose={() => setScanning(false)}>
        <ScanPanel
          onProduct={(p, pack) => {
            if (billFull(p.id)) return false
            setError(null)
            set((c) => addProduct(c, p, pack))
            return true
          }}
          onLoose={(p) => {
            setScanning(false)
            if (billFull()) return setError(full())
            setLoose(p)
          }}
          onOther={(name) => {
            setScanning(false)
            if (billFull()) return setError(full())
            setOther({ name })
          }}
          onDone={() => setScanning(false)}
          lines={cart.lines.length}
        />
      </Sheet>

      <Sheet open={loose !== null} title={loose ? loose.name : ''} onClose={() => setLoose(null)}>
        {loose && (
          <LooseForm
            product={loose}
            onAdd={(how) => {
              set((c) => ('amountPaise' in how ? addLoose(c, loose, how.amountPaise) : addProduct(c, loose, how.milli)))
              setLoose(null)
              setSearch('')
            }}
          />
        )}
      </Sheet>

      <Sheet open={other !== null} title={t('kiranaCounter.otherSheetTitle')} onClose={() => setOther(null)}>
        {other && (
          <OtherForm
            start={other.name}
            onAdd={(name, amountPaise, qty) => {
              set((c) => addOther(c, name, amountPaise, qty))
              setOther(null)
              setSearch('')
            }}
          />
        )}
      </Sheet>

      <Sheet open={editingLine !== null} title={editingLine?.name ?? ''} onClose={() => setEditingLine(null)}>
        {editingLine && (
          <EditLineForm
            line={editingLine}
            onSave={(next) => {
              set((c) => setLine(c, editingLine.key, () => next))
              setEditingLine(null)
            }}
          />
        )}
      </Sheet>

      <Sheet open={discounting} title={t('kiranaCounter.discountSheetTitle')} onClose={() => setDiscounting(false)}>
        <DiscountForm
          owner={owner}
          subtotal={subtotal}
          current={cart.discountPaise}
          onSave={(paise) => {
            set((c) => ({ ...c, discountPaise: paise }))
            setDiscounting(false)
          }}
        />
      </Sheet>

      <Sheet open={khata} title={t('kiranaCounter.khataSheetTitle', { amount: rupees(total) })} onClose={() => !busy && setKhata(false)}>
        <KhataPay total={total} busy={busy} owner={owner} limitHit={limitHit} error={khata ? error : null} resume={khataResume} onPay={(c, paid) => save('KHATA', { khataCustomerId: c.id, khataName: c.name, ...paid })} />
      </Sheet>

      <Sheet open={done !== null} title={done ? t('kiranaCounter.billSavedTitle', { billNo: String(done.bill.billNo) }) : ''} onClose={() => setDone(null)}>
        {done && <Receipt result={done} owner={owner} shownTotal={shownTotal} onChange={setDone} onNext={() => setDone(null)} />}
      </Sheet>

      <Sheet open={confirmEdit} title={t('kiranaCounter.confirmEditTitle')} onClose={() => setConfirmEdit(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('kiranaCounter.confirmEditBody')}</p>
          <Button variant="secondary" onClick={() => setConfirmEdit(false)}>
            {t('kiranaCounter.keepAsIs')}
          </Button>
          <Button
            onClick={() => {
              set((c) => ({ ...c, unsure: false, pending: null, clientRef: crypto.randomUUID() }))
              setError(null)
              setConfirmEdit(false)
            }}
          >
            {t('kiranaCounter.yesChange')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clear()
              setError(null)
              setConfirmEdit(false)
            }}
          >
            {t('kiranaCounter.savedStartNew')}
          </Button>
        </div>
      </Sheet>

      <Sheet open={clearing} title={t('kiranaCounter.clearTitle')} onClose={() => setClearing(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('kiranaCounter.clearBody', { count: cart.lines.length })}</p>
          <Button variant="secondary" onClick={() => setClearing(false)}>
            {t('kiranaCounter.keepIt')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clear()
              setError(null)
              setGone([])
              setClearing(false)
            }}
          >
            {t('kiranaCounter.clearTheBill')}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

/** Shown when the bill already has {@link MAX_LINES} lines. */
function full(): string {
  return t('kiranaCounter.billFull', { max: MAX_LINES })
}

function pendingLabel(p: PendingPayment): string {
  if (p.payment !== 'KHATA') return paymentText(p.payment)
  return p.khataName ? t('kiranaCounter.khataNamed', { name: p.khataName }) : t('kiranaCounter.khata')
}

/** One line of the bill: what, how much, its amount; − and + for pieces, a tap to change the rest. */
function LineRow({
  line,
  gone,
  disabled,
  onChange,
  onEdit,
}: {
  line: CartLine
  gone: boolean
  disabled: boolean
  onChange: (next: CartLine | null) => void
  onEdit: () => void
}) {
  const t = useT()
  const detail =
    line.kind === 'product'
      ? t('kiranaCounter.lineProduct', { qty: qtyWithUnit(line.milli, line.unit), price: rupees(line.pricePaise), per: priceUnit(line.unit) })
      : line.kind === 'loose'
        ? t('kiranaCounter.lineLoose', { amount: rupees(line.amountPaise), weight: qtyText(weightFor(line.amountPaise, line.pricePaise)) })
        : t('kiranaCounter.lineOther', { qty: String(line.qty), amount: rupees(line.amountPaise) })
  const pieces = (line.kind === 'product' && line.unit === 'PIECE') || line.kind === 'other'
  const count = line.kind === 'product' ? line.milli / 1000 : line.kind === 'other' ? line.qty : 0
  function step(by: number) {
    if (line.kind === 'product') {
      const milli = line.milli + by * 1000
      onChange(milli <= 0 ? null : { ...line, milli: Math.min(milli, 9_999_000) })
    } else if (line.kind === 'other') {
      const qty = line.qty + by
      onChange(qty <= 0 ? null : { ...line, qty: Math.min(qty, 9999) })
    }
  }
  return (
    <li className={`flex flex-col gap-2 rounded-xl border bg-surface p-3 ${gone ? 'border-bad' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" disabled={disabled} onClick={onEdit} className="min-w-0 text-left disabled:opacity-60">
          <span className="block font-medium break-words">{line.name}</span>
          <span className="block text-xs text-muted">{detail}</span>
        </button>
        <span className="shrink-0 font-semibold">{rupees(lineAmount(line))}</span>
      </div>
      {gone && <p className="text-sm text-bad">{t('kiranaCounter.lineGone')}</p>}
      <div className="flex items-center justify-between gap-2">
        {pieces ? (
          <div className="flex items-center gap-1">
            <button type="button" aria-label={t('kiranaCounter.oneLess', { name: line.name })} disabled={disabled} onClick={() => step(-1)} className="h-11 w-11 rounded-full border border-line text-lg disabled:opacity-50">
              −
            </button>
            <span className="min-w-8 text-center">
              {count}
            </span>
            <button type="button" aria-label={t('kiranaCounter.oneMore', { name: line.name })} disabled={disabled} onClick={() => step(1)} className="h-11 w-11 rounded-full border border-line text-lg disabled:opacity-50">
              +
            </button>
            <button type="button" disabled={disabled} onClick={onEdit} className="ml-2 min-h-11 px-1 text-sm text-link underline disabled:opacity-50">
              {t('common.change')}
            </button>
          </div>
        ) : (
          <button type="button" disabled={disabled} onClick={onEdit} className="text-sm text-link underline disabled:opacity-50">
            {t('common.change')}
          </button>
        )}
        <button type="button" disabled={disabled} onClick={() => onChange(null)} className="min-h-11 px-2 text-sm text-bad disabled:opacity-50" aria-label={t('kiranaCounter.removeItem', { name: line.name })}>
          {t('common.remove')}
        </button>
      </div>
    </li>
  )
}

/** Changing one line: how many (or the weight), or a loose item's amount, or an item not in the list's price. */
function EditLineForm({ line, onSave }: { line: CartLine; onSave: (l: CartLine) => void }) {
  const t = useT()
  const [value, setValue] = useState(() =>
    line.kind === 'product' ? qtyText(line.milli) : line.kind === 'loose' ? rupeesInput(line.amountPaise) : rupeesInput(line.amountPaise),
  )
  const [name, setName] = useState(line.kind === 'other' ? line.name : '')
  const [err, setErr] = useState<string | null>(null)
  const [nameErr, setNameErr] = useState<string | null>(null)
  function save() {
    if (line.kind === 'other' && !name.trim()) return setNameErr(t('kiranaCounter.enterWhatItIs'))
    if (line.kind === 'product') {
      const q = parseQty(value, line.unit)
      if ('error' in q) return setErr(q.error)
      onSave({ ...line, milli: q.milli })
    } else {
      const r = parseRupees(value, { maxPaise: 10_000_000 })
      if ('error' in r) return setErr(r.error)
      if (line.kind === 'loose' && weightFor(r.paise, line.pricePaise) <= 0) return setErr(t('kiranaCounter.lessThanGram', { price: rupees(line.pricePaise) }))
      onSave(line.kind === 'other' ? { ...line, amountPaise: r.paise, name: name.trim().slice(0, 100) } : { ...line, amountPaise: r.paise })
    }
  }
  const label = line.kind === 'product' ? (line.unit === 'KG' ? t('kiranaCounter.weightKg') : t('kiranaCounter.howMany')) : line.kind === 'loose' ? t('kiranaCounter.amountRupees') : t('kiranaCounter.priceOfOne')
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {line.kind === 'other' && (
        <Field id="edit-line-name" label={t('kiranaCounter.whatItIs')} value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setNameErr(null) }} error={nameErr ?? undefined} />
      )}
      <Field id="edit-line" label={label} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={err ?? undefined} autoFocus />
      <Button type="submit">{t('common.save')}</Button>
    </form>
  )
}

/** A loose product (sold by kg): by weight, or by the amount the customer asks for ("₹30 of sugar"). */
function LooseForm({ product, onAdd }: { product: Product; onAdd: (how: { milli: number } | { amountPaise: number }) => void }) {
  const t = useT()
  const [by, setBy] = useState<'weight' | 'amount'>('weight')
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const amount = by === 'amount' ? parseRupees(value, { maxPaise: 10_000_000 }) : null
  const weight = by === 'weight' ? parseQty(value, 'KG') : null
  const preview =
    weight && 'milli' in weight
      ? `${rupees(Math.floor((product.pricePaise * weight.milli + 500) / 1000))}`
      : amount && 'paise' in amount
        ? t('kiranaCounter.aboutKg', { weight: qtyText(weightFor(amount.paise, product.pricePaise)) })
        : null
  function add() {
    if (by === 'weight') {
      if (!weight || 'error' in weight) return setErr(weight?.error ?? t('kiranaCounter.enterWeight'))
      onAdd({ milli: weight.milli })
    } else {
      if (!amount || 'error' in amount) return setErr(amount?.error ?? t('kiranaCounter.enterAmount'))
      if (weightFor(amount.paise, product.pricePaise) <= 0) return setErr(t('kiranaCounter.lessThanGram', { price: rupees(product.pricePaise) }))
      onAdd({ amountPaise: amount.paise })
    }
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <p className="text-sm text-muted">{t('kiranaCounter.pricePerKg', { price: rupees(product.pricePaise) })}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaCounter.sellBy')}>
        <Chip selected={by === 'weight'} onClick={() => { setBy('weight'); setValue(''); setErr(null) }}>
          {t('kiranaCounter.byWeight')}
        </Chip>
        <Chip selected={by === 'amount'} onClick={() => { setBy('amount'); setValue(''); setErr(null) }}>
          {t('kiranaCounter.byAmount')}
        </Chip>
      </div>
      <Field
        id="loose-value"
        label={by === 'weight' ? t('kiranaCounter.looseWeightLabel') : t('kiranaCounter.looseAmountLabel')}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setErr(null)
        }}
        error={err ?? undefined}
        autoFocus
      />
      {preview && !err && <p className="text-sm">= {preview}</p>}
      <Button type="submit">{t('kiranaCounter.addToBill')}</Button>
    </form>
  )
}

/** An item not in the list: its name and the price of one, and how many. No stock is kept for it. */
function OtherForm({ start, onAdd }: { start: string; onAdd: (name: string, amountPaise: number, qty: number) => void }) {
  const t = useT()
  const [name, setName] = useState(start)
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [touched, setTouched] = useState(false)
  const nameErr = name.trim().length < 2 ? t('kiranaCounter.otherNameError') : null
  const p = parseRupees(price, { maxPaise: 10_000_000 })
  const q = parseQty(qty, 'PIECE')
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (nameErr || 'error' in p || 'error' in q) return
        onAdd(name, p.paise, q.milli / 1000)
      }}
    >
      <Field id="other-name" label={t('kiranaCounter.whatIsIt')} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={(touched && nameErr) || undefined} autoFocus={!start} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="other-price" label={t('kiranaCounter.priceOfOne')} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={touched && 'error' in p ? p.error : undefined} autoFocus={Boolean(start)} />
        <Field id="other-qty" label={t('kiranaCounter.howMany')} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={touched && 'error' in q ? q.error : undefined} />
      </div>
      <p className="text-sm text-muted">{t('kiranaCounter.soldOften')}</p>
      <Button type="submit">{t('kiranaCounter.addToBill')}</Button>
    </form>
  )
}

/** Off the whole bill. A helper up to ₹10 (a round-off); more is the owner's. */
function DiscountForm({ owner, subtotal, current, onSave }: { owner: boolean; subtotal: number; current: number; onSave: (paise: number) => void }) {
  const t = useT()
  const [value, setValue] = useState(current ? rupeesInput(current) : '')
  const [err, setErr] = useState<string | null>(null)
  const cap = owner ? subtotal : Math.min(subtotal, HELPER_DISCOUNT_PAISE)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return onSave(0)
        const r = parseRupees(value, { zeroAllowed: true })
        if ('error' in r) return setErr(r.error)
        if (r.paise > subtotal) return setErr(t('kiranaCounter.discountOverBill', { amount: rupees(subtotal) }))
        if (!owner && r.paise > HELPER_DISCOUNT_PAISE) return setErr(t('kiranaCounter.helperDiscountMax'))
        onSave(r.paise)
      }}
    >
      <Field
        id="discount"
        label={t('kiranaCounter.amountOff')}
        hint={owner ? t('kiranaCounter.discountUpTo', { amount: rupees(cap) }) : t('kiranaCounter.helperDiscountHint')}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setErr(null)
        }}
        error={err ?? undefined}
        autoFocus
      />
      {!owner && err === t('kiranaCounter.helperDiscountMax') && <AskOwner message={t('kiranaSetup.askOwnerDiscount', { amount: value.trim() })} />}
      <Button type="submit">{t('common.save')}</Button>
      {current > 0 && (
        <Button variant="ghost" onClick={() => onSave(0)}>
          {t('kiranaCounter.noDiscount')}
        </Button>
      )}
    </form>
  )
}

/** On khata: whose, and anything paid now at the counter (only the rest goes on their khata). */
function KhataPay({
  total,
  busy,
  owner,
  limitHit,
  error,
  onPay,
  resume,
}: {
  total: number
  busy: boolean
  owner: boolean
  limitHit: boolean
  error: string | null
  onPay: (c: KhataCustomer, paid: { paidNowPaise?: number; paidNowBy?: PaidBy }) => void
  /** Back from raising the customer's limit: the same customer and what was paid now, read again (the new limit). */
  resume?: KhataReturn | null
}) {
  const t = useT()
  const [who, setWho] = useState<KhataCustomer | null>(null)
  const [paid, setPaid] = useState(resume?.paid ?? '')
  const [by, setBy] = useState<PaidBy>(resume?.by ?? 'CASH')
  const [err, setErr] = useState<string | null>(null)
  const [resuming, setResuming] = useState(Boolean(resume))
  useEffect(() => {
    if (!resume) return
    let gone = false
    kiranaApi
      .customer(resume.customerId)
      .then((d) => !gone && setWho(d.customer))
      .catch(() => undefined)
      .finally(() => !gone && setResuming(false))
    return () => {
      gone = true
    }
  }, [resume])
  if (!who && resuming) return <Loading />
  if (!who) return <KhataPicker onPick={setWho} />
  const r = paid.trim() ? parseRupees(paid) : null
  const paidNow = r && 'paise' in r ? r.paise : 0
  const onKhata = total - paidNow
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold break-words">{who.name}</span>
          <span className="block text-xs text-muted">
            {who.availablePaise === null ? t('kiranaCounter.noLimit') : t('kiranaCounter.canBuyMoreOnKhata', { amount: rupees(who.availablePaise) })}
          </span>
        </span>
        <button type="button" className="shrink-0 text-sm text-link underline" onClick={() => setWho(null)}>
          {t('common.change')}
        </button>
      </Card>
      <Field
        id="paid-now"
        label={t('kiranaCounter.paidNowLabel')}
        hint={t('kiranaCounter.paidNowHint')}
        inputMode="decimal"
        value={paid}
        onChange={(e) => {
          setPaid(e.target.value)
          setErr(null)
        }}
        error={err ?? undefined}
      />
      {paidNow > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaCounter.paidNowBy')}>
          <Chip selected={by === 'CASH'} onClick={() => setBy('CASH')}>
            {t('kiranaCounter.cash')}
          </Chip>
          <Chip selected={by === 'UPI'} onClick={() => setBy('UPI')}>
            {t('kiranaCounter.upi')}
          </Chip>
        </div>
      )}
      <SumRow strong label={t('kiranaCounter.onKhata')} value={rupees(Math.max(0, onKhata))} />
      {error && <ErrorBanner message={error} />}
      {error && limitHit && owner && (
        <Link
          to={`/kirana/khata/${who.id}`}
          state={{ from: '/kirana/counter' }}
          onClick={() => keepKhataReturn({ customerId: who.id, paid, by })}
          className="text-sm text-link underline"
        >
          {t('kiranaCounter.changeKhataLimit', { name: who.name })}
        </Link>
      )}
      {error && limitHit && !owner && <AskOwner message={t('kiranaSetup.askOwnerLimit', { name: who.name })} />}
      <Button
        busy={busy}
        onClick={() => {
          if (r && 'error' in r) return setErr(r.error)
          if (paidNow >= total) return setErr(t('kiranaCounter.paidInFull', { amount: rupees(total) }))
          onPay(who, paidNow ? { paidNowPaise: paidNow, paidNowBy: by } : {})
        }}
      >
        {t('kiranaCounter.putOnKhata', { amount: rupees(Math.max(0, onKhata)), name: who.name })}
      </Button>
    </div>
  )
}

/** After Save: the bill's number and total, the UPI QR to show, the khata after it, and products running out. */
function Receipt({
  result,
  owner,
  shownTotal,
  onChange,
  onNext,
}: {
  result: BillResult
  owner: boolean
  shownTotal: number | null
  onChange: (r: BillResult) => void
  onNext: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const b = result.bill
  const low = result.stock.filter((s) => s.runningOut)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // UPI didn't go through and they handed over cash: one tap, no hunting for the bill
  async function paidByCash() {
    setBusy(true)
    setError(null)
    try {
      const res = await kiranaApi.changePayment(b.id, { version: b.version, payment: 'CASH' })
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
      onChange({ ...result, bill: res.bill, upi: null, upiIdMissing: false, repeated: false })
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-h-[80dvh] flex-col gap-3 overflow-y-auto">
      {result.repeated && <Banner tone="info">{t('kiranaCounter.repeatedBill')}</Banner>}
      {shownTotal !== null && shownTotal !== b.totalPaise && (
        <Banner tone="warn">{t('kiranaCounter.totalChanged', { saved: rupees(b.totalPaise), shown: rupees(shownTotal) })}</Banner>
      )}
      <SumRow strong label={paymentTitle(b.payment, b.paidNowPaise, b.paidNowBy)} value={rupees(b.totalPaise)} />
      {b.payment === 'CASH' && <CashChange total={b.totalPaise} />}
      {result.upi && <UpiQrCode upi={result.upi} />}
      {b.payment === 'UPI' && (
        <Button variant="secondary" busy={busy} onClick={() => void paidByCash()}>
          {t('kiranaCounter.upiFailedCash')}
        </Button>
      )}
      {error && <ErrorBanner message={error} />}
      {result.upiIdMissing && (
        <Banner tone="warn">
          {t('kiranaCounter.noUpiId')}{' '}
          {owner ? (
            <Link to="/kirana/upi" className="underline">
              {t('kiranaCounter.setUpiNow')}
            </Link>
          ) : (
            <>
              {t('kiranaCounter.askOwnerUpi')} <AskOwner message={t('kiranaSetup.askOwnerUpiMessage')} />
            </>
          )}
        </Banner>
      )}
      {result.khata && (
        <p className="text-sm">
          {result.khata.availablePaise !== null
            ? t('kiranaCounter.khataOwesCanBuy', { name: result.khata.name, owes: rupees(result.khata.owesPaise), available: rupees(result.khata.availablePaise) })
            : t('kiranaCounter.khataOwes', { name: result.khata.name, owes: rupees(result.khata.owesPaise) })}
        </p>
      )}
      {low.length > 0 && (
        <Banner tone="warn">
          {t('kiranaCounter.runningOut', { items: low.map((s) => t('kiranaCounter.runningOutItem', { name: s.name, qty: qtyWithUnit(Math.round(s.after * 1000), s.unit) })).join(', ') })}
        </Banner>
      )}
      <Link to={`/kirana/bills/${b.id}`} className="text-sm text-link underline">
        {t('kiranaCounter.openBill')}
      </Link>
      <Button onClick={onNext}>{t('kiranaCounter.nextBill')}</Button>
    </div>
  )
}

/** Cash handed over → the change to give back. */
function CashChange({ total }: { total: number }) {
  const t = useT()
  const [given, setGiven] = useState('')
  const r = given.trim() ? parseRupees(given) : null
  const paise = r && 'paise' in r ? r.paise : null
  return (
    <div className="flex flex-col gap-1">
      <Field
        id="cash-given"
        label={t('kiranaCounter.cashGiven')}
        inputMode="decimal"
        value={given}
        onChange={(e) => setGiven(e.target.value)}
        error={r && 'error' in r ? r.error : undefined}
      />
      {paise !== null && (
        <p className="text-sm font-semibold" aria-live="polite">
          {paise >= total ? t('kiranaCounter.giveBack', { amount: rupees(paise - total) }) : t('kiranaCounter.short', { amount: rupees(total - paise) })}
        </p>
      )}
    </div>
  )
}

function paymentTitle(p: Payment, paidNow: number | null, paidBy: PaidBy | null): string {
  if (p !== 'KHATA') return t('kiranaCounter.paidBy', { payment: paymentText(p) })
  return paidNow ? t('kiranaCounter.onKhataPaidNow', { amount: rupees(paidNow), by: paidByText(paidBy) }) : t('kiranaCounter.onKhata')
}

/**
 * The scanner: each pack scanned goes onto the bill at once (its pack size: a carton of 12 adds 12). A barcode the
 * shop hasn't linked yet asks what it is: a new product, one already in the list, or billed without a product.
 */
function ScanPanel({
  onProduct,
  onLoose,
  onOther,
  onDone,
  lines,
}: {
  /** False when the bill is full and it wasn't added. */
  onProduct: (p: Product, packMilli: number) => boolean
  onLoose: (p: Product) => void
  onOther: (name: string) => void
  onDone: () => void
  lines: number
}) {
  const t = useT()
  const navigate = useNavigate()
  const [last, setLast] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [adding, setAdding] = useState(false)
  const shop = useShop()

  async function onCode(code: string) {
    setError(null)
    try {
      const { product, pack } = await kiranaApi.scan(code)
      if (product.unit === 'KG' && pack === 1) {
        onLoose(product)
        return
      }
      if (!onProduct(product, Math.round(pack * 1000))) {
        setLast(null)
        setError(full())
        return
      }
      setLast(pack !== 1 ? t('kiranaCounter.scanAddedPack', { name: product.name, qty: qtyText(Math.round(pack * 1000)) }) : t('kiranaCounter.scanAdded', { name: product.name }))
      setUnknown(null)
    } catch (e) {
      if (isApiError(e, 'PRODUCT_NOT_FOUND')) setUnknown(code)
      else setError(messageOf(e))
    }
  }

  if (unknown && adding) {
    return (
      <QuickProduct
        code={unknown}
        onSaved={(p) => {
          setAdding(false)
          setUnknown(null)
          if (p.unit === 'KG') onLoose(p)
          else setLast(onProduct(p, 1000) ? t('kiranaCounter.addedBarcodeSaved', { name: p.name }) : t('kiranaCounter.barcodeSavedBillFull', { max: MAX_LINES }))
        }}
        onMore={() => navigate(`/kirana/products/new?${new URLSearchParams({ barcode: unknown, from: '/kirana/counter' })}`)}
        onBack={() => setAdding(false)}
      />
    )
  }
  if (unknown && linking) {
    return (
      <LinkBarcode
        code={unknown}
        onLinked={(p, packMilli) => {
          setLinking(false)
          setUnknown(null)
          if (p.unit === 'KG') onLoose(p)
          else {
            setLast(onProduct(p, packMilli) ? t('kiranaCounter.addedBarcodeSaved', { name: p.name }) : t('kiranaCounter.barcodeSavedBillFull', { max: MAX_LINES }))
          }
        }}
        onBack={() => setLinking(false)}
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <Scanner onCode={(c) => void onCode(c)} paused={unknown !== null} />
      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {last && !unknown && <Banner tone="good" live={false}>{last}</Banner>}
        {error && <Banner tone="bad" live={false}>{error}</Banner>}
      </div>
      {unknown && (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold">{t('kiranaCounter.unknownBarcode', { code: unknown })}</p>
          {/* A customer is waiting: the quick way first (the barcode is kept to add later, on Products) */}
          <Button
            onClick={() => {
              keepForLater(shop.id, unknown)
              onOther('')
            }}
          >
            {t('kiranaSetup.billNowAddLater')}
          </Button>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t('kiranaCounter.addNewProduct')}
          </Button>
          <Button variant="secondary" onClick={() => setLinking(true)}>
            {t('kiranaCounter.alreadyHaveProduct')}
          </Button>
          <Button variant="ghost" onClick={() => setUnknown(null)}>
            {t('kiranaCounter.scanAgain')}
          </Button>
        </Card>
      )}
      <Button variant={lines ? 'primary' : 'secondary'} onClick={onDone}>
        {lines ? t('kiranaCounter.doneBackToBill', { count: lines }) : t('common.close')}
      </Button>
    </div>
  )
}

/** A barcode for a product already in the list (a new pack design, another MRP batch): saved, then billed. */
export function LinkBarcode({ code, onLinked, onBack }: { code: string; onLinked: (p: Product, packMilli: number) => void; onBack: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [pack, setPack] = useState('1')
  const [search, setSearch] = useState('')
  const settled = useDebounced(search)
  const results = useProducts(settled)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const items = results.data?.pages[0]?.items.filter((p) => p.active).slice(0, 10) ?? []
  async function link(p: Product) {
    const k = parseQty(pack, p.unit)
    if ('error' in k) return setError(t('kiranaCounter.packError', { error: k.error }))
    setBusy(p.id)
    setError(null)
    try {
      const saved = await kiranaApi.addBarcode(p.id, code, k.milli / 1000)
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
      onLinked(saved, saved.unit === 'PIECE' ? k.milli : 1000)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('kiranaCounter.whichProduct', { code })}</p>
      <Field
        id="link-pack"
        label={t('kiranaCounter.packLabel')}
        hint={t('kiranaCounter.packHint')}
        inputMode="decimal"
        value={pack}
        onChange={(e) => {
          setPack(e.target.value)
          setError(null)
        }}
      />
      <SearchBox id="link-search" label={t('kiranaCounter.searchForProduct')} value={search} onChange={setSearch} />
      {results.isPending ? (
        <Loading />
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {items.map((p) => (
            <li key={p.id}>
              <Button variant="secondary" className="w-full justify-between" busy={busy === p.id} disabled={busy !== null} onClick={() => void link(p)}>
                <span className="min-w-0 break-words text-left">{p.name}</span>
                <span className="text-sm">{rupees(p.pricePaise)}</span>
              </Button>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-muted">{t('kiranaCounter.noProductsFound')}</li>}
        </ul>
      )}
      {error && <ErrorBanner message={error} />}
      <Button variant="ghost" onClick={onBack}>
        {t('common.back')}
      </Button>
    </div>
  )
}

/** A khata bill waiting while the owner raises the customer's limit (kept in this tab, read once on the way back). */
interface KhataReturn {
  customerId: string
  paid: string
  by: PaidBy
}

const KHATA_RETURN = 'adp.kiranaKhataReturn'

function keepKhataReturn(r: KhataReturn) {
  try {
    sessionStorage.setItem(KHATA_RETURN, JSON.stringify(r))
  } catch {
    /* storage blocked: the sheet opens empty on the way back */
  }
}

function takeKhataReturn(): KhataReturn | null {
  try {
    const raw = sessionStorage.getItem(KHATA_RETURN)
    sessionStorage.removeItem(KHATA_RETURN)
    return raw ? (JSON.parse(raw) as KhataReturn) : null
  } catch {
    return null
  }
}

/** A helper's first time at the counter (F-20): what he may do, and what is the owner's. Shown once; "Got it" hides it. */
function HelperHint({ shopId, shopName, userId }: { shopId: string; shopName: string; userId: string }) {
  const t = useT()
  const key = `adp.kiranaHelperHint.${shopId}.${userId}`
  const [seen, setSeen] = useState(() => storage.get(key) === '1')
  if (seen) return null
  return (
    <Card className="flex flex-col gap-2 border-brand/40">
      <p className="font-semibold">{t('kiranaSetup.helperHintTitle', { shop: shopName })}</p>
      <p className="text-sm">{t('kiranaSetup.helperHintBody')}</p>
      <Button
        variant="secondary"
        onClick={() => {
          storage.set(key, '1')
          setSeen(true)
        }}
      >
        {t('kiranaSetup.gotIt')}
      </Button>
    </Card>
  )
}

/**
 * An unknown barcode made a product on the spot (F-11): name, piece or kg, price, without leaving the scanner. The rest
 * (stock, an alert) is on the full form, one tap away.
 */
function QuickProduct({ code, onSaved, onMore, onBack }: { code: string; onSaved: (p: Product) => void; onMore: () => void; onBack: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const shop = useShop()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState<Product['unit']>('PIECE')
  const [price, setPrice] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const nameErr = name.trim().length < 2 ? t('kiranaProducts.nameErrNew') : null
  const p = parseRupees(price, { maxPaise: 10_000_000 })
  async function save() {
    setTouched(true)
    if (nameErr || 'error' in p || busy) return
    setBusy(true)
    setError(null)
    try {
      const made = await kiranaApi.addProduct({ name: name.trim(), unit, pricePaise: p.paise, barcode: code })
      forgetLater(shop.id, code)
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
      onSaved(made)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const fe = (f: string) => fieldError(error, f)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <p className="text-sm text-muted">{t('kiranaSetup.quickAddIntro', { code })}</p>
      <Field id="quick-name" label={t('kiranaProducts.nameLabel')} value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} error={(touched && nameErr) || fe('name')} />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaProducts.soldBy')}>
        <Chip selected={unit === 'PIECE'} onClick={() => setUnit('PIECE')}>
          {t('kiranaProducts.unitPiece')}
        </Chip>
        <Chip selected={unit === 'KG'} onClick={() => setUnit('KG')}>
          {t('kiranaProducts.unitKg')}
        </Chip>
      </div>
      <Field
        id="quick-price"
        label={unit === 'KG' ? t('kiranaProducts.priceKgLabel') : t('kiranaProducts.priceOneLabel')}
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        error={(touched && 'error' in p ? p.error : undefined) || fe('pricePaise')}
      />
      {isApiError(error) && !fe('name') && !fe('pricePaise') && <ErrorBanner message={messageOf(error)} />}
      <Button type="submit" busy={busy}>
        {t('kiranaSetup.quickAddSave')}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={onMore}>
        {t('kiranaSetup.quickAddMore')}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={onBack}>
        {t('common.back')}
      </Button>
    </form>
  )
}

/**
 * Why the counter opened instead of where the person was going (AB#3, EF#2): a screen their role can't open (a helper
 * on /kirana/team) or a message with no screen of its own, said once: the shared note (components/ArrivedNote), with
 * its Help coming back to the counter.
 */
function CounterArrivedNote() {
  return <ArrivedNote helpFrom="/kirana/counter" />
}

