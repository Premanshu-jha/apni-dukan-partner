import { useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { salonKeys, setupApi, useServices, type ServiceIn, refreshSalonWork, SETUP_KEYS } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { ServiceItem } from '../../api/types'
import { Banner, Button, EmptyState, ErrorState, Field, Loading, Page, Pill, Sheet, Switch } from '../../components/ui'
import { duration, rupees } from '../../lib/money'
import { can } from '../../lib/roles'
import { ServiceIcon } from '../../components/ServiceIcon'
import { ICON_LABELS, iconsFor, type ServiceIconName } from '../../lib/serviceIcons'

export interface ServiceForm {
  name: string
  minutes: string
  rupees: string
  from: boolean
  /** Days after a visit to remind the customer to come back; "0": never. */
  returnDays: string
  /** The picture picked; null: the one the name fits best (the first offered). */
  icon?: ServiceIconName | null
  /** The name as saved (editing): while it is unchanged, the saved picture stays even if it isn't offered for it. */
  savedName?: string
}

type Form = ServiceForm

/** "250" or "250.50" rupees → paise; null if it isn't a price. */
export function toPaise(text: string): number | null {
  const t = text.trim()
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null
  const [r, p = ''] = t.split('.')
  return Number(r) * 100 + Number(p.padEnd(2, '0'))
}

export function checkService(f: Form): { name?: string; minutes?: string; rupees?: string; returnDays?: string } {
  const e: { name?: string; minutes?: string; rupees?: string; returnDays?: string } = {}
  if (f.name.trim().length < 2 || f.name.trim().length > 60) e.name = 'A name of 2 to 60 letters'
  // The backend's text rule (TextCleaner): at least 2 letters or digits ("--" or "A." isn't a name)
  else if ((f.name.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) e.name = 'A name with at least 2 letters or digits'
  const m = Number(f.minutes)
  if (!Number.isInteger(m) || m < 5 || m > 480 || m % 5 !== 0) e.minutes = 'From 5 to 480 minutes, in steps of 5'
  const p = toPaise(f.rupees)
  if (p === null || p > 10_000_000) e.rupees = 'A price in rupees, up to ₹1,00,000'
  const r = Number(f.returnDays)
  if (f.returnDays.trim() === '' || !Number.isInteger(r) || r < 0 || r > 180) e.returnDays = 'From 0 (never) to 180 days'
  return e
}

/** The form's service as the backend wants it (after checkService found nothing). */
export function serviceIn(f: Form): ServiceIn {
  return {
    name: f.name.trim().replace(/\s+/g, ' '),
    durationMinutes: Number(f.minutes),
    pricePaise: toPaise(f.rupees)!,
    priceIsFrom: f.from,
    returnAfterDays: Number(f.returnDays),
    icon: pickedIcon(f),
  }
}

/**
 * The icon to save: the one picked if it fits the name (or the name is still the saved one, so editing only the price
 * never changes the picture), else the one the name fits best.
 */
export function pickedIcon(f: Pick<Form, 'name' | 'icon' | 'savedName'>): ServiceIconName {
  const fits = iconsFor(f.name)
  const unchanged = f.savedName != null && f.name.trim() === f.savedName.trim()
  return f.icon && (fits.includes(f.icon) || unchanged) ? f.icon : fits[0]
}

/** "Reminds after 3 weeks" for a list line; null when it never reminds. */
export function comeBackText(days: number): string | null {
  if (days === 0) return null
  if (days % 7 === 0) return `back in ${days / 7} week${days === 7 ? '' : 's'}`
  return `back in ${days} day${days === 1 ? '' : 's'}`
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
                  <ServiceIcon service={s} size={24} className="text-link" />
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
                      {comeBackText(s.returnAfterDays ?? 14) && ` · ${comeBackText(s.returnAfterDays ?? 14)}`}
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

export function ServiceSheet({ service, onClose }: { service: ServiceItem | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(
    service
      ? {
          name: service.name,
          minutes: String(service.durationMinutes),
          rupees: String(service.pricePaise / 100),
          from: service.priceIsFrom,
          returnDays: String(service.returnAfterDays ?? 14),
          icon: (service.icon as ServiceIconName | null | undefined) ?? null,
          savedName: service.name,
        }
      : { name: '', minutes: '30', rupees: '', from: false, returnDays: '14', icon: null },
  )
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const problems = touched ? checkService(form) : {}

  async function save() {
    setTouched(true)
    if (Object.keys(checkService(form)).length) return
    const body: ServiceIn = serviceIn(form)
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
        <IconPicker name={form.name} value={pickedIcon(form)} onChange={(icon) => setForm({ ...form, icon })} error={fieldError(error, 'icon')} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="svc-minutes" label="Minutes" inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value.replace(/\D/g, '') })} error={problems.minutes ?? fieldError(error, 'durationMinutes')} />
          <Field id="svc-price" label="Price (₹)" inputMode="decimal" value={form.rupees} onChange={(e) => setForm({ ...form, rupees: e.target.value })} error={problems.rupees ?? fieldError(error, 'pricePaise')} />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand" checked={form.from} onChange={(e) => setForm({ ...form, from: e.target.checked })} />
          Price can go up at the salon (shown as "from ₹…")
        </label>
        <Field
          id="svc-return"
          label="Remind customers to come back after (days)"
          inputMode="numeric"
          value={form.returnDays}
          onChange={(e) => setForm({ ...form, returnDays: e.target.value.replace(/\D/g, '') })}
          error={problems.returnDays ?? fieldError(error, 'returnAfterDays')}
        />
        <p className="-mt-2 text-xs text-muted">0 = no reminder. Customers who booked it get one push message, e.g. 21 days after a haircut.</p>
        {error != null && !['name', 'durationMinutes', 'pricePaise', 'returnAfterDays', 'icon'].some((k) => fieldError(error, k)) && <Banner tone="bad">{messageOf(error)}</Banner>}
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

/**
 * The service's picture: only the icons that fit its name are offered (a haircut gets scissors, never a hair wash),
 * plus the general one (a barber's pole), which fits anything; the one saved stays offered while it is picked. One is
 * always picked, so the owner can just go on. Arrow keys move between them (one stop for Tab, as radio buttons).
 */
export function IconPicker({
  name,
  value,
  onChange,
  error,
}: {
  name: string
  value: ServiceIconName
  onChange: (icon: ServiceIconName) => void
  error?: string
}) {
  const id = useId()
  const fits = iconsFor(name)
  const offered = fits.includes(value) ? fits : [value, ...fits]
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  function move(from: number, by: number) {
    const to = (from + by + offered.length) % offered.length
    onChange(offered[to])
    buttons.current[to]?.focus()
  }
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="mb-1 text-sm font-medium">
        Picture
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={id}>
        {offered.map((icon, i) => (
          <button
            key={icon}
            ref={(b) => {
              buttons.current[i] = b
            }}
            type="button"
            role="radio"
            aria-checked={icon === value}
            tabIndex={icon === value ? 0 : -1}
            onClick={() => onChange(icon)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(i, -1)
              }
            }}
            className={`flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs ${icon === value ? 'border-brand bg-brand/10 text-link' : 'border-line bg-surface text-ink'}`}
          >
            <ServiceIcon icon={icon} size={24} />
            {ICON_LABELS[icon]}
          </button>
        ))}
      </div>
      {fits.length === 1 && name.trim().length >= 2 && (
        <p className="text-xs text-muted">No picture matches this name, so it gets the general one (a barber's pole).</p>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  )
}
