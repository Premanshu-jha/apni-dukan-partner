import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useKhata, type KhataCustomer } from '../../api/kirana'
import { useShop } from '../../api/shop'
import { Banner, Button, Field, Loading } from '../../components/ui'
import { parseRupees, rupeesInput } from '../../lib/kirana'
import { rupees } from '../../lib/money'
import { normalizePhone } from '../../lib/phone'
import { balanceText, MoreButton, SearchBox, useDebounced } from './common'

/**
 * Choosing whose khata a bill goes on: the book searched by name, note ("Tower B 1204") or phone digits, each with
 * what they owe and can still buy, or a new customer added on the spot (name and, for the WhatsApp reminder, a phone).
 */
export function KhataPicker({ onPick, chosenId }: { onPick: (c: KhataCustomer) => void; chosenId?: string | null }) {
  const [search, setSearch] = useState('')
  const settled = useDebounced(search)
  const book = useKhata(settled, false)
  const [adding, setAdding] = useState(false)
  const people = book.data?.pages.flatMap((p) => p.items).filter((c) => c.active) ?? []

  if (adding) return <NewCustomer start={search} onMade={onPick} onCancel={() => setAdding(false)} />
  return (
    <div className="flex flex-col gap-3">
      <SearchBox id="khata-search" label="Search the khata book" placeholder="Name, flat or phone" value={search} onChange={setSearch} />
      {book.isPending ? (
        <Loading />
      ) : book.isError && !book.data ? (
        <Banner tone="bad">
          {messageOf(book.error)}{' '}
          <button type="button" className="underline" onClick={() => void book.refetch()}>
            Try again
          </button>
        </Banner>
      ) : people.length === 0 ? (
        <p className="text-sm text-muted">{settled.trim() ? `No one called “${settled.trim()}” in your khata.` : 'Your khata book is empty.'}</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {people.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                aria-pressed={chosenId === c.id}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-raised ${chosenId === c.id ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
              >
                <span className="min-w-0">
                  <span className="block font-medium break-words">{c.name}</span>
                  {c.note && <span className="block text-xs text-muted break-words">{c.note}</span>}
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="block">{balanceText(c.balancePaise)}</span>
                  <span className="block text-muted">{c.availablePaise === null ? 'No limit' : `Can buy ${rupees(c.availablePaise)}`}</span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <MoreButton shown={book.hasNextPage} busy={book.isFetchingNextPage} onClick={() => void book.fetchNextPage()} />
          </li>
        </ul>
      )}
      <Button variant="secondary" onClick={() => setAdding(true)}>
        + New khata customer
      </Button>
    </div>
  )
}

/** A new khata customer: name, optional phone and note. The limit starts at ₹2,000; the owner can set another here. */
export function NewCustomer({ start = '', onMade, onCancel }: { start?: string; onMade: (c: KhataCustomer) => void; onCancel: () => void }) {
  const qc = useQueryClient()
  const owner = useShop().myRole === 'OWNER'
  const [limit, setLimit] = useState(rupeesInput(DEFAULT_LIMIT_PAISE))
  const [noLimit, setNoLimit] = useState(false)
  const [name, setName] = useState(/\d/.test(start) ? '' : start)
  const [phone, setPhone] = useState(/\d/.test(start) ? start : '')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const nameProblem = name.trim().length < 2 ? 'Enter the customer’s name (2 to 80 letters)' : null
  const phoneProblem = phone.trim() && !normalizePhone(phone) ? 'Enter a 10-digit mobile number, or leave it empty' : null
  const lim = owner && !noLimit ? parseRupees(limit, { zeroAllowed: true, maxPaise: 100_000_000 }) : null
  const limitProblem = lim && 'error' in lim ? lim.error : null

  async function save() {
    setTouched(true)
    setError(null)
    if (nameProblem || phoneProblem || limitProblem) return
    setBusy(true)
    try {
      // Only the owner sends a limit (a helper's would be refused): the backend's ₹2,000 otherwise
      const limits = !owner ? {} : noLimit ? { noLimit: true } : lim && 'paise' in lim && lim.paise !== DEFAULT_LIMIT_PAISE ? { creditLimitPaise: lim.paise } : {}
      const made = await kiranaApi.addCustomer({ name: name.trim(), phone: phone.trim() || undefined, note: note.trim() || undefined, ...limits })
      void qc.invalidateQueries({ queryKey: kiranaKeys.khataAll })
      onMade(made)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field id="new-customer-name" label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={(touched && nameProblem) || fieldError(error, 'name') || undefined} />
      <Field
        id="new-customer-phone"
        label="Mobile (optional)"
        hint="For the WhatsApp reminder."
        inputMode="tel"
        value={phone}
        maxLength={20}
        onChange={(e) => setPhone(e.target.value)}
        error={(touched && phoneProblem) || fieldError(error, 'phone') || undefined}
      />
      <Field id="new-customer-note" label="Note (optional)" hint="Like a flat number, to tell two people apart." value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} />
      {owner ? (
        <>
          {!noLimit && (
            <Field id="new-customer-limit" label="Khata limit (₹)" hint="How much they can owe at most." inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} error={(touched && limitProblem) || fieldError(error, 'creditLimitPaise') || undefined} />
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} className="h-5 w-5" />
            No limit
          </label>
        </>
      ) : (
        <p className="text-sm text-muted">They can buy up to {rupees(DEFAULT_LIMIT_PAISE)} on khata to start with. The owner can change the limit.</p>
      )}
      {error !== null && !fieldError(error, 'name') && !fieldError(error, 'phone') && (
        <Banner tone="bad">{messageOf(error)}</Banner>
      )}
      {isApiError(error, 'PHONE_TAKEN') && typeof error.details.customerId === 'string' && (
        <Button
          variant="secondary"
          busy={busy}
          onClick={async () => {
            // The customer already in the book with this number: picked as they are
            setBusy(true)
            try {
              onMade((await kiranaApi.customer(error.details.customerId as string)).customer)
            } catch (e) {
              setError(e)
            } finally {
              setBusy(false)
            }
          }}
        >
          Use the customer who has this number
        </Button>
      )}
      <Button busy={busy} onClick={save}>
        Add to the khata book
      </Button>
      <Button variant="ghost" disabled={busy} onClick={onCancel}>
        Back
      </Button>
    </div>
  )
}

/** The backend's starting limit for a new khata customer (KhataService.DEFAULT_LIMIT_PAISE). */
const DEFAULT_LIMIT_PAISE = 200_000
