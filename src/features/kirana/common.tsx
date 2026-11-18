import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { isApiError } from '../../api/errors'
import { kiranaKeys, type KhataEntry, type Payment, type PaidBy } from '../../api/kirana'
import { Button } from '../../components/ui'
import { rupees } from '../../lib/money'

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
          <button type="button" aria-label="Clear the search" className="h-10 w-10 text-muted" onClick={() => onChange('')}>
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

/** "Show more" under a paged list. */
export function MoreButton({ shown, busy, onClick }: { shown: boolean; busy: boolean; onClick: () => void }) {
  if (!shown) return null
  return (
    <Button variant="secondary" busy={busy} onClick={onClick}>
      Show more
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
  return p === 'CASH' ? 'Cash' : p === 'UPI' ? 'UPI' : 'Khata'
}

export function paidByText(p: PaidBy | null | undefined): string {
  return p === 'UPI' ? 'UPI' : 'cash'
}

/** A stock change's reason in a shopkeeper's words. */
export function moveText(reason: string): string {
  const words: Record<string, string> = {
    SALE: 'Sold',
    VOID: 'Bill cancelled',
    RETURN: 'Returned',
    RESTOCK: 'Stock came in',
    DAMAGED: 'Damaged or expired',
    COUNT: 'Counted',
  }
  return words[reason] ?? reason.charAt(0) + reason.slice(1).toLowerCase().replace(/_/g, ' ')
}

/** A khata entry in a shopkeeper's words. */
export function entryText(e: KhataEntry): string {
  switch (e.kind) {
    case 'SALE':
      return e.billNo ? `Bill ${e.billNo} on khata` : 'Bought on khata'
    case 'PAYMENT':
      return `Paid by ${paidByText(e.method)}`
    case 'VOID':
      return e.billNo ? `Bill ${e.billNo} cancelled` : 'Bill cancelled'
    case 'RETURN':
      return e.billNo ? `Items returned (bill ${e.billNo})` : 'Items returned'
    case 'CHANGE':
      return e.billNo ? `Bill ${e.billNo}: payment changed` : 'Payment changed'
    case 'REVERSAL':
      return 'Payment undone'
    case 'REFUND':
      return `Advance given back (${paidByText(e.method)})`
    default:
      return e.kind
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
  if (balancePaise > 0) return `Owes ${rupees(balancePaise)}`
  if (balancePaise < 0) return `Advance ${rupees(-balancePaise)}`
  return 'Settled'
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
export function UnsureNote({ what, onStartOver }: { what: string; onStartOver: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warn bg-warn/10 p-3 text-sm" role="status">
      <p>
        We couldn't tell if the {what} was saved. Save again as it is: it is recorded once, never twice.
      </p>
      <button type="button" className="self-start text-link underline" onClick={onStartOver}>
        It wasn't saved (checked the history): change it
      </button>
    </div>
  )
}
