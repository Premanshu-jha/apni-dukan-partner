import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { explain, isApiError, messageOf } from '../../api/errors'
import { setupApi, useSalonHours, useServices, useStaff, refreshSalonWork, SETUP_KEYS } from '../../api/salon'
import { salonShifts } from '../../lib/salonHours'
import { fileApi, useShop } from '../../api/shop'
import type { InTheWay, Shift, Staff } from '../../api/types'
import { PhotoPicker } from '../../components/PhotoPicker'
import { Banner, Button, Card, EmptyState, ErrorState, Field, Loading, Page, Switch } from '../../components/ui'
import { t, useT } from '../../i18n'
import { clock12, dateTimeIst, timeIst, weekdayName } from '../../lib/ist'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { can } from '../../lib/roles'
import { dayLink } from '../day/Today'
import { loginText } from './Staff'
import { useSession } from '../../store/session'

/** Every change on this page reloads the barber list, so the next change sends the newest version. */
function useAfterChange() {
  const qc = useQueryClient()
  return () => refreshSalonWork(qc, SETUP_KEYS)
}

/** One barber: name and on/off, photo, his sign-in, the services he does and his weekly hours. */
export function StaffDetail() {
  const t = useT()
  const { id } = useParams()
  const staff = useStaff()
  const shop = useShop()
  const edit = can(shop.myRole).editSetup
  if (staff.isPending) return <Loading />
  if (staff.isError) return <ErrorState message={messageOf(staff.error)} onRetry={() => staff.refetch()} />
  const s = staff.data.find((x) => x.id === id)
  if (!s) {
    return (
      <Page back="/setup/staff" title={t('setup.barberTitle')}>
        <EmptyState title={t('setup.barberGone')} />
      </Page>
    )
  }
  return (
    <Page back="/setup/staff" title={s.name}>
      {/* Each form keeps what was typed; it saves with the newest version the list has. */}
      <Fragment key={s.id}>
        <NameAndActive s={s} edit={edit} />
        {edit && <StaffPhoto s={s} />}
        {/* Barbers' sign-in phones come only to the owner */}
        {edit && <Login s={s} edit={edit} />}
        <Skills s={s} edit={edit} />
        <Hours s={s} edit={edit} />
        {shop.myRole === 'OWNER' && <RemoveBarber s={s} />}
      </Fragment>
    </Page>
  )
}

function useSaver() {
  const t = useT()
  const after = useAfterChange()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  // New hours or services that would strand upcoming bookings (409 BOOKINGS_IN_THE_WAY lists them)
  const [inTheWay, setInTheWay] = useState<InTheWay[] | null>(null)
  async function run(call: () => Promise<unknown>, message = t('setup.saved')) {
    setBusy(true)
    setError(null)
    setSaved(null)
    setInTheWay(null)
    try {
      await call()
      setSaved(message)
    } catch (e) {
      setError(
        isApiError(e, 'STAFF_CHANGED') ? t('setup.barberChanged') : explain(e),
      )
      if (isApiError(e, 'BOOKINGS_IN_THE_WAY')) {
        const list = e.details.appointments
        setInTheWay(Array.isArray(list) ? (list as InTheWay[]) : [])
      }
    } finally {
      setBusy(false)
      await after()
    }
  }
  return { busy, error, saved, inTheWay, run }
}

