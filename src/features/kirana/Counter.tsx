import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { isApiError, messageOf } from '../../api/errors'
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
import { Banner, Button, Card, Chip, Field, Loading, Page, Sheet } from '../../components/ui'
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
import { WaitingForVisit } from '../shop/Home'
import { cartOwner, useCart } from './cart'
import { outcomeUnknown, paidByText, paymentText, SearchBox, SumRow, useDebounced } from './common'
import { KhataPicker } from './KhataPicker'
import { Scanner } from './Scanner'
import { UpiQrCode } from './UpiQrCode'

/**
 * The counter: scan or search what the customer buys, then Cash, UPI (the shop's own QR) or Khata. The bill being made
 * stays on this phone until it is saved; its clientRef makes a retried Save bill once.
 */
export function Counter() {
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
  const [khata, setKhata] = useState(false)
  const [editingLine, setEditingLine] = useState<CartLine | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gone, setGone] = useState<string[]>([])
  const [confirmEdit, setConfirmEdit] = useState(false)
  const [clearing, setClearing] = useState(false)
  // "What happens next" until the owner has read it (the approval bar at the top still says it waits)
  const [waitingSeen, setWaitingSeen] = useState(() => storage.get(`adp.kiranaWaitingSeen.${shop.id}`) === '1')
  const [limitHit, setLimitHit] = useState(false)
  /** The total the screen showed when Save was tapped: the receipt says so if the bill came out different. */
  const [shownTotal, setShownTotal] = useState<number | null>(null)
  const sending = useRef(false)

  const subtotal = subtotalOf(cart)
  const total = totalOf(cart)
  const locked = cart.unsure || busy

  function pickProduct(p: Product) {
    setError(null)
    if (billFull(p.unit === 'KG' ? undefined : p.id)) return setError(FULL)
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
        setError(`${messageOf(e)} We couldn't tell if the bill was saved. Try again: it is never billed twice.`)
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
    <Page title="Counter">
      {owner && shop.status === 'PENDING_VISIT' && !waitingSeen && (
        <div className="flex flex-col gap-1">
          <WaitingForVisit />
          <button
            type="button"
            className="min-h-11 self-end px-2 text-sm text-link underline"
            onClick={() => {
              storage.set(`adp.kiranaWaitingSeen.${shop.id}`, '1')
              setWaitingSeen(true)
            }}
          >
            Got it, hide this
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setScanning(true)} disabled={locked}>
          Scan
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setOther({ name: '' })} disabled={locked}>
          Item not in list
        </Button>
      </div>
      <SearchBox id="counter-search" label="Search your products" placeholder="Search by name or barcode" value={search} onChange={setSearch} />
      {settled.trim() && (
        <div aria-live="polite">
          {results.isPending ? (
            <Loading />
          ) : results.isError && !results.data ? (
            <Banner tone="bad">{messageOf(results.error)}</Banner>
          ) : found.length === 0 ? (
            <Card className="flex flex-col gap-2">
              <p className="text-sm text-muted">Nothing called “{settled.trim()}” in your products.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={locked} onClick={() => setOther({ name: settled.trim() })}>
                  Bill “{settled.trim()}” without a product
                </Button>
                {!locked && (
                  <Link to={`/kirana/products/new?${new URLSearchParams({ name: settled.trim(), from: '/kirana/counter' })}`} className="self-center text-sm text-link underline">
                    Add it as a product
                  </Link>
                )}
              </div>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Products found">
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
            {cart.lines.length ? `This bill (${cart.lines.length} ${cart.lines.length === 1 ? 'item' : 'items'})` : 'This bill'}
          </h2>
          {cart.lines.length > 0 && !locked && (
            <button type="button" className="min-h-11 px-2 text-sm text-bad underline" onClick={() => setClearing(true)}>
              Clear bill
            </button>
          )}
        </div>
        {cart.lines.length >= MAX_LINES && <Banner tone="warn">{FULL}</Banner>}
        {cart.lines.length === 0 ? (
          <p className="text-sm text-muted">Scan a pack, or search for a product above, to start a bill.</p>
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
          <SumRow label="Items" value={rupees(subtotal)} />
          <SumRow
            label={
              <button type="button" className="text-link underline disabled:opacity-50" disabled={locked} onClick={() => setDiscounting(true)}>
                {cart.discountPaise ? 'Discount (change)' : 'Add a discount'}
              </button>
            }
            value={cart.discountPaise ? `−${rupees(cart.discountPaise)}` : '—'}
          />
          <SumRow strong label="Total" value={rupees(total)} />
        </Card>
      )}

      {error && !khata && <Banner tone={cart.unsure ? 'warn' : 'bad'}>{error}</Banner>}
      {cart.unsure && cart.pending && (
        <Button busy={busy} onClick={() => save(cart.pending!.payment, { ...cart.pending! })}>
          Try again: {pendingLabel(cart.pending)} {rupees(total)}
        </Button>
      )}
      {cart.unsure && (
        <div className="flex flex-col gap-2">
          <Link to="/kirana/bills" className="text-sm text-link underline">
            Check the bills list
          </Link>
          <Button variant="ghost" onClick={() => setConfirmEdit(true)}>
            Change this bill anyway
          </Button>
        </div>
      )}

      {cart.lines.length > 0 && !cart.unsure && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] -mx-4 grid grid-cols-3 gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
          <Button busy={busy} onClick={() => save('CASH')} aria-label={`Cash ${rupees(total)}`}>
            Cash
          </Button>
          <Button busy={busy} onClick={() => save('UPI')} aria-label={`UPI ${rupees(total)}`}>
            UPI
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setKhata(true)} aria-label={`Khata ${rupees(total)}`}>
            Khata
          </Button>
        </div>
      )}

      <Sheet open={scanning} title="Scan" onClose={() => setScanning(false)}>
        <ScanPanel
          onProduct={(p, pack) => {
            if (billFull(p.id)) return false
            setError(null)
            set((c) => addProduct(c, p, pack))
            return true
          }}
          onLoose={(p) => {
            setScanning(false)
            if (billFull()) return setError(FULL)
            setLoose(p)
          }}
          onOther={(name) => {
            setScanning(false)
            if (billFull()) return setError(FULL)
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

      <Sheet open={other !== null} title="Item not in your list" onClose={() => setOther(null)}>
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

      <Sheet open={discounting} title="Discount on this bill" onClose={() => setDiscounting(false)}>
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

      <Sheet open={khata} title={`On khata · ${rupees(total)}`} onClose={() => !busy && setKhata(false)}>
        <KhataPay total={total} busy={busy} owner={owner} limitHit={limitHit} error={khata ? error : null} onPay={(c, paid) => save('KHATA', { khataCustomerId: c.id, khataName: c.name, ...paid })} />
      </Sheet>

      <Sheet open={done !== null} title={done ? `Bill ${done.bill.billNo} saved` : ''} onClose={() => setDone(null)}>
        {done && <Receipt result={done} owner={owner} shownTotal={shownTotal} onChange={setDone} onNext={() => setDone(null)} />}
      </Sheet>

      <Sheet open={confirmEdit} title="Change the bill anyway?" onClose={() => setConfirmEdit(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">
            The last try may have been saved. Look in Bills first: if it's there, don't bill it again, start a new bill
            instead. Changing it now and saving makes a new bill.
          </p>
          <Button variant="secondary" onClick={() => setConfirmEdit(false)}>
            Keep it as it is
          </Button>
          <Button
            onClick={() => {
              set((c) => ({ ...c, unsure: false, pending: null, clientRef: crypto.randomUUID() }))
              setError(null)
              setConfirmEdit(false)
            }}
          >
            Yes, change it
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clear()
              setError(null)
              setConfirmEdit(false)
            }}
          >
            It was saved: start a new bill
          </Button>
        </div>
      </Sheet>

      <Sheet open={clearing} title="Clear this bill?" onClose={() => setClearing(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">All {cart.lines.length} items come off. Nothing was saved yet, so nothing else changes.</p>
          <Button variant="secondary" onClick={() => setClearing(false)}>
            Keep it
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
            Clear the bill
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

const FULL = `A bill takes up to ${MAX_LINES} items: save this one and start another.`

function pendingLabel(p: PendingPayment): string {
  if (p.payment !== 'KHATA') return paymentText(p.payment)
  return `Khata${p.khataName ? ` (${p.khataName})` : ''}`
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
  const detail =
    line.kind === 'product'
      ? `${qtyWithUnit(line.milli, line.unit)} × ${rupees(line.pricePaise)}${priceUnit(line.unit)}`
      : line.kind === 'loose'
        ? `${rupees(line.amountPaise)} worth · about ${qtyText(weightFor(line.amountPaise, line.pricePaise))} kg`
        : `${line.qty} × ${rupees(line.amountPaise)} · not in your list`
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
      {gone && <p className="text-sm text-bad">Removed from your products meanwhile: take it off this bill.</p>}
      <div className="flex items-center justify-between gap-2">
        {pieces ? (
          <div className="flex items-center gap-1">
            <button type="button" aria-label={`One less ${line.name}`} disabled={disabled} onClick={() => step(-1)} className="h-11 w-11 rounded-full border border-line text-lg disabled:opacity-50">
              −
            </button>
            <span className="min-w-8 text-center">
              {count}
            </span>
            <button type="button" aria-label={`One more ${line.name}`} disabled={disabled} onClick={() => step(1)} className="h-11 w-11 rounded-full border border-line text-lg disabled:opacity-50">
              +
            </button>
            <button type="button" disabled={disabled} onClick={onEdit} className="ml-2 min-h-11 px-1 text-sm text-link underline disabled:opacity-50">
              Change
            </button>
          </div>
        ) : (
          <button type="button" disabled={disabled} onClick={onEdit} className="text-sm text-link underline disabled:opacity-50">
            Change
          </button>
        )}
        <button type="button" disabled={disabled} onClick={() => onChange(null)} className="min-h-11 px-2 text-sm text-bad disabled:opacity-50" aria-label={`Remove ${line.name}`}>
          Remove
        </button>
      </div>
    </li>
  )
}

/** Changing one line: how many (or the weight), or a loose item's amount, or an item not in the list's price. */
function EditLineForm({ line, onSave }: { line: CartLine; onSave: (l: CartLine) => void }) {
  const [value, setValue] = useState(() =>
    line.kind === 'product' ? qtyText(line.milli) : line.kind === 'loose' ? rupeesInput(line.amountPaise) : rupeesInput(line.amountPaise),
  )
  const [name, setName] = useState(line.kind === 'other' ? line.name : '')
  const [err, setErr] = useState<string | null>(null)
  const [nameErr, setNameErr] = useState<string | null>(null)
  function save() {
    if (line.kind === 'other' && !name.trim()) return setNameErr("Enter what it is")
    if (line.kind === 'product') {
      const q = parseQty(value, line.unit)
      if ('error' in q) return setErr(q.error)
      onSave({ ...line, milli: q.milli })
    } else {
      const r = parseRupees(value, { maxPaise: 10_000_000 })
      if ('error' in r) return setErr(r.error)
      if (line.kind === 'loose' && weightFor(r.paise, line.pricePaise) <= 0) return setErr(`That's less than a gram at ${rupees(line.pricePaise)}/kg`)
      onSave(line.kind === 'other' ? { ...line, amountPaise: r.paise, name: name.trim().slice(0, 100) } : { ...line, amountPaise: r.paise })
    }
  }
  const label = line.kind === 'product' ? (line.unit === 'KG' ? 'Weight (kg)' : 'How many') : line.kind === 'loose' ? 'Amount (₹)' : 'Price of one (₹)'
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {line.kind === 'other' && (
        <Field id="edit-line-name" label="What it is" value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setNameErr(null) }} error={nameErr ?? undefined} />
      )}
      <Field id="edit-line" label={label} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} error={err ?? undefined} autoFocus />
      <Button type="submit">Save</Button>
    </form>
  )
}

/** A loose product (sold by kg): by weight, or by the amount the customer asks for ("₹30 of sugar"). */
function LooseForm({ product, onAdd }: { product: Product; onAdd: (how: { milli: number } | { amountPaise: number }) => void }) {
  const [by, setBy] = useState<'weight' | 'amount'>('weight')
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const amount = by === 'amount' ? parseRupees(value, { maxPaise: 10_000_000 }) : null
  const weight = by === 'weight' ? parseQty(value, 'KG') : null
  const preview =
    weight && 'milli' in weight
      ? `${rupees(Math.floor((product.pricePaise * weight.milli + 500) / 1000))}`
      : amount && 'paise' in amount
        ? `about ${qtyText(weightFor(amount.paise, product.pricePaise))} kg`
        : null
  function add() {
    if (by === 'weight') {
      if (!weight || 'error' in weight) return setErr(weight?.error ?? 'Enter the weight')
      onAdd({ milli: weight.milli })
    } else {
      if (!amount || 'error' in amount) return setErr(amount?.error ?? 'Enter the amount')
      if (weightFor(amount.paise, product.pricePaise) <= 0) return setErr(`That's less than a gram at ${rupees(product.pricePaise)}/kg`)
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
      <p className="text-sm text-muted">{rupees(product.pricePaise)} a kg</p>
      <div className="flex gap-2" role="group" aria-label="Sell by">
        <Chip selected={by === 'weight'} onClick={() => { setBy('weight'); setValue(''); setErr(null) }}>
          By weight
        </Chip>
        <Chip selected={by === 'amount'} onClick={() => { setBy('amount'); setValue(''); setErr(null) }}>
          By amount (₹)
        </Chip>
      </div>
      <Field
        id="loose-value"
        label={by === 'weight' ? 'Weight in kg (0.5 for half a kilo)' : 'Amount in ₹ the customer asks for'}
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
      <Button type="submit">Add to the bill</Button>
    </form>
  )
}

/** An item not in the list: its name and the price of one, and how many. No stock is kept for it. */
function OtherForm({ start, onAdd }: { start: string; onAdd: (name: string, amountPaise: number, qty: number) => void }) {
  const [name, setName] = useState(start)
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [touched, setTouched] = useState(false)
  const nameErr = name.trim().length < 2 ? 'Enter what it is (2 to 100 letters)' : null
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
      <Field id="other-name" label="What is it?" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} error={(touched && nameErr) || undefined} autoFocus={!start} />
      <div className="grid grid-cols-2 gap-3">
        <Field id="other-price" label="Price of one (₹)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={touched && 'error' in p ? p.error : undefined} autoFocus={Boolean(start)} />
        <Field id="other-qty" label="How many" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} error={touched && 'error' in q ? q.error : undefined} />
      </div>
      <p className="text-sm text-muted">Sold often? Add it to your products, so its stock is kept and it scans.</p>
      <Button type="submit">Add to the bill</Button>
    </form>
  )
}

