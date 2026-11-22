import { useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { salonKeys, setupApi, useServices, type ServiceIn, refreshSalonWork, SETUP_KEYS } from '../../api/salon'
import { useShop } from '../../api/shop'
import type { ServiceItem } from '../../api/types'
import { Banner, Button, EmptyState, ErrorState, Field, Loading, Page, Pill, Sheet, Switch } from '../../components/ui'
import { t, useT } from '../../i18n'
import { duration, rupees } from '../../lib/money'
import { can } from '../../lib/roles'
import { ServiceIcon } from '../../components/ServiceIcon'
import { ICON_LABELS, iconsFor, SERVICE_ICONS, type ServiceIconName } from '../../lib/serviceIcons'
import { serviceName } from '../../lib/serviceName'
import { FirstTimeHint } from '../guide/FirstTimeHint'
import { SheetHelpLink } from '../help/HelpButton'
import { cameFrom } from '../shop/Register'

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
  if (f.name.trim().length < 2 || f.name.trim().length > 60) e.name = t('setup.svcNameLength')
  // The backend's text rule (TextCleaner): at least 2 letters or digits ("--" or "A." isn't a name)
  else if ((f.name.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) e.name = t('setup.svcNameLetters')
  const m = Number(f.minutes)
  if (!Number.isInteger(m) || m < 5 || m > 480 || m % 5 !== 0) e.minutes = t('setup.svcMinutesError')
  const p = toPaise(f.rupees)
  if (p === null || p > 10_000_000) e.rupees = t('setup.svcPriceError')
  const r = Number(f.returnDays)
  if (f.returnDays.trim() === '' || !Number.isInteger(r) || r < 0 || r > 180) e.returnDays = t('setup.svcReturnError')
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
  // A saved name this app doesn't know (a newer backend's, or one retired) can't be drawn or sent back: the best fit
  const known = f.icon != null && SERVICE_ICONS.includes(f.icon)
  return f.icon && known && (fits.includes(f.icon) || unchanged) ? f.icon : fits[0]
}

/** "Reminds after 3 weeks" for a list line; null when it never reminds. */
export function comeBackText(days: number): string | null {
  if (days === 0) return null
  if (days % 7 === 0) return t('setup.backInWeeks', { count: days / 7 })
  return t('setup.backInDays', { count: days })
}

/** Remembers on this phone that the owner saw the note about the second set of service pictures (0.25.0). */
const PICTURES_NOTE_KEY = 'clozest.servicePictures2.noted'

function picturesNoteSeen(): boolean {
  try {
    return localStorage.getItem(PICTURES_NOTE_KEY) === '1'
  } catch {
    return false
  }
}

/** The salon's services: what customers can book, how long each takes and its price. */
export function Services() {
  const t = useT()
  const qc = useQueryClient()
  const shop = useShop()
  const edit = can(shop.myRole).editSetup
  const services = useServices()
  const [editing, setEditing] = useState<ServiceItem | 'new' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picturesNoted, setPicturesNoted] = useState(picturesNoteSeen)
  const location = useLocation()

  function hidePicturesNote() {
    setPicturesNoted(true)
    try {
      localStorage.setItem(PICTURES_NOTE_KEY, '1')
    } catch {
      // storage off (private mode): the note just shows again next time
    }
  }

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
    // Back where it was opened from (Today's setup card, More), else the Salon tab
    <Page back={cameFrom(location, '/setup')} title={t('setup.servicesTitle')}>
      {/* Waits while the pictures note is up: one note at a time */}
      <FirstTimeHint
        screen="services"
        text={edit ? t('guide.hintServices', { add: t('guide.quoted', { text: t('setup.addService') }) }) : t('guide.hintServicesHelper')}
        show={!(edit && (services.data?.length ?? 0) > 0 && !picturesNoted)}
      />
      {services.isPending ? (
        <Loading />
      ) : services.isError ? (
        <ErrorState message={messageOf(services.error)} onRetry={() => services.refetch()} />
      ) : (
        <>
          {error && <Banner tone="bad">{error}</Banner>}
          {edit && services.data.length > 0 && !picturesNoted && (
            <Banner live={false}>
              <p>{t('setup.picturesNote')}</p>
              <button type="button" className="mt-1 font-medium text-link underline" onClick={hidePicturesNote}>
                {t('setup.gotIt')}
              </button>
            </Banner>
          )}
          {services.data.length === 0 ? (
            <EmptyState title={t('setup.noServices')} body={edit ? t('setup.noServicesBody') : undefined} />
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
                      <span className="truncate font-semibold">{serviceName(s.name)}</span>
                      {!s.active && <Pill tone="muted">{t('setup.off')}</Pill>}
                    </span>
                    <span className="text-sm text-muted">
                      {duration(s.durationMinutes)} · {rupees(s.pricePaise, s.priceIsFrom)}
                      {comeBackText(s.returnAfterDays ?? 14) && ` · ${comeBackText(s.returnAfterDays ?? 14)}`}
                    </span>
                  </button>
                  {edit && <Switch label={t('setup.serviceOnOffer', { name: serviceName(s.name) })} checked={s.active} disabled={busyId === s.id} onChange={(on) => toggle(s, on)} />}
                </li>
              ))}
            </ul>
          )}
          {edit && <Button onClick={() => setEditing('new')}>{t('setup.addService')}</Button>}
          <p className="text-xs text-muted">{t('setup.offServicesNote')}</p>
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
  const t = useT()
  const qc = useQueryClient()
  const [start] = useState<Form>(() =>
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
  const [form, setForm] = useState<Form>(start)
  // Something typed or picked: the sheet's Help asks before the sheet (and this) goes
  const dirty = (Object.keys(start) as Array<keyof Form>).some((k) => form[k] !== start[k])
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
    <Sheet open title={service ? t('setup.editService') : t('setup.newService')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field id="svc-name" label={t('setup.serviceName')} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} error={problems.name ?? fieldError(error, 'name')} />
        <IconPicker name={form.name} value={pickedIcon(form)} onChange={(icon) => setForm({ ...form, icon })} error={fieldError(error, 'icon')} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="svc-minutes" label={t('setup.minutesLabel')} inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value.replace(/\D/g, '') })} error={problems.minutes ?? fieldError(error, 'durationMinutes')} hint={t('setup.minutesHint')} />
          <Field id="svc-price" label={t('setup.priceLabel')} inputMode="decimal" value={form.rupees} onChange={(e) => setForm({ ...form, rupees: e.target.value })} error={problems.rupees ?? fieldError(error, 'pricePaise')} />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand" checked={form.from} onChange={(e) => setForm({ ...form, from: e.target.checked })} />
          {t('setup.priceFrom')}
        </label>
        <Field
          id="svc-return"
          label={t('setup.returnLabel')}
          inputMode="numeric"
          value={form.returnDays}
          onChange={(e) => setForm({ ...form, returnDays: e.target.value.replace(/\D/g, '') })}
          error={problems.returnDays ?? fieldError(error, 'returnAfterDays')}
        />
        <p className="-mt-2 text-xs text-muted">{t('setup.returnHint')}</p>
        {error != null && !['name', 'durationMinutes', 'pricePaise', 'returnAfterDays', 'icon'].some((k) => fieldError(error, k)) && <Banner tone="bad">{messageOf(error)}</Banner>}
        <Button busy={busy} onClick={save}>
          {t('common.save')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {/* The sheet covers the screen's Help: its own, here (last, so the sheet still opens on its first field) */}
        <SheetHelpLink dirty={dirty} />
      </div>
    </Sheet>
  )
}

