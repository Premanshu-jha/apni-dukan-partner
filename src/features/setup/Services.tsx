import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { salonKeys, setupApi, useServices, type ServiceIn, refreshSalonWork, SETUP_KEYS } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { ServiceItem } from '../../api/types'
import { Banner, Button, EmptyState, ErrorState, Field, Loading, Page, Pill, Sheet, Switch } from '../../components/ui'
import { duration, rupees } from '../../lib/money'
import { can } from '../../lib/roles'

interface Form {
  name: string
  minutes: string
  rupees: string
  from: boolean
}

/** "250" or "250.50" rupees → paise; null if it isn't a price. */
export function toPaise(text: string): number | null {
  const t = text.trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null
  const [r, p = ''] = t.split('.')
  return Number(r) * 100 + Number(p.padEnd(2, '0'))
}

export function checkService(f: Form): { name?: string; minutes?: string; rupees?: string } {
  const e: { name?: string; minutes?: string; rupees?: string } = {}
  if (f.name.trim().length < 2 || f.name.trim().length > 60) e.name = 'A name of 2 to 60 letters'
  const m = Number(f.minutes)
  if (!Number.isInteger(m) || m < 5 || m > 480 || m % 5 !== 0) e.minutes = 'From 5 to 480 minutes, in steps of 5'
  const p = toPaise(f.rupees)
  if (p === null || p > 10_000_000) e.rupees = 'A price in rupees, up to ₹1,00,000'
  return e
}

/** The salon's services: what customers can book, how long each takes and its price. */
export function Services() {
  const qc = useQueryClient()
  const shop = useShop()
  const edit = can(shop.myRole).editSetup
  const services = useServices()
  const [editing, setEditing] = useState<ServiceItem | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(s: ServiceItem, active: boolean) {
    setBusyId(s.id)
    setError(null)
    try {
      await setupApi.updateService(s.id, s.version, { active })
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusyId(null)
      refreshSalonWork(qc, SETUP_KEYS)
    }
  }

  return (
    <Page back="/setup" title="Services and prices">
      {services.isPending ? (
        <Loading />
      ) : services.isError ? (
        <ErrorState message={messageOf(services.error)} onRetry={() => services.refetch()} />
      ) : (
        <>
          {error && <Banner tone="bad">{error}</Banner>}
          {services.data.length === 0 ? (
            <EmptyState title="No services yet" body={edit ? 'Add what you offer, like Haircut ₹200 for 30 minutes.' : undefined} />
          ) : (
            <ul className="flex flex-col gap-2">
              {services.data.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col text-left disabled:cursor-default"
                    disabled={!edit}
                    onClick={() => setEditing(s)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">{s.name}</span>
                      {!s.active && <Pill tone="muted">Off</Pill>}
                    </span>
                    <span className="text-sm text-muted">
                      {duration(s.durationMinutes)} · {rupees(s.pricePaise, s.priceIsFrom)}
                    </span>
                  </button>
                  {edit && <Switch label={`${s.name} on offer`} checked={s.active} disabled={busyId === s.id} onChange={(on) => toggle(s, on)} />}
                </li>
              ))}
            </ul>
          )}
          {edit && <Button onClick={() => setEditing('new')}>+ Add a service</Button>}
          <p className="text-xs text-muted">Switched-off services can't be booked; old bookings keep their names.</p>
        </>
      )}
      {editing && (
        <ServiceSheet
          // The newest copy from the list, so a save after a reload sends the current version
          service={editing === 'new' ? null : (services.data?.find((x) => x.id === editing.id) ?? editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}

function ServiceSheet({ service, onClose }: { service: ServiceItem | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(
    service
      ? { name: service.name, minutes: String(service.durationMinutes), rupees: String(service.pricePaise / 100), from: service.priceIsFrom }
      : { name: '', minutes: '30', rupees: '', from: false },
  )
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const problems = touched ? checkService(form) : {}

  async function save() {
    setTouched(true)
    if (Object.keys(checkService(form)).length) return
    const body: ServiceIn = {
      name: form.name.trim(),
      durationMinutes: Number(form.minutes),
      pricePaise: toPaise(form.rupees)!,
      priceIsFrom: form.from,
    }
    setBusy(true)
    setError(null)
    try {
      if (service) await setupApi.updateService(service.id, service.version, body)
      else await setupApi.addService(body)
      refreshSalonWork(qc, SETUP_KEYS)
      onClose()
    } catch (e) {
      setError(e)
      if (isApiError(e, 'SERVICE_CHANGED')) await qc.invalidateQueries({ queryKey: salonKeys.services })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open title={service ? 'Edit service' : 'New service'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field id="svc-name" label="Name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} error={problems.name ?? fieldError(error, 'name')} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="svc-minutes" label="Minutes" inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value.replace(/\D/g, '') })} error={problems.minutes ?? fieldError(error, 'durationMinutes')} />
          <Field id="svc-price" label="Price (₹)" inputMode="decimal" value={form.rupees} onChange={(e) => setForm({ ...form, rupees: e.target.value })} error={problems.rupees ?? fieldError(error, 'pricePaise')} />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand" checked={form.from} onChange={(e) => setForm({ ...form, from: e.target.checked })} />
          Price can go up at the salon (shown as "from ₹…")
        </label>
        {error != null && !['name', 'durationMinutes', 'pricePaise'].some((k) => fieldError(error, k)) && <Banner tone="bad">{messageOf(error)}</Banner>}
        <Button busy={busy} onClick={save}>
          Save
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  )
}
