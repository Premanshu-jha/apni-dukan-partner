import type { NewLine, Product, Unit } from '../api/kirana'

/**
 * The counter's arithmetic and wording, in one place so the screens and the tests agree with the backend's
 * Quantities: money is whole paise; a quantity is kept here in thousandths ("milli": grams of a kg, or 1000 per
 * piece) so 0.1 + 0.2 never drifts, and is sent as a plain number.
 */

/** The most on one bill line, or in one stock change that came in or was damaged (Quantities.MAX). */
export const MAX_QTY = 9999
/** The most a stock count can be set to (Quantities.MAX_STOCK). */
export const MAX_STOCK = 999999
/** A helper may take up to ₹10 off a bill (a round-off); more is the owner's. */
export const HELPER_DISCOUNT_PAISE = 1000
/** A helper may change his own bill or undo his own khata payment within this many minutes. */
export const HELPER_MINUTES = 10

/** price × quantity, to the nearest paisa (half up), as Quantities.amount. */
export function amountOf(pricePaise: number, milli: number): number {
  return Math.floor((pricePaise * milli + 500) / 1000)
}

/** The weight a loose amount buys, to the gram (half up), as BillService.productLine; in milli. */
export function weightFor(amountPaise: number, pricePaise: number): number {
  return Math.floor((amountPaise * 1000 * 2 + pricePaise) / (2 * pricePaise))
}

/** "2" for pieces, "0.25" for kg: no trailing zeros. */
export function qtyText(milli: number): string {
  const sign = milli < 0 ? '-' : ''
  const m = Math.abs(milli)
  const whole = Math.floor(m / 1000)
  const rest = m % 1000
  if (!rest) return `${sign}${whole}`
  return `${sign}${whole}.${String(rest).padStart(3, '0').replace(/0+$/, '')}`
}

/** A quantity from the backend (a JSON number) in milli. */
export function toMilli(q: number): number {
  return Math.round(q * 1000)
}

/** "2 pcs", "1 pc", "0.25 kg". */
export function qtyWithUnit(milli: number, unit: Unit): string {
  if (unit === 'KG') return `${qtyText(milli)} kg`
  return `${qtyText(milli)} ${Math.abs(milli) === 1000 ? 'pc' : 'pcs'}`
}

/** "₹48/kg" or "₹20 each". */
export function priceUnit(unit: Unit): string {
  return unit === 'KG' ? '/kg' : ' each'
}

/**
 * A quantity typed by a person, in milli, or the reason it can't be used: pieces whole, kg to the gram, more than 0
 * (or 0 itself when `zeroAllowed`, a count by hand), at most `max`.
 */
export function parseQty(typed: string, unit: Unit, opts: { zeroAllowed?: boolean; max?: number } = {}): { milli: number } | { error: string } {
  const t = typed.trim().replace(',', '.')
  if (!t) return { error: 'Enter how many' }
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: unit === 'KG' ? 'Enter the weight in kg, like 0.5' : 'Enter a whole number' }
  const [whole, frac = ''] = t.split('.')
  if (unit === 'PIECE' && frac.replace(/0+$/, '')) return { error: 'Pieces are whole numbers' }
  if (frac.replace(/0+$/, '').length > 3) return { error: 'At most 3 decimals (grams)' }
  const milli = Number(whole) * 1000 + Number((frac + '000').slice(0, 3))
  const max = (opts.max ?? (opts.zeroAllowed ? MAX_STOCK : MAX_QTY)) * 1000
  if (opts.zeroAllowed ? milli < 0 : milli <= 0) return { error: 'Must be more than 0' }
  if (milli > max) return { error: `At most ${qtyText(max)}` }
  return { milli }
}

/** Rupees typed by a person ("45", "45.5", "1,250") in paise, or the reason it can't be used. */
export function parseRupees(typed: string, opts: { zeroAllowed?: boolean; maxPaise?: number } = {}): { paise: number } | { error: string } {
  const t = typed.trim().replace(/[₹,\s]/g, '')
  if (!t) return { error: 'Enter the amount' }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: 'Enter rupees, like 45 or 45.50' }
  const [whole, frac = ''] = t.split('.')
  const paise = Number(whole) * 100 + Number((frac + '00').slice(0, 2))
  if (!opts.zeroAllowed && paise <= 0) return { error: 'Must be more than ₹0' }
  if (opts.maxPaise !== undefined && paise > opts.maxPaise) return { error: `At most ₹${(opts.maxPaise / 100).toLocaleString('en-IN')}` }
  return { paise }
}

/** Paise as people type rupees back into a field: "45", "45.5". */
export function rupeesInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2).replace(/0$/, '')
}

/** The shop's UPI ID as the backend keeps it (UpiIds.clean), and whether it looks like name@bank (UpiIds.valid). */
export function cleanUpiId(typed: string): string {
  return typed.replace(/\s+/g, '').toLowerCase()
}
export function upiIdLooksRight(cleaned: string): boolean {
  return /^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,31}$/.test(cleaned)
}

// ---------- the bill being made at the counter ----------

export type CartLine =
  /** A listed product by quantity (a scan adds its pack). */
  | { key: string; kind: 'product'; productId: string; name: string; unit: Unit; pricePaise: number; milli: number }
  /** A loose product (kg) sold by the amount the customer asked for: "₹30 of sugar". */
  | { key: string; kind: 'loose'; productId: string; name: string; pricePaise: number; amountPaise: number }
  /** An item not in the list: a name and its price, no stock kept. */
  | { key: string; kind: 'other'; name: string; amountPaise: number; qty: number }