/** Off the whole bill. A helper up to ₹10 (a round-off); more is the owner's. */
function DiscountForm({ owner, subtotal, current, onSave }: { owner: boolean; subtotal: number; current: number; onSave: (paise: number) => void }) {
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
        if (r.paise > subtotal) return setErr(`At most the bill's ${rupees(subtotal)}`)
        if (!owner && r.paise > HELPER_DISCOUNT_PAISE) return setErr('A helper can take up to ₹10 off. Ask the owner for more.')
        onSave(r.paise)
      }}
    >
      <Field
        id="discount"
        label="Amount off (₹)"
        hint={owner ? `Up to ${rupees(cap)}.` : 'Up to ₹10, to round off. The owner can give more.'}
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setErr(null)
        }}
        error={err ?? undefined}
        autoFocus
      />
      <Button type="submit">Save</Button>
      {current > 0 && (
        <Button variant="ghost" onClick={() => onSave(0)}>
          No discount
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
}: {
  total: number
  busy: boolean
  owner: boolean
  limitHit: boolean
  error: string | null
  onPay: (c: KhataCustomer, paid: { paidNowPaise?: number; paidNowBy?: PaidBy }) => void
}) {
  const [who, setWho] = useState<KhataCustomer | null>(null)
  const [paid, setPaid] = useState('')
  const [by, setBy] = useState<PaidBy>('CASH')
  const [err, setErr] = useState<string | null>(null)
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
            {who.availablePaise === null ? 'No limit' : `Can buy ${rupees(who.availablePaise)} more on khata`}
          </span>
        </span>
        <button type="button" className="shrink-0 text-sm text-link underline" onClick={() => setWho(null)}>
          Change
        </button>
      </Card>
      <Field
        id="paid-now"
        label="Paid now (optional, ₹)"
        hint="Part paid at the counter: only the rest goes on their khata."
        inputMode="decimal"
        value={paid}
        onChange={(e) => {
          setPaid(e.target.value)
          setErr(null)
        }}
        error={err ?? undefined}
      />
      {paidNow > 0 && (
        <div className="flex gap-2" role="group" aria-label="Paid now by">
          <Chip selected={by === 'CASH'} onClick={() => setBy('CASH')}>
            Cash
          </Chip>
          <Chip selected={by === 'UPI'} onClick={() => setBy('UPI')}>
            UPI
          </Chip>
        </div>
      )}
      <SumRow strong label="On khata" value={rupees(Math.max(0, onKhata))} />
      {error && <Banner tone="bad">{error}</Banner>}
      {error && limitHit && owner && (
        <Link to={`/kirana/khata/${who.id}`} className="text-sm text-link underline">
          Change {who.name}'s khata limit
        </Link>
      )}
      <Button
        busy={busy}
        onClick={() => {
          if (r && 'error' in r) return setErr(r.error)
          if (paidNow >= total) return setErr(`Paid in full? Use Cash or UPI instead. Paid now must be less than ${rupees(total)}.`)
          onPay(who, paidNow ? { paidNowPaise: paidNow, paidNowBy: by } : {})
        }}
      >
        Put {rupees(Math.max(0, onKhata))} on {who.name}'s khata
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
      {result.repeated && <Banner tone="info">This bill was already saved from your earlier try: it wasn't billed twice.</Banner>}
      {shownTotal !== null && shownTotal !== b.totalPaise && (
        <Banner tone="warn">
          The saved bill is {rupees(b.totalPaise)}, not the {rupees(shownTotal)} the screen showed (a price changed meanwhile). Charge{' '}
          {rupees(b.totalPaise)}.
        </Banner>
      )}
      <SumRow strong label={paymentTitle(b.payment, b.paidNowPaise, b.paidNowBy)} value={rupees(b.totalPaise)} />
      {b.payment === 'CASH' && <CashChange total={b.totalPaise} />}
      {result.upi && <UpiQrCode upi={result.upi} />}
      {b.payment === 'UPI' && (
        <Button variant="secondary" busy={busy} onClick={() => void paidByCash()}>
          UPI didn't work: paid by cash instead
        </Button>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      {result.upiIdMissing && (
        <Banner tone="warn">
          No QR: the shop's UPI ID isn't set.{' '}
          {owner ? (
            <Link to="/kirana/upi" className="underline">
              Set it now
            </Link>
          ) : (
            'Ask the owner to set it.'
          )}
        </Banner>
      )}
      {result.khata && (
        <p className="text-sm">
          {result.khata.name}: owes {rupees(result.khata.owesPaise)} now
          {result.khata.availablePaise !== null && ` · can buy ${rupees(result.khata.availablePaise)} more`}
        </p>
      )}
      {low.length > 0 && (
        <Banner tone="warn">
          Running out: {low.map((s) => `${s.name} (${qtyWithUnit(Math.round(s.after * 1000), s.unit)} left)`).join(', ')}
        </Banner>
      )}
      <Link to={`/kirana/bills/${b.id}`} className="text-sm text-link underline">
        Open the bill (cancel, returns, change payment)
      </Link>
      <Button onClick={onNext}>Next bill</Button>
    </div>
  )
}

/** Cash handed over → the change to give back. */
function CashChange({ total }: { total: number }) {
  const [given, setGiven] = useState('')
  const r = given.trim() ? parseRupees(given) : null
  const paise = r && 'paise' in r ? r.paise : null
  return (
    <div className="flex flex-col gap-1">
      <Field
        id="cash-given"
        label="Cash given (optional, ₹)"
        inputMode="decimal"
        value={given}
        onChange={(e) => setGiven(e.target.value)}
        error={r && 'error' in r ? r.error : undefined}
      />
      {paise !== null && (
        <p className="text-sm font-semibold" aria-live="polite">
          {paise >= total ? `Give back ${rupees(paise - total)}` : `${rupees(total - paise)} short`}
        </p>
      )}
    </div>
  )
}

function paymentTitle(p: Payment, paidNow: number | null, paidBy: PaidBy | null): string {
  if (p !== 'KHATA') return `Paid by ${paymentText(p)}`
  return paidNow ? `On khata (${rupees(paidNow)} paid now by ${paidByText(paidBy)})` : 'On khata'
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
  const navigate = useNavigate()
  const [last, setLast] = useState<string | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)

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
        setError(FULL)
        return
      }
      setLast(`${product.name}${pack !== 1 ? ` × ${qtyText(Math.round(pack * 1000))}` : ''} added`)
      setUnknown(null)
    } catch (e) {
      if (isApiError(e, 'PRODUCT_NOT_FOUND')) setUnknown(code)
      else setError(messageOf(e))
    }
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
            setLast(onProduct(p, packMilli) ? `${p.name} added (barcode saved)` : `Barcode saved. ${FULL}`)
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
          <p className="font-semibold">Barcode {unknown} isn't in your products yet</p>
          <Button onClick={() => navigate(`/kirana/products/new?${new URLSearchParams({ barcode: unknown, from: '/kirana/counter' })}`)}>
            Add a new product
          </Button>
          <Button variant="secondary" onClick={() => setLinking(true)}>
            It's a product I already have
          </Button>
          <Button variant="secondary" onClick={() => onOther('')}>
            Bill it without a product
          </Button>
          <Button variant="ghost" onClick={() => setUnknown(null)}>
            Scan again
          </Button>
        </Card>
      )}
      <Button variant={lines ? 'primary' : 'secondary'} onClick={onDone}>
        {lines ? `Done: back to the bill (${lines})` : 'Close'}
      </Button>
    </div>
  )
}

/** A barcode for a product already in the list (a new pack design, another MRP batch): saved, then billed. */
export function LinkBarcode({ code, onLinked, onBack }: { code: string; onLinked: (p: Product, packMilli: number) => void; onBack: () => void }) {
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
    if ('error' in k) return setError(`Pieces in one scan: ${k.error}`)
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
      <p className="text-sm text-muted">Which product has barcode {code}? It scans as that product from now on.</p>
      <Field
        id="link-pack"
        label="Pieces in one scan"
        hint="1 for a single pack; 12 if this barcode is on a carton of 12."
        inputMode="decimal"
        value={pack}
        onChange={(e) => {
          setPack(e.target.value)
          setError(null)
        }}
      />
      <SearchBox id="link-search" label="Search for the product" value={search} onChange={setSearch} />
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
          {items.length === 0 && <li className="text-sm text-muted">No products found.</li>}
        </ul>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
    </div>
  )
}
