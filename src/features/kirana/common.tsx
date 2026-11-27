import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { isApiError } from '../../api/errors'
import { kiranaKeys, type KhataEntry, type Payment, type PaidBy } from '../../api/kirana'
import { Button } from '../../components/ui'
import { t, useT } from '../../i18n'
import { rupees } from '../../lib/money'
import { isApp } from '../../lib/platform'

/** The value after the person stops typing for `ms` (a search box): one request per pause, never one per letter. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/** A search field with a clear button. */
export function SearchBox({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
        <span aria-hidden className="text-muted">
          ⌕
        </span>
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder ?? label}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          className="min-h-12 flex-1 bg-transparent text-base text-ink placeholder:text-muted/60 focus:outline-none"
        />
        {value && (
          <button type="button" aria-label={t('kiranaProducts.clearSearch')} className="h-10 w-10 text-muted" onClick={() => onChange('')}>
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

/** "Show more" under a paged list. */
export function MoreButton({ shown, busy, onClick }: { shown: boolean; busy: boolean; onClick: () => void }) {
  const t = useT()
  if (!shown) return null
  return (
    <Button variant="secondary" busy={busy} onClick={onClick}>
      {t('kiranaProducts.showMore')}
    </Button>
  )
}

/**
 * The answer never came (offline, the server's trouble): what was sent may or may not have been saved. A 503
 * SERVICE_BUSY is the backend saying it did nothing (too busy to start): a plain failure, safe to change and send again.
 */
export function outcomeUnknown(e: unknown): boolean {
  if (isApiError(e, 'SERVICE_BUSY')) return false
  return isApiError(e) ? e.status === 0 || e.status >= 500 : true
}

export function paymentText(p: Payment): string {
  return p === 'CASH' ? t('kiranaProducts.paymentCash') : p === 'UPI' ? 'UPI' : t('kiranaProducts.paymentKhata')
}

export function paidByText(p: PaidBy | null | undefined): string {
  // Each in the form that fills "{by}" in "paid now by {by}" (Marathi: रोखीने, UPI ने)
  return p === 'UPI' ? t('kiranaProducts.paidByUpi') : t('kiranaProducts.paidByCash')
}

/** A stock change's reason in a shopkeeper's words. */
export function moveText(reason: string): string {
  const words: Record<string, string> = {
    SALE: t('kiranaProducts.moveSale'),
    VOID: t('kiranaProducts.moveVoid'),
    RETURN: t('kiranaProducts.moveReturn'),
    RESTOCK: t('kiranaProducts.moveRestock'),
    DAMAGED: t('kiranaProducts.moveDamaged'),
    COUNT: t('kiranaProducts.moveCount'),
  }
  return words[reason] ?? t('kiranaProducts.moveOther')
}

/** A khata entry in a shopkeeper's words. */
export function entryText(e: KhataEntry): string {
  const billNo = String(e.billNo)
  switch (e.kind) {
    case 'SALE':
      return e.billNo ? t('kiranaProducts.entrySaleBill', { billNo }) : t('kiranaProducts.entrySale')
    case 'PAYMENT':
      return e.method === 'UPI' ? t('kiranaProducts.entryPaidUpi') : t('kiranaProducts.entryPaidCash')
    case 'VOID':
      return e.billNo ? t('kiranaProducts.entryVoidBill', { billNo }) : t('kiranaProducts.entryVoid')
    case 'RETURN':
      return e.billNo ? t('kiranaProducts.entryReturnBill', { billNo }) : t('kiranaProducts.entryReturn')
    case 'CHANGE':
      return e.billNo ? t('kiranaProducts.entryChangeBill', { billNo }) : t('kiranaProducts.entryChange')
    case 'REVERSAL':
      return t('kiranaProducts.entryReversal')
    case 'REFUND':
      return e.method === 'UPI' ? t('kiranaProducts.entryRefundUpi') : t('kiranaProducts.entryRefundCash')
    default:
      return t('kiranaProducts.entryOther')
  }
}

/** "+₹120" / "−₹50" for a signed amount. */
export function signed(paise: number): string {
  return `${paise < 0 ? '−' : '+'}${rupees(Math.abs(paise))}`
}

/** A row of label and value in a summary. */
export function SumRow({ label, value, strong = false }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'text-lg font-semibold' : 'text-sm'}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

/** A khata customer's balance in words: what they owe, their advance, or settled. */
export function balanceText(balancePaise: number): string {
  if (balancePaise > 0) return t('kiranaProducts.balanceOwes', { amount: rupees(balancePaise) })
  if (balancePaise < 0) return t('kiranaProducts.balanceAdvance', { amount: rupees(-balancePaise) })
  return t('kiranaProducts.balanceSettled')
}

/** Minutes since an instant (for a helper's 10 minutes). */
export function minutesSince(instant: string, now: number = Date.now()): number {
  return (now - Date.parse(instant)) / 60_000
}

const STALE = new Set(['BILL_CHANGED', 'KHATA_CHANGED', 'PRODUCT_CHANGED', 'BILL_HAS_RETURNS', 'KHATA_CUSTOMER_NOT_FOUND', 'PRODUCT_REMOVED'])

/** Someone else changed it meanwhile (another phone, the owner): reload what the screen shows so a retry starts from it. */
export function useRefreshOnStale(): (e: unknown) => void {
  const qc = useQueryClient()
  return (e) => {
    if (isApiError(e) && STALE.has(e.code)) void qc.invalidateQueries({ queryKey: kiranaKeys.all })
  }
}

/** A send whose answer never came: the same clientRef and values, kept until it is settled. */
export interface UnsureSend<V> {
  clientRef: string
  values: V
}

const UNSURE_PREFIX = 'adp.kiranaUnsure.'

function readUnsure<V>(key: string): UnsureSend<V> | null {
  try {
    const raw = sessionStorage.getItem(UNSURE_PREFIX + key)
    return raw ? (JSON.parse(raw) as UnsureSend<V>) : null
  } catch {
    return null
  }
}

/**
 * One form's money or stock send (a khata payment, an advance given back, a stock change, a return) that may have been
 * saved: kept in this tab under the form's key (customer, product, bill), so closing the sheet and opening it again
 * retries the very same send (recorded once) instead of a new one recorded twice. Until it is settled the values can't
 * change: a different amount with the same clientRef would come back as the first one.
 */
export function useUnsureSend<V>(key: string) {
  const [unsure, setUnsure] = useState<UnsureSend<V> | null>(() => readUnsure<V>(key))
  const [fresh, setFresh] = useState(() => crypto.randomUUID())
  return {
    clientRef: unsure?.clientRef ?? fresh,
    /** The values sent when the answer was lost; null when nothing is pending. */
    unsure: unsure?.values ?? null,
    /** The answer was lost: keep this send until it is settled. */
    keep(values: V) {
      const next = { clientRef: unsure?.clientRef ?? fresh, values }
      try {
        sessionStorage.setItem(UNSURE_PREFIX + key, JSON.stringify(next))
      } catch {
        /* storage full or blocked: still held for this screen */
      }
      setUnsure(next)
    },
    /** Saved, or certainly not saved: the next send is a new one. */
    settle() {
      try {
        sessionStorage.removeItem(UNSURE_PREFIX + key)
      } catch {
        /* nothing kept */
      }
      setUnsure(null)
      setFresh(crypto.randomUUID())
    },
  }
}

/** Shown while a send is unsure: what to do, and a way out once they've checked it wasn't saved. */
export function UnsureNote({ what, onStartOver }: {
  what: 'count' | 'restock' | 'takenOff' | 'return' | 'payment' | 'advanceBack'
  onStartOver: () => void
}) {
  const t = useT()
  // One whole sentence per thing saved (each language words it its own way)
  const key = `kiranaProducts.unsureSaved${what[0].toUpperCase()}${what.slice(1)}`
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warn bg-warn/10 p-3 text-sm" role="status">
      <p>{t(key)}</p>
      <button type="button" className="self-start text-link underline" onClick={onStartOver}>
        {t('kiranaProducts.unsureStartOver')}
      </button>
    </div>
  )
}

/**
 * A link that leaves the app (WhatsApp): a new tab on the website, a plain link in the Play Store app, where a new tab
 * does nothing in the WebView and the link is handed to WhatsApp itself (as ContactUs does).
 */
export function outsideLink(): { target?: string; rel?: string } {
  return isApp() ? {} : { target: '_blank', rel: 'noopener noreferrer' }
}

/**
 * For a helper refused something only the owner may do: "Ask the owner on WhatsApp", with the message typed in (the
 * helper picks the owner in WhatsApp; the app doesn't know the owner's number for a helper). Nothing is sent by the app.
 */
export function AskOwner({ message }: { message: string }) {
  const t = useT()
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(message)}`}
      {...outsideLink()}
      className="inline-flex min-h-11 items-center gap-1 text-sm text-link underline"
    >
      {t('kiranaSetup.askOwnerWhatsApp')}
    </a>
  )
}
