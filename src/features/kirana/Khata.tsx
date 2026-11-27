import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useCustomer, useKhata, type KhataCustomer, type KhataEntry, type PaidBy } from '../../api/kirana'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, Chip, EmptyState, ErrorState, Field, Loading, Page, Sheet, Switch } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { HELPER_MINUTES, parseRupees, rupeesInput, whatsAppReminder } from '../../lib/kirana'
import { rupees } from '../../lib/money'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { useT } from '../../i18n'
import { useSession } from '../../store/session'
import { balanceText, entryText, minutesSince, MoreButton, outcomeUnknown, SearchBox, signed, SumRow, useDebounced, UnsureNote, useRefreshOnStale, useUnsureSend } from './common'
import { NewCustomer } from './KhataPicker'
import { cameFrom } from '../shop/Register'

/** The khata book: who owes what, searched by name, note or phone; everyone or only those who owe. */
export function Khata() {
  const t = useT()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [owing, setOwing] = useState(false)
  const [adding, setAdding] = useState(false)
  const settled = useDebounced(search)
  const book = useKhata(settled, owing)
  const first = book.data?.pages[0]
  const people = book.data?.pages.flatMap((p) => p.items) ?? []
  return (
    <Page title={t('kiranaBills.khataTitle')}>
      {first && (
        <Card className="flex flex-col gap-1">
          <SumRow strong label={t('kiranaBills.owedToYou')} value={rupees(first.owedPaise)} />
          {first.advancesPaise > 0 && <SumRow label={t('kiranaBills.advancesYouHold')} value={rupees(first.advancesPaise)} />}
        </Card>
      )}
      <Button variant="secondary" onClick={() => setAdding(true)}>
        {t('kiranaBills.newKhataCustomerButton')}
      </Button>
      <SearchBox id="khata-list-search" label={t('kiranaBills.searchKhataBook')} placeholder={t('kiranaBills.searchPlaceholder')} value={search} onChange={setSearch} />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaBills.showFilter')}>
        <Chip selected={!owing} onClick={() => setOwing(false)}>
          {t('kiranaBills.everyone')}
        </Chip>
        <Chip selected={owing} onClick={() => setOwing(true)}>
          {t('kiranaBills.onlyWhoOwe')}
        </Chip>
      </div>
      {book.isPending ? (
        <Loading />
      ) : book.isError && !book.data ? (
        <ErrorState message={messageOf(book.error)} onRetry={() => book.refetch()} />
      ) : people.length === 0 ? (
        settled.trim() || owing ? (
          <p className="text-sm text-muted">{owing ? t('kiranaBills.nobodyOwes') : t('kiranaBills.noOneCalled', { name: settled.trim() })}</p>
        ) : (
          <EmptyState title={t('kiranaBills.noKhataTitle')} body={t('kiranaBills.noKhataBody')} />
        )
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((c) => (
            <li key={c.id}>
              <Link to={`/kirana/khata/${c.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-raised">
                <span className="min-w-0">
                  <span className="block font-medium break-words">
                    {c.name}
                    {!c.active && <span className="text-xs text-muted"> {t('kiranaBills.takenOut')}</span>}
                  </span>
                  {c.note && <span className="block text-xs text-muted break-words">{c.note}</span>}
                </span>
                <span className={`shrink-0 text-sm ${c.balancePaise > 0 ? 'font-semibold' : 'text-muted'}`}>{balanceText(c.balancePaise)}</span>
              </Link>
            </li>
          ))}
          <li>
            <MoreButton shown={book.hasNextPage} busy={book.isFetchingNextPage} onClick={() => void book.fetchNextPage()} />
          </li>
        </ul>
      )}
      <Sheet open={adding} title={t('kiranaBills.newKhataCustomerTitle')} onClose={() => setAdding(false)}>
        {adding && <NewCustomer start={search} onMade={(c) => navigate(`/kirana/khata/${c.id}`)} onCancel={() => setAdding(false)} />}
      </Sheet>
    </Page>
  )
}

/**
 * One khata customer: what they owe (or their advance), their limit, every bill and payment, recording a payment,
 * undoing one recorded by mistake, the WhatsApp reminder, and the owner's changes (limit, advance back, taking out).
 */
export function Customer() {
  const t = useT()
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const shop = useShop()
  const userId = useSession((s) => s.user?.id ?? '')
  const owner = shop.myRole === 'OWNER'
  const detail = useCustomer(id)
  // Opened from the counter's khata sheet (over the limit, F-10): Back goes to the bill, and the sheet opens again
  const back = cameFrom(useLocation(), '/kirana/khata')
  const [paying, setPaying] = useState(false)
  const [undo, setUndo] = useState<KhataEntry | null>(null)
  const [editing, setEditing] = useState(false)
  const [giving, setGiving] = useState(false)
  if (detail.isPending) return <Page back={back} title={t('kiranaBills.khataTitle')}><Loading /></Page>
  if (detail.isError && !detail.data) {
    return (
      <Page back={back} title={t('kiranaBills.khataTitle')}>
        <ErrorState message={messageOf(detail.error)} onRetry={() => detail.refetch()} />
      </Page>
    )
  }
  const c = detail.data.pages[0].customer
  const entries = detail.data.pages.flatMap((p) => p.entries)
  const refresh = () => qc.invalidateQueries({ queryKey: kiranaKeys.all })
  // A helper undoes only a payment he recorded, within 10 minutes (the backend has the final say)
  const mayUndo = (e: KhataEntry) =>
    e.kind === 'PAYMENT' && !e.reversed && (owner || (!!e.byId && e.byId === userId && minutesSince(e.at) < HELPER_MINUTES))

  return (
    <Page back={back} title={t('kiranaBills.khataTitle')}>
      {back === '/kirana/counter' && (
        <Link to="/kirana/counter" className="flex min-h-12 items-center justify-center rounded-xl border border-brand/60 bg-raised px-4 font-semibold">
          {t('kiranaSetup.backToBill')}
        </Link>
      )}
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold break-words">{c.name}</h2>
            {c.note && <p className="text-sm text-muted break-words">{c.note}</p>}
            {c.phone && <p className="text-sm text-muted">+91 {formatPhone(c.phone)}</p>}
          </div>
          <button type="button" className="shrink-0 text-sm text-link" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </button>
        </div>
        <p className={`text-2xl font-bold ${c.balancePaise > 0 ? '' : 'text-good'}`}>{balanceText(c.balancePaise)}</p>
        <p className="text-sm text-muted">
          {c.creditLimitPaise === null ? t('kiranaBills.noLimit') : t('kiranaBills.limitAndMore', { limit: rupees(c.creditLimitPaise), more: rupees(c.availablePaise ?? 0) })}
        </p>
        {!c.active && <Banner tone="info">{t('kiranaBills.takenOutBanner')}</Banner>}
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setPaying(true)} disabled={!c.active}>
          {t('kiranaBills.theyPaid')}
        </Button>
        {c.phone && c.owesPaise > 0 ? (
          <a
            href={whatsAppReminder(c.phone, c.name, c.owesPaise, shop.name, rupees)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-raised px-3 text-center hover:bg-line"
          >
            {t('kiranaBills.whatsAppReminder')}
          </a>
        ) : (
          c.phone ? (
            <Button variant="secondary" disabled>
              {t('kiranaBills.nothingOwed')}
            </Button>
          ) : (
            <Button variant="secondary" disabled={!c.active} onClick={() => setEditing(true)}>
              {t('kiranaBills.addMobileForWhatsApp')}
            </Button>
          )
        )}
      </div>
      {owner && c.advancePaise > 0 && (
        <Button variant="secondary" onClick={() => setGiving(true)}>
          {t('kiranaBills.giveBackAdvanceAmount', { amount: rupees(c.advancePaise) })}
        </Button>
      )}

      <section aria-labelledby="entries" className="flex flex-col gap-2">
        <h2 id="entries" className="font-semibold">
          {t('kiranaBills.history')}
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">{t('kiranaBills.nothingYet')}</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 border-b border-line py-2 text-sm">
                <span className="min-w-0">
                  <span className={`block ${e.reversed ? 'line-through text-muted' : ''}`}>
                    {e.billId ? (
                      <Link to={`/kirana/bills/${e.billId}`} className="text-link underline">
                        {entryText(e)}
                      </Link>
                    ) : (
                      entryText(e)
                    )}
                    {e.reversed && ` ${t('kiranaBills.undone')}`}
                  </span>
                  <span className="block text-xs text-muted break-words">
                    {dateTimeIst(e.at)}
                    {e.byName && ` · ${e.byName}`}
                    {e.note && ` · ${e.note}`}
                  </span>
                  {mayUndo(e) && (
                    <button type="button" className="min-h-11 text-xs text-bad underline" onClick={() => setUndo(e)}>
                      {t('kiranaBills.undoThisPayment')}
                    </button>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block">{signed(e.amountPaise)}</span>
                  <span className="block text-xs text-muted">{balanceText(e.balanceAfter)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <MoreButton shown={detail.hasNextPage} busy={detail.isFetchingNextPage} onClick={() => void detail.fetchNextPage()} />
      </section>

      <Sheet open={paying} title={t('kiranaBills.paidSheetTitle', { name: c.name })} onClose={() => setPaying(false)}>
        {paying && (
          <PaymentForm
            c={c}
            onDone={() => {
              setPaying(false)
              void refresh()
            }}
          />
        )}
      </Sheet>
      <Sheet open={undo !== null} title={t('kiranaBills.undoThisPaymentTitle')} onClose={() => setUndo(null)}>
        {undo && (
          <UndoForm
            c={c}
            entry={undo}
            onDone={() => {
              setUndo(null)
              void refresh()
            }}
          />
        )}
      </Sheet>
      <Sheet open={editing} title={t('kiranaBills.editName', { name: c.name })} onClose={() => setEditing(false)}>
        {editing && (
          <EditCustomer
            c={c}
            owner={owner}
            onDone={() => {
              setEditing(false)
              void refresh()
            }}
          />
        )}
      </Sheet>
      <Sheet open={giving} title={t('kiranaBills.giveBackAdvanceTitle')} onClose={() => setGiving(false)}>
        {giving && (
          <AdvanceBack
            c={c}
            onDone={() => {
              setGiving(false)
              void refresh()
            }}
          />
        )}
      </Sheet>
    </Page>
  )
}

/** A payment received: cash or UPI. More than they owe asks whether to keep the rest as their advance. */
function PaymentForm({ c, onDone }: { c: KhataCustomer; onDone: () => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const send = useUnsureSend<{ amountPaise: number; method: PaidBy; note?: string; advance?: boolean }>(`pay:${c.id}`)
  const held = send.unsure
  const [amount, setAmount] = useState(held ? rupeesInput(held.amountPaise) : c.owesPaise > 0 ? rupeesInput(c.owesPaise) : '')
  const [method, setMethod] = useState<PaidBy>(held?.method ?? 'CASH')
  const [note, setNote] = useState(held?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advanceAsk, setAdvanceAsk] = useState<{ extra: number; after: number } | null>(null)

  async function save(advance = false) {
    let values = held
    if (!values) {
      const r = parseRupees(amount, { maxPaise: 100_000_000 })
      if ('error' in r) return setError(r.error)
      values = { amountPaise: r.paise, method, note: note.trim() || undefined, advance: advance || undefined }
    }
    setBusy(true)
    setError(null)
    try {
      await kiranaApi.pay(c.id, { clientRef: send.clientRef, ...values })
      send.settle()
      onDone()
    } catch (e) {
      stale(e)
      if (isApiError(e, 'MORE_THAN_OWED')) {
        send.settle()
        const owes = Math.max(0, c.owesPaise)
        setAdvanceAsk({ extra: Number(e.details.advancePaise ?? values.amountPaise - owes), after: Number(e.details.advanceAfterPaise ?? 0) })
      } else if (outcomeUnknown(e)) {
        send.keep(values)
        setAdvanceAsk(null)   // back to the form, locked on what was sent, with "We couldn't tell"
        setError(messageOf(e))
      } else {
        setError(messageOf(e))
      }
    } finally {
      setBusy(false)
    }
  }

  if (advanceAsk !== null) {
    return (
      <div className="flex flex-col gap-3">
        <p>
          {t('kiranaBills.payAdvanceAsk', {
            extra: rupees(advanceAsk.extra),
            name: c.name,
            owes: rupees(Math.max(0, c.owesPaise)),
            after: rupees(advanceAsk.after),
          })}
        </p>
        {error && <Banner tone="bad">{error}</Banner>}
        <Button busy={busy} onClick={() => void save(true)}>
          {t('kiranaBills.yesKeepAmountAsAdvance', { amount: rupees(advanceAsk.extra) })}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setAdvanceAsk(null)
            setAmount(rupeesInput(c.owesPaise))
          }}
        >
          {t('kiranaBills.noChangeAmount')}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('kiranaBills.owesNow', { amount: rupees(c.owesPaise) })}</p>
      {held && <UnsureNote what="payment" onStartOver={() => { send.settle(); setError(null) }} />}
      <Field id="pay-amount" label={t('kiranaBills.amountRupees')} inputMode="decimal" value={amount} disabled={!!held} onChange={(e) => { setAmount(e.target.value); setError(null) }} error={error ?? undefined} autoFocus={!held} />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaBills.paidBy')}>
        <Chip selected={method === 'CASH'} disabled={!!held} onClick={() => setMethod('CASH')}>
          {t('kiranaBills.cash')}
        </Chip>
        <Chip selected={method === 'UPI'} disabled={!!held} onClick={() => setMethod('UPI')}>
          UPI
        </Chip>
      </div>
      <Field id="pay-note" label={t('kiranaBills.noteOptional')} value={note} disabled={!!held} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      <Button busy={busy} onClick={() => void save()}>
        {t('kiranaBills.savePayment')}
      </Button>
    </div>
  )
}

/** A payment recorded by mistake (wrong customer, ₹500 for ₹50) is undone; it stays in the history marked undone. */
function UndoForm({ c, entry, onDone }: { c: KhataCustomer; entry: KhataEntry; onDone: () => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function save() {
    setBusy(true)
    setError(null)
    try {
      await kiranaApi.reverse(c.id, entry.id, reason.trim())
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
      <p>
        {t(entry.method === 'UPI' ? 'kiranaBills.undoPaidByUpi' : 'kiranaBills.undoPaidByCash', {
          amount: rupees(Math.abs(entry.amountPaise)),
          when: dateTimeIst(entry.at),
          name: c.name,
        })}
      </p>
      <Field id="undo-reason" label={t('kiranaBills.why')} hint={t('kiranaBills.undoReasonHint')} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} error={fieldError(error, 'reason')} />
      {error !== null && !fieldError(error, 'reason') && <Banner tone="bad">{messageOf(error)}</Banner>}
      <Button variant="danger" busy={busy} disabled={reason.trim().length < 2} onClick={save}>
        {t('kiranaBills.undoThePayment')}
      </Button>
    </div>
  )
}

/** Name, phone, note; the owner also the limit (or none) and taking them out of the book. */
function EditCustomer({ c, owner, onDone }: { c: KhataCustomer; owner: boolean; onDone: () => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const [name, setName] = useState(c.name)
  const [phone, setPhone] = useState(c.phone ? formatPhone(c.phone) : '')
  const [note, setNote] = useState(c.note ?? '')
  const [noLimit, setNoLimit] = useState(c.creditLimitPaise === null)
  const [limit, setLimit] = useState(c.creditLimitPaise === null ? '' : rupeesInput(c.creditLimitPaise))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [local, setLocal] = useState<string | null>(null)

  async function save(active?: boolean) {
    setLocal(null)
    setError(null)
    if (name.trim().length < 2) return setLocal(t('kiranaBills.enterName'))
    if (phone.trim() && !normalizePhone(phone)) return setLocal(t('kiranaBills.enterMobile'))
    const lim = owner && !noLimit ? parseRupees(limit, { zeroAllowed: true, maxPaise: 100_000_000 }) : null
    if (lim && 'error' in lim) return setLocal(lim.error)
    setBusy(true)
    try {
      await kiranaApi.editCustomer(c.id, {
        version: c.version,
        name: name.trim(),
        phone: phone.trim(),
        note: note.trim(),
        ...(owner ? (noLimit ? { noLimit: true } : { creditLimitPaise: lim && 'paise' in lim ? lim.paise : undefined }) : {}),
        active,
      })
      onDone()
    } catch (e) {
      stale(e)
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const fe = (f: string) => fieldError(error, f)
  return (
    <div className="flex max-h-[80dvh] flex-col gap-3 overflow-y-auto">
      <Field id="edit-customer-name" label={t('kiranaBills.name')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={fe('name')} />
      <Field id="edit-customer-phone" label={t('kiranaBills.mobileOptional')} inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} error={fe('phone')} />
      <Field id="edit-customer-note" label={t('kiranaBills.noteOptional')} value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} error={fe('note')} />
      {owner ? (
        <>
          <Switch label={t('kiranaBills.noLimit')} checked={noLimit} onChange={setNoLimit} />
          {!noLimit && (
            <Field id="edit-customer-limit" label={t('kiranaBills.limitRupees')} hint={t('kiranaBills.limitHint')} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} error={fe('creditLimitPaise')} />
          )}
        </>
      ) : (
        <p className="text-sm text-muted">{t('kiranaBills.onlyOwnerLimit')}</p>
      )}
      {(local || (error !== null && !['name', 'phone', 'note', 'creditLimitPaise'].some((f) => fe(f)))) && (
        <Banner tone="bad">{local ?? messageOf(error)}</Banner>
      )}
      <Button busy={busy} onClick={() => void save()}>
        {t('common.save')}
      </Button>
      {owner && (c.active ? (
        <Button variant="ghost" className="text-bad" disabled={busy} onClick={() => void save(false)}>
          {t('kiranaBills.takeOut', { name: c.name })}
        </Button>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>
          {t('kiranaBills.putBack', { name: c.name })}
        </Button>
      ))}
      {owner && c.active && c.balancePaise !== 0 && (
        <p className="text-xs text-muted">{t('kiranaBills.cantTakeOut')}</p>
      )}
    </div>
  )
}

/** The owner gives back all or part of a customer's advance, in cash or UPI. */
function AdvanceBack({ c, onDone }: { c: KhataCustomer; onDone: () => void }) {
  const t = useT()
  const stale = useRefreshOnStale()
  const send = useUnsureSend<{ amountPaise: number; method: PaidBy }>(`advance:${c.id}`)
  const held = send.unsure
  const [amount, setAmount] = useState(rupeesInput(held?.amountPaise ?? c.advancePaise))
  const [method, setMethod] = useState<PaidBy>(held?.method ?? 'CASH')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    let values = held
    if (!values) {
      const r = parseRupees(amount, { maxPaise: c.advancePaise })
      if ('error' in r) return setError(r.error)
      values = { amountPaise: r.paise, method }
    }
    setBusy(true)
    setError(null)
    try {
      await kiranaApi.advanceBack(c.id, { clientRef: send.clientRef, ...values })
      send.settle()
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
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('kiranaBills.theirAdvance', { amount: rupees(c.advancePaise) })}</p>
      {held && <UnsureNote what="advanceBack" onStartOver={() => { send.settle(); setError(null) }} />}
      <Field id="advance-amount" label={t('kiranaBills.amountGivenBack')} inputMode="decimal" value={amount} disabled={!!held} onChange={(e) => { setAmount(e.target.value); setError(null) }} error={error ?? undefined} />
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaBills.givenBackBy')}>
        <Chip selected={method === 'CASH'} disabled={!!held} onClick={() => setMethod('CASH')}>
          {t('kiranaBills.cash')}
        </Chip>
        <Chip selected={method === 'UPI'} disabled={!!held} onClick={() => setMethod('UPI')}>
          UPI
        </Chip>
      </div>
      <Button busy={busy} onClick={save}>
        {t('common.save')}
      </Button>
    </div>
  )
}
