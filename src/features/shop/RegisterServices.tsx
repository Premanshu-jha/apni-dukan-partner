import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { explain, isApiError } from '../../api/errors'
import { salonKeys, setupApi, useCatalog, useServices } from '../../api/salon'
import type { CatalogService, ServiceItem } from '../../api/types'
import { Banner, Button, Card, ErrorState, Field, Loading, Page } from '../../components/ui'
import { duration, rupees } from '../../lib/money'
import { checkService, comeBackText, serviceIn, ServiceSheet, type ServiceForm } from '../setup/Services'
import { useShop } from '../../api/shop'
import { SentBack, Steps } from './Register'

/** One line of the list: a service from the catalog (ticked or not) or one the owner typed in. */
export interface Row {
  key: string
  ticked: boolean
  /** From the catalog (its name is fixed) or typed in. */
  custom: boolean
  form: ServiceForm
}

/** The catalog's services the salon doesn't have yet (capitals ignored), unticked, with their suggestions. */
export function catalogRows(catalog: CatalogService[], have: ServiceItem[]): Row[] {
  const taken = new Set(have.filter((s) => s.active).map((s) => s.name.trim().toLowerCase()))
  return catalog
    .filter((c) => !taken.has(c.name.toLowerCase()))
    .map((c) => ({
      key: `c-${c.name.replace(/[^a-z0-9]/gi, '-')}`,
      ticked: false,
      custom: false,
      form: { name: c.name, minutes: String(c.durationMinutes), rupees: '', from: false, returnDays: String(c.returnAfterDays) },
    }))
}

/**
 * What a list would send: the ticked rows, each checked as one service would be, and no name twice (the salon's own
 * services count too). Returns the first problem, or null.
 */
/** The most services saved at once (SalonRequests.CreateServices). */
export const MAX_AT_ONCE = 30

/** Spaces inside a name count once, as the backend compares them ("Hair  wash" is "Hair wash"). */
const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export function checkRows(rows: Row[], have: ServiceItem[]): string | null {
  const ticked = rows.filter((r) => r.ticked)
  if (ticked.length > MAX_AT_ONCE) {
    return `Save at most ${MAX_AT_ONCE} services at a time: untick ${ticked.length - MAX_AT_ONCE}, save, then add the rest.`
  }
  const names = new Set(have.filter((s) => s.active).map((s) => nameKey(s.name)))
  for (const r of ticked) {
    const p = checkService(r.form)
    const label = r.form.name.trim() || 'A new service'
    if (p.name) return `${label}: ${p.name.toLowerCase()}.`
    if (p.rupees) return `${label}: enter the price.`
    if (p.minutes) return `${label}: ${p.minutes.toLowerCase()}.`
    if (p.returnDays) return `${label}: come-back reminder ${p.returnDays.toLowerCase()}.`
    const n = nameKey(r.form.name)
    if (names.has(n)) return `${label} is in the list twice.`
    names.add(n)
  }
  return null
}

let customCount = 0

/**
 * The words for a refused batch save: a field error is about one of the ticked services ("services[2].name"), so
 * it names that service rather than showing the path.
 */
export function batchMessage(e: unknown, names: string[]): string {
  if (isApiError(e, 'VALIDATION_FAILED')) {
    for (const [key, value] of Object.entries(e.details)) {
      const m = /^services\[(\d+)\]\.(\w+)$/.exec(key)
      if (m && typeof value === 'string') {
        const name = names[Number(m[1])] || 'A new service'
        const what = { name: 'name', pricePaise: 'price', durationMinutes: 'minutes', returnAfterDays: 'come-back days' }[m[2]] ?? m[2]
        return `${name}: the ${what} ${value}.`
      }
    }
  }
  return explain(e)
}

/**
 * Registration step 3: the services the salon offers. Tick the common ones (with a price each; the time and the
 * come-back reminder are suggested and can be changed), add any others, and save them all at once. Services already
 * saved are listed above and can be edited.
 */