/** The most lines one bill takes (the backend refuses more). */
export const MAX_LINES = 100

/** How a bill was being paid when its answer never came: a retry must send exactly this again. */
export interface PendingPayment {
  payment: 'CASH' | 'UPI' | 'KHATA'
  khataCustomerId?: string
  khataName?: string
  paidNowPaise?: number
  paidNowBy?: 'CASH' | 'UPI'
}

export interface Cart {
  /** The bill's clientRef: a retry with it never bills twice. A new one once a bill is saved. */
  clientRef: string
  lines: CartLine[]
  discountPaise: number
  /**
   * The last Save's answer never came (network, 5xx): the bill may or may not be saved. Editing then would be billed
   * as the first try's bill (the same clientRef), so the counter asks first.
   */
  unsure: boolean
  /** While unsure: the payment that was being saved (only it can be tried again). */
  pending?: PendingPayment | null
}

export function newCart(): Cart {
  return { clientRef: crypto.randomUUID(), lines: [], discountPaise: 0, unsure: false, pending: null }
}

export function lineAmount(l: CartLine): number {
  if (l.kind === 'product') return amountOf(l.pricePaise, l.milli)
  if (l.kind === 'loose') return l.amountPaise
  return l.amountPaise * l.qty
}

export function subtotalOf(cart: Cart): number {
  return cart.lines.reduce((t, l) => t + lineAmount(l), 0)
}

export function totalOf(cart: Cart): number {
  return Math.max(0, subtotalOf(cart) - cart.discountPaise)
}

/**
 * Adds a product by quantity (a scan: its pack, else 1 piece): onto its line if already on the bill. The product as
 * just read (a scan or a search) also refreshes the price and name of the bill's lines of it, so a price changed
 * since they were added shows before Save.
 */
export function addProduct(cart: Cart, p: Pick<Product, 'id' | 'name' | 'unit' | 'pricePaise'>, milli: number): Cart {
  const fresh = withPrices(cart, p)
  const at = fresh.lines.findIndex((l) => l.kind === 'product' && l.productId === p.id)
  if (at >= 0) {
    const l = fresh.lines[at] as Extract<CartLine, { kind: 'product' }>
    const lines = [...fresh.lines]
    lines[at] = { ...l, milli: Math.min(l.milli + milli, MAX_QTY * 1000) }
    return { ...fresh, lines }
  }
  if (fresh.lines.length >= MAX_LINES) return fresh
  cart = fresh
  return {
    ...cart,
    lines: [...cart.lines, { key: crypto.randomUUID(), kind: 'product', productId: p.id, name: p.name, unit: p.unit, pricePaise: p.pricePaise, milli: Math.min(milli, MAX_QTY * 1000) }],
  }
}

export function addLoose(cart: Cart, p: Pick<Product, 'id' | 'name' | 'pricePaise'>, amountPaise: number): Cart {
  const fresh = withPrices(cart, p)
  if (fresh.lines.length >= MAX_LINES) return fresh
  return { ...fresh, lines: [...fresh.lines, { key: crypto.randomUUID(), kind: 'loose', productId: p.id, name: p.name, pricePaise: p.pricePaise, amountPaise }] }
}

export function addOther(cart: Cart, name: string, amountPaise: number, qty: number): Cart {
  if (cart.lines.length >= MAX_LINES) return cart
  return { ...cart, lines: [...cart.lines, { key: crypto.randomUUID(), kind: 'other', name: name.trim(), amountPaise, qty }] }
}

/** The bill's lines of this product with its current name and price (a price changed since they were added). */
export function withPrices(cart: Cart, p: Pick<Product, 'id' | 'name' | 'pricePaise'>): Cart {
  if (!cart.lines.some((l) => l.kind !== 'other' && l.productId === p.id && (l.pricePaise !== p.pricePaise || l.name !== p.name))) return cart
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.kind !== 'other' && l.productId === p.id ? { ...l, name: p.name, pricePaise: p.pricePaise } : l)),
  }
}

export function setLine(cart: Cart, key: string, change: (l: CartLine) => CartLine | null): Cart {
  const lines = cart.lines.flatMap((l) => {
    if (l.key !== key) return [l]
    const next = change(l)
    return next ? [next] : []
  })
  // A discount bigger than what is left on the bill would be refused: it shrinks with the bill
  const sub = lines.reduce((t, l) => t + lineAmount(l), 0)
  return { ...cart, lines, discountPaise: Math.min(cart.discountPaise, sub) }
}

/** The lines as POST /kirana/bills takes them. */
export function linesToSend(cart: Cart): NewLine[] {
  return cart.lines.map((l) => {
    if (l.kind === 'product') return { productId: l.productId, quantity: l.milli / 1000 }
    if (l.kind === 'loose') return { productId: l.productId, amountPaise: l.amountPaise }
    return l.qty === 1 ? { name: l.name, amountPaise: l.amountPaise } : { name: l.name, amountPaise: l.amountPaise, quantity: l.qty }
  })
}

/**
 * The WhatsApp reminder for a customer who owes: a wa.me link with the message typed in (nothing is sent by the app;
 * the owner presses send in WhatsApp).
 */
export function whatsAppReminder(phone: string, name: string, owesPaise: number, shopName: string, rupees: (p: number) => string): string {
  const text = `Namaste ${name}, a gentle reminder from ${shopName}: ${rupees(owesPaise)} is due on your khata. Please pay at your convenience. Thank you!`
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
}