/**
 * The service's picture, which comes with it: the one its name fits best is shown, so the owner needn't do anything.
 * "Change" is there only when the name fits more than one (a "Beard trim": beard, clipper or scissors); it opens the
 * ones that fit (plus the general one, a salon chair, and the one saved while it is picked) as radio buttons, arrow
 * keys moving between them (one stop for Tab).
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
  const t = useT()
  const id = useId()
  const [open, setOpen] = useState(false)
  const line = useRef<HTMLParagraphElement>(null)
  const fits = iconsFor(name)
  const offered = fits.includes(value) ? fits : [value, ...fits]
  // A real choice: two pictures fit besides the general one, or the one picked isn't the best fit (a service saved
  // with the general one or another); once opened it stays until Done, even if the pick makes it the best fit
  const choice = open || fits.length > 2 || value !== fits[0]
  const label = name.trim() || t('setup.thisService')
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  function move(from: number, by: number) {
    const to = (from + by + offered.length) % offered.length
    onChange(offered[to])
    buttons.current[to]?.focus()
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <ServiceIcon icon={value} size={22} className="text-link" />
        <p ref={line} tabIndex={-1} aria-live="polite">
          {t('setup.picture')} <span className="font-medium">{t(ICON_LABELS[value])}</span>
        </p>
        {choice && (
          <button
            type="button"
            className="ml-auto font-medium text-link underline"
            aria-label={open ? t('setup.doneChoosingPicture', { name: label }) : t('setup.changePicture', { name: label })}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => {
              // Done may take the button away (the pick is now the only fit): focus stays on the picture line
              if (open) line.current?.focus()
              setOpen(!open)
            }}
          >
            {open ? t('common.done') : t('common.change')}
          </button>
        )}
      </div>
      {open && (
        <div id={id} className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('setup.picturesFor', { name: label })}>
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
              {t(ICON_LABELS[icon])}
            </button>
          ))}
        </div>
      )}
      {fits.length === 1 && name.trim().length >= 2 && (
        <p className="text-xs text-muted">{t('setup.noPictureMatch')}</p>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  )
}