export function RegisterServices() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const services = useServices()
  const catalog = useCatalog()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [editing, setEditing] = useState<ServiceItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  if (services.isPending || catalog.isPending) return <Loading />
  // Only when nothing was read: a failed background refresh keeps the page (and what was typed)
  if ((services.isError && !services.data) || (catalog.isError && !catalog.data)) {
    const failed = services.isError && !services.data ? services : catalog
    return (
      <Page back="/register/photos" title="Services">
        <ErrorState message={explain(failed.error)} onRetry={() => failed.refetch()} />
      </Page>
    )
  }
  const have = services.data.filter((s) => s.active)
  const fresh = catalogRows(catalog.data, services.data)
  // The rows as edited, plus any catalog service free again (one just removed above comes back to tick)
  const list = rows ? [...rows, ...fresh.filter((f) => !rows.some((r) => r.key === f.key))] : fresh
  const ticked = list.filter((r) => r.ticked)
  const problem = checkRows(list, services.data)

  const change = (key: string, update: (r: Row) => Row) => setRows(list.map((r) => (r.key === key ? update(r) : r)))
  const setField = (key: string, k: keyof ServiceForm, v: string | boolean) =>
    change(key, (r) => ({ ...r, ticked: true, form: { ...r.form, [k]: v } }))

  async function save() {
    setTouched(true)
    setError(null)
    if (ticked.length === 0) {
      if (have.length > 0) navigate('/register/hours')
      else setError('Tick at least one service, or add your own.')
      return
    }
    if (problem) return
    setBusy(true)
    try {
      await setupApi.addServices(ticked.map((r) => serviceIn(r.form)))
      setRows(null)
      setTouched(false)
      await qc.invalidateQueries({ queryKey: salonKeys.services })
      navigate('/register/hours')
    } catch (e) {
      setError(batchMessage(e, ticked.map((r) => r.form.name.trim())))
      if (isApiError(e, 'SERVICE_NAME_TAKEN')) {
        // Saved already (a retry after a lost reply) or on another phone: start the list again from what is saved,
        // so the ticked rows don't then read as "in the list twice"
        setRows(null)
        await qc.invalidateQueries({ queryKey: salonKeys.services })
      }
    } finally {
      setBusy(false)
    }
  }

  /** A service saved by mistake: switched off, so it isn't offered (setup can switch it on again later). */
  async function remove(s: ServiceItem) {
    setBusy(true)
    setError(null)
    try {
      await setupApi.updateService(s.id, s.version, { active: false })
    } catch (e) {
      setError(explain(e))
    } finally {
      await qc.invalidateQueries({ queryKey: salonKeys.services })
      setBusy(false)
    }
  }

  return (
    <Page back="/register/photos" title="Services">
      <Steps at={3} />
      {shop.statusReason && <SentBack reason={shop.statusReason} />}
      {have.length > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="font-medium">Your services</p>
          <ul className="flex flex-col gap-1">
            {have.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => setEditing(s)}>
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm text-muted">
                    {duration(s.durationMinutes)} · {rupees(s.pricePaise, s.priceIsFrom)}
                    {comeBackText(s.returnAfterDays) && ` · ${comeBackText(s.returnAfterDays)}`}
                  </span>
                </button>
                <Button variant="ghost" aria-label={`Remove ${s.name}`} disabled={busy} onClick={() => remove(s)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-sm text-muted">
        Tick what you offer and enter your price. The time is how long to keep the barber's chair for it. Customers who
        booked it get a reminder to come back after the days shown (0 = never).
      </p>
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.key} className={`rounded-2xl border p-3 ${r.ticked ? 'border-brand bg-surface' : 'border-line bg-surface'}`}>
            {r.custom ? (
              <div className="flex items-end gap-2">
                <Field id={`${r.key}-name`} label="Service name" value={r.form.name} maxLength={60} onChange={(e) => setField(r.key, 'name', e.target.value)} />
                <Button variant="ghost" aria-label={`Remove ${r.form.name.trim() || 'this service'}`} onClick={() => setRows(list.filter((x) => x.key !== r.key))}>
                  ✕
                </Button>
              </div>
            ) : (
              <label className="flex min-h-9 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand"
                  checked={r.ticked}
                  onChange={(e) => change(r.key, (x) => ({ ...x, ticked: e.target.checked }))}
                />
                <span className="font-semibold">{r.form.name}</span>
              </label>
            )}
            {(r.ticked || r.custom) && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Field id={`${r.key}-price`} label="Price (₹)" aria-label={`${r.form.name.trim() || 'New service'} price (₹)`} inputMode="decimal" value={r.form.rupees} onChange={(e) => setField(r.key, 'rupees', e.target.value)} />
                <Field id={`${r.key}-min`} label="Minutes" aria-label={`${r.form.name.trim() || 'New service'} minutes`} inputMode="numeric" value={r.form.minutes} onChange={(e) => setField(r.key, 'minutes', e.target.value.replace(/\D/g, ''))} />
                <Field id={`${r.key}-back`} label="Back in (days)" aria-label={`${r.form.name.trim() || 'New service'} back in (days)`} inputMode="numeric" value={r.form.returnDays} onChange={(e) => setField(r.key, 'returnDays', e.target.value.replace(/\D/g, ''))} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        onClick={() =>
          setRows([
            ...list,
            {
              key: `own-${++customCount}`,
              ticked: true,
              custom: true,
              form: { name: '', minutes: '30', rupees: '', from: false, returnDays: '14' },
            },
          ])
        }
      >
        + Add your own service
      </Button>
      {touched && problem && <Banner tone="warn">{problem}</Banner>}
      {error && <Banner tone="bad">{error}</Banner>}
      <Button busy={busy} onClick={save}>
        {ticked.length ? `Save ${ticked.length} service${ticked.length === 1 ? '' : 's'} and continue` : 'Continue'}
      </Button>
      {editing && <ServiceSheet service={services.data.find((x) => x.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </Page>
  )
}