/** The bookings a change would strand, each a link that opens it on its day's board (to give to another barber or cancel). */
export function BookingsInTheWay({ list }: { list: InTheWay[] | null }) {
  const t = useT()
  if (!list || list.length === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warn/50 p-3">
      <p className="font-semibold">{t('setup.bookingsInTheWay', { count: list.length })}</p>
      <p className="text-sm text-muted">{t('setup.bookingsInTheWayHint')}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {list.map((a) => (
          <li key={a.id}>
            <Link className="text-link underline" to={dayLink(a)}>
              {dateTimeIst(a.startsAt)}–{timeIst(a.endsAt)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Remove a barber for good (a contract barber who won't come back): out of the list, his sign-in goes, his past
 * bookings keep his name. Switching him off above keeps him for when he returns. The owner only.
 */
function RemoveBarber({ s }: { s: Staff }) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await setupApi.removeStaff(s.id)
      navigate('/setup/staff', { replace: true })
      await refreshSalonWork(qc, SETUP_KEYS)
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }
  return (
    <Card className="flex flex-col gap-2">
      <p className="font-medium">{t('setup.removeNameTitle', { name: s.name })}</p>
      <p className="text-sm text-muted">
        {t('setup.removeHint')}
      </p>
      {asking ? (
        <>
          <p className="text-sm">{t('setup.removeConfirm', { name: s.name })}</p>
          <Button variant="danger" busy={busy} onClick={remove}>
            {t('setup.removeNameButton', { name: s.name })}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
            {t('setup.keepHim')}
          </Button>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setAsking(true)}>
          {t('setup.removeBarber')}
        </Button>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
    </Card>
  )
}

function NameAndActive({ s, edit }: { s: Staff; edit: boolean }) {
  const t = useT()
  const [name, setName] = useState(s.name)
  const { busy, error, saved, run } = useSaver()
  const changed = name.trim() !== s.name
  return (
    <Card className="flex flex-col gap-3">
      <Field id="staff-edit-name" label={t('setup.barberName')} value={name} maxLength={60} disabled={!edit} onChange={(e) => setName(e.target.value)} />
      {edit && changed && (
        <Button busy={busy} disabled={name.trim().length < 2} onClick={() => run(() => setupApi.updateStaff(s.id, s.version, { name: name.trim() }))}>
          {t('setup.saveName')}
        </Button>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t('setup.workingHere')}</p>
          <p className="text-sm text-muted">{t('setup.workingHereHint')}</p>
        </div>
        <Switch
          label={t('setup.workingHere')}
          checked={s.active}
          disabled={!edit || busy}
          onChange={(on) => run(() => setupApi.updateStaff(s.id, s.version, { active: on }))}
        />
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      {saved && !error && <Banner tone="good">{saved}</Banner>}
    </Card>
  )
}

function StaffPhoto({ s }: { s: Staff }) {
  const t = useT()
  const after = useAfterChange()
  return (
    <Card>
      <PhotoPicker
        label={t('setup.photoLabel')}
        hint={t('setup.photoHint')}
        capture="environment"
        fileId={s.photoFileId}
        upload={async (photo) => {
          const file = await fileApi.upload(photo, 'barber.jpg', 'STAFF_PHOTO')
          await setupApi.setPhoto(s.id, file.id)
          await after()
        }}
      />
    </Card>
  )
}

function Login({ s, edit }: { s: Staff; edit: boolean }) {
  const t = useT()
  const [phone, setPhone] = useState('')
  const { busy, error, saved, run } = useSaver()
  const myPhone = useSession((x) => x.user?.phone ?? null)
  const normalized = normalizePhone(phone)
  if (myPhone !== null && s.loginPhone === myPhone) {
    // The owner's own profile: his sign-in stays on it (he couldn't invite his own number back)
    return (
      <Card>
        <p className="font-medium">{t('setup.ownProfile')}</p>
        <p className="text-sm text-muted">
          {t('setup.ownProfileHint')}
        </p>
      </Card>
    )
  }
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{t('setup.hisSignIn')}</p>
        <p className="text-sm text-muted">
          {t('setup.signInHint')} {s.invitedPhone ? t('setup.invitedWaiting', { phone: formatPhone(s.invitedPhone) }) : loginText(s.loginPhone)}.
        </p>
      </div>
      {edit &&
        (s.loginPhone ? (
          <Button variant="secondary" busy={busy} onClick={() => run(() => setupApi.unlinkLogin(s.id), t('setup.signInRemoved'))}>
            {t('setup.removeSignIn')}
          </Button>
        ) : s.invitedPhone ? (
          <Button variant="secondary" busy={busy} onClick={() => run(() => setupApi.unlinkLogin(s.id), t('setup.invitationCancelled'))}>
            {t('setup.cancelInvitation')}
          </Button>
        ) : (
          <>
            <Field id="staff-phone" label={t('setup.hisMobile')} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button
              busy={busy}
              disabled={!normalized}
              onClick={() => run(() => setupApi.linkLogin(s.id, normalized!), t('setup.invitationSent'))}
            >
              {t('setup.inviteHim')}
            </Button>
          </>
        ))}
      {error && <Banner tone="bad">{error}</Banner>}
      {saved && !error && <Banner tone="good">{saved}</Banner>}
    </Card>
  )
}

function Skills({ s, edit }: { s: Staff; edit: boolean }) {
  const t = useT()
  const services = useServices()
  const [picked, setPicked] = useState<string[]>(s.serviceIds)
  const { busy, error, saved, inTheWay, run } = useSaver()
  const changed = picked.length !== s.serviceIds.length || picked.some((p) => !s.serviceIds.includes(p))
  const list = services.data?.filter((v) => v.active || s.serviceIds.includes(v.id)) ?? []
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-medium">{t('setup.servicesHeDoes')}</p>
      {services.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t('setup.addServicesFirst')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((v) => (
            <li key={v.id}>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand"
                  disabled={!edit}
                  checked={picked.includes(v.id)}
                  onChange={() => setPicked((p) => (p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id]))}
                />
                {v.name}
                {!v.active && <span className="text-xs text-muted">{t('setup.switchedOff')}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {edit && changed && (
        <Button busy={busy} onClick={() => run(() => setupApi.setServices(s.id, s.version, picked))}>
          {t('setup.saveServices')}
        </Button>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <BookingsInTheWay list={inTheWay} />
      {saved && !error && <Banner tone="good">{saved}</Banner>}
    </Card>
  )
}

type Week = Record<number, Array<{ start: string; end: string }>>

export function toWeek(hours: Shift[]): Week {
  const w: Week = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
  for (const h of hours) w[h.weekday]?.push({ start: h.start, end: h.end })
  return w
}

export function fromWeek(w: Week): Shift[] {
  return Object.entries(w).flatMap(([d, shifts]) => shifts.map((x) => ({ weekday: Number(d), start: x.start, end: x.end })))
}

/** Where "Add hours" starts a day, and the usual closing time. */
const DAY_START = '10:00'
const CLOSING = '20:00'

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * The day after "Add hours" (10:00–20:00) or "Add a second shift". The second shift always leaves an hour's break
 * after the first: 10:00–14:00 gets 15:00–20:00 (till closing). When the first already runs to closing (or later),
 * it is cut at its middle with the hour between, so 10:00–20:00 becomes 10:00–15:00 and 16:00–20:00. A first shift
 * too late or too short for that gets the second after it, still an hour later, up to midnight, or else before it.
 * Nothing overlaps; the owner adjusts the times after.
 */
export function withSecondShift(day: Array<{ start: string; end: string }>): Array<{ start: string; end: string }> {
  const [first] = day
  if (!first) return [{ start: DAY_START, end: CLOSING }]
  const start = toMin(first.start)
  const end = toMin(first.end)
  const BREAK = 60
  const MIDNIGHT = 24 * 60
  // An hour's break, then at least an hour of work before closing
  if (end + BREAK + 60 <= toMin(CLOSING)) return [first, { start: toTime(end + BREAK), end: CLOSING }]
  if (first.end >= CLOSING) {
    // Cut at the middle (15-minute steps), keeping at least an hour on each side of the hour's break
    const middle = Math.floor((start + end) / 2 / 15) * 15
    if (middle - start >= 60 && end - (middle + BREAK) >= 60) {
      return [{ ...first, end: toTime(middle) }, { start: toTime(middle + BREAK), end: first.end }]
    }
  }
  // After it, an hour later, if the day has room for an hour's work; else before it, an hour earlier
  if (end + BREAK + 60 <= MIDNIGHT) return [first, { start: toTime(end + BREAK), end: toTime(Math.min(end + BREAK + 4 * 60, MIDNIGHT)) }]
  if (start - BREAK >= 60) return [{ start: toTime(Math.max(0, start - BREAK - 4 * 60)), end: toTime(start - BREAK) }, first]
  // (Only a shift of nearly the whole day gets here, and that one is cut above)
  return day
}

/** Problems with a week before sending: end after start, 15-minute steps, shifts in a day not overlapping. */
export function checkWeek(w: Week): string | null {
  for (const [d, shifts] of Object.entries(w)) {
    const day = weekdayName(Number(d))
    const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start))
    for (const [i, x] of sorted.entries()) {
      if (!x.start || !x.end) return t('setup.dayFillBothTimes', { day })
      if (x.end <= x.start) return t('setup.dayEndAfterStart', { day })
      if (![x.start, x.end].every((v) => Number(v.split(':')[1]) % 15 === 0)) return t('setup.dayUse15Steps', { day })
      const next = sorted.at(i + 1)
      if (next && next.start < x.end) return t('setup.dayShiftsOverlap', { day })
    }
  }
  return null
}

function Hours({ s, edit }: { s: Staff; edit: boolean }) {
  const t = useT()
  const [week, setWeek] = useState<Week>(() => toWeek(s.hours))
  const salonHours = useSalonHours()
  const salonDays = salonHours.data?.days ?? []
  const { busy, error, saved, inTheWay, run } = useSaver()
  const problem = checkWeek(week)
  const changed = JSON.stringify(fromWeek(week)) !== JSON.stringify(fromWeek(toWeek(s.hours)))
  const setShift = (d: number, i: number, k: 'start' | 'end', v: string) =>
    setWeek({ ...week, [d]: week[d].map((x, j) => (j === i ? { ...x, [k]: v } : x)) })
  const copyMonday = () => {
    const mon = week[1]
    setWeek({ 1: mon, 2: [...mon], 3: [...mon], 4: [...mon], 5: [...mon], 6: [...mon], 7: week[7] })
  }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-medium">{t('setup.weeklyHours')}</p>
        {edit && week[1].length > 0 && (
          <button type="button" className="text-sm text-link underline" onClick={copyMonday}>
            {t('setup.copyMonday')}
          </button>
        )}
      </div>
      {salonDays.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{t('setup.fitInside')}</p>
          {edit && (
            <button type="button" className="self-start text-sm text-link underline" onClick={() => setWeek(toWeek(salonShifts(salonDays)))}>
              {t('setup.useSalonHours')}
            </button>
          )}
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <li key={d} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0">
            <div className="flex items-center justify-between">
              <span className="w-12 font-medium">{weekdayName(d)}</span>
              {week[d].length === 0 && <span className="flex-1 text-sm text-muted">{t('setup.dayOff')}</span>}
              {edit && week[d].length < 2 && (
                <button
                  type="button"
                  className="text-sm text-link underline"
                  onClick={() => setWeek({ ...week, [d]: withSecondShift(week[d]) })}
                >
                  {week[d].length ? t('setup.addSecondShift') : t('setup.addHours')}
                </button>
              )}
            </div>
            {week[d].map((x, i) => (
              <div key={i} className="flex flex-col gap-1">
                {edit ? (
                  <>
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <Field id={`h-${d}-${i}-s`} label={t('setup.shiftFrom')} type="time" step={900} value={x.start} onChange={(e) => setShift(d, i, 'start', e.target.value)} />
                      {x.end === '24:00' ? (
                        <p className="flex min-h-12 items-center text-sm">{t('setup.toMidnight')}</p>
                      ) : (
                        <Field id={`h-${d}-${i}-e`} label={t('setup.shiftTo')} type="time" step={900} value={x.end} onChange={(e) => setShift(d, i, 'end', e.target.value)} />
                      )}
                      <Button variant="ghost" aria-label={t('setup.removeShift', { day: weekdayName(d) })} onClick={() => setWeek({ ...week, [d]: week[d].filter((_, j) => j !== i) })}>
                        ✕
                      </Button>
                    </div>
                    {/* A time box can't say 24:00, so midnight is its own choice */}
                    <label className="flex min-h-9 items-center gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={x.end === '24:00'}
                        onChange={(e) => setShift(d, i, 'end', e.target.checked ? '24:00' : '23:45')}
                      />
                      {t('setup.tillMidnight')}
                    </label>
                  </>
                ) : (
                  <span className="text-sm">
                    {clock12(x.start)} – {clock12(x.end)}
                  </span>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {edit && changed && problem && <Banner tone="warn">{problem}</Banner>}
      {edit && changed && (
        <Button busy={busy} disabled={Boolean(problem)} onClick={() => run(() => setupApi.setStaffHours(s.id, s.version, fromWeek(week)))}>
          {t('setup.saveBarberHours')}
        </Button>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <BookingsInTheWay list={inTheWay} />
      {saved && !error && <Banner tone="good">{saved}</Banner>}
    </Card>
  )
}
