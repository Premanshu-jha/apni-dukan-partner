import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router'
import { explain, isApiError, messageOf } from '../../api/errors'
import { setupApi, useServices, useStaff, refreshSalonWork, SETUP_KEYS } from '../../api/salon'
import { fileApi, useShop } from '../../api/shop'
import type { InTheWay, Shift, Staff } from '../../api/types'
import { PhotoPicker } from '../../components/PhotoPicker'
import { Banner, Button, Card, EmptyState, ErrorState, Field, Loading, Page, Switch } from '../../components/ui'
import { clock12, dateTimeIst, timeIst, weekdayName } from '../../lib/ist'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { can } from '../../lib/roles'
import { dayLink } from '../day/Today'
import { loginText } from './Staff'

/** Every change on this page reloads the barber list, so the next change sends the newest version. */
function useAfterChange() {
  const qc = useQueryClient()
  return () => refreshSalonWork(qc, SETUP_KEYS)
}

/** One barber: name and on/off, photo, his sign-in, the services he does and his weekly hours. */
export function StaffDetail() {
  const { id } = useParams()
  const staff = useStaff()
  const shop = useShop()
  const edit = can(shop.myRole).editSetup
  if (staff.isPending) return <Loading />
  if (staff.isError) return <ErrorState message={messageOf(staff.error)} onRetry={() => staff.refetch()} />
  const s = staff.data.find((x) => x.id === id)
  if (!s) {
    return (
      <Page back="/setup/staff" title="Barber">
        <EmptyState title="This barber isn't here any more" />
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
      </Fragment>
    </Page>
  )
}

function useSaver() {
  const after = useAfterChange()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  // New hours or services that would strand upcoming bookings (409 BOOKINGS_IN_THE_WAY lists them)
  const [inTheWay, setInTheWay] = useState<InTheWay[] | null>(null)
  async function run(call: () => Promise<unknown>, message = 'Saved.') {
    setBusy(true)
    setError(null)
    setSaved(null)
    setInTheWay(null)
    try {
      await call()
      setSaved(message)
    } catch (e) {
      setError(
        isApiError(e, 'STAFF_CHANGED') ? 'Someone changed this barber meanwhile. The page now shows the latest; try again.' : explain(e),
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
  if (!list || list.length === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warn/50 p-3">
      <p className="font-semibold">{list.length === 1 ? '1 booking is in the way' : `${list.length} bookings are in the way`}</p>
      <p className="text-sm text-muted">Give these to another barber or cancel them on the day board, then save again.</p>
      <ul className="flex flex-col gap-1 text-sm">
        {list.map((a) => (
          <li key={a.id}>
            <Link className="text-brand underline" to={dayLink(a)}>
              {dateTimeIst(a.startsAt)}–{timeIst(a.endsAt)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function NameAndActive({ s, edit }: { s: Staff; edit: boolean }) {
  const [name, setName] = useState(s.name)
  const { busy, error, saved, run } = useSaver()
  const changed = name.trim() !== s.name
  return (
    <Card className="flex flex-col gap-3">
      <Field id="staff-edit-name" label="Name" value={name} maxLength={60} disabled={!edit} onChange={(e) => setName(e.target.value)} />
      {edit && changed && (
        <Button busy={busy} disabled={name.trim().length < 2} onClick={() => run(() => setupApi.updateStaff(s.id, s.version, { name: name.trim() }))}>
          Save name
        </Button>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Working here</p>
          <p className="text-sm text-muted">Switched off, he can't be booked. His bookings must be moved first.</p>
        </div>
        <Switch
          label="Working here"
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
  const after = useAfterChange()
  return (
    <Card>
      <PhotoPicker
        label="Photo (optional)"
        hint="Customers may see it when choosing a barber."
        capture="user"
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
  const [phone, setPhone] = useState('')
  const { busy, error, saved, run } = useSaver()
  const normalized = normalizePhone(phone)
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-medium">His own sign-in</p>
        <p className="text-sm text-muted">
          With a sign-in he opens this app with his phone number and sees his own bookings. You invite his number; he
          accepts in Apni Dukan. {s.invitedPhone ? `Invited: +91 ${formatPhone(s.invitedPhone)}, waiting for him to accept` : loginText(s.loginPhone)}.
        </p>
      </div>
      {edit &&
        (s.loginPhone ? (
          <Button variant="secondary" busy={busy} onClick={() => run(() => setupApi.unlinkLogin(s.id), 'Sign-in removed. He is signed out.')}>
            Remove his sign-in
          </Button>
        ) : s.invitedPhone ? (
          <Button variant="secondary" busy={busy} onClick={() => run(() => setupApi.unlinkLogin(s.id), 'Invitation cancelled.')}>
            Cancel the invitation
          </Button>
        ) : (
          <>
            <Field id="staff-phone" label="His mobile number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button
              busy={busy}
              disabled={!normalized}
              onClick={() => run(() => setupApi.linkLogin(s.id, normalized!), "Invitation sent. He'll see it in Apni Dukan when he signs in with this number.")}
            >
              Invite him to sign in
            </Button>
          </>
        ))}
      {error && <Banner tone="bad">{error}</Banner>}
      {saved && !error && <Banner tone="good">{saved}</Banner>}
    </Card>
  )
}

function Skills({ s, edit }: { s: Staff; edit: boolean }) {
  const services = useServices()
  const [picked, setPicked] = useState<string[]>(s.serviceIds)
  const { busy, error, saved, inTheWay, run } = useSaver()
  const changed = picked.length !== s.serviceIds.length || picked.some((p) => !s.serviceIds.includes(p))
  const list = services.data?.filter((v) => v.active || s.serviceIds.includes(v.id)) ?? []
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-medium">Services he does</p>
      {services.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">Add services first.</p>
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
                {!v.active && <span className="text-xs text-muted">(switched off)</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {edit && changed && (
        <Button busy={busy} onClick={() => run(() => setupApi.setServices(s.id, s.version, picked))}>
          Save services
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
 * The day after "Add hours" (10:00–20:00) or "Add a second shift": the new shift starts where the first one ends (till
 * closing). When the first already runs to closing (or later), it is cut at its middle and the second starts an hour
 * after (a lunch break), so 10:00–20:00 becomes 10:00–15:00 and 16:00–20:00. Either way nothing overlaps; the owner
 * adjusts the times after.
 */
export function withSecondShift(day: Array<{ start: string; end: string }>): Array<{ start: string; end: string }> {
  const [first] = day
  if (!first) return [{ start: DAY_START, end: CLOSING }]
  const start = toMin(first.start)
  const end = toMin(first.end)
  if (first.end < CLOSING) return [first, { start: first.end, end: CLOSING }]
  // Cut at the middle (15-minute steps), keeping at least an hour on each side of the hour's break
  const middle = Math.floor((start + end) / 2 / 15) * 15
  if (middle - start >= 60 && end - (middle + 60) >= 60) {
    return [{ ...first, end: toTime(middle) }, { start: toTime(middle + 60), end: first.end }]
  }
  // Too short to cut: after it if the day has an hour left, else before it; a shift of the whole day leaves no room
  if (end <= 23 * 60) return [first, { start: first.end, end: toTime(Math.min(end + 4 * 60, 24 * 60)) }]
  if (start >= 60) return [{ start: toTime(Math.max(0, start - 4 * 60)), end: first.start }, first]
  return day
}

/** Problems with a week before sending: end after start, 15-minute steps, shifts in a day not overlapping. */
export function checkWeek(w: Week): string | null {
  for (const [d, shifts] of Object.entries(w)) {
    const day = weekdayName(Number(d))
    const sorted = [...shifts].sort((a, b) => a.start.localeCompare(b.start))
    for (const [i, x] of sorted.entries()) {
      if (!x.start || !x.end) return `${day}: fill in both times.`
      if (x.end <= x.start) return `${day}: the end must be after the start.`
      if (![x.start, x.end].every((t) => Number(t.split(':')[1]) % 15 === 0)) return `${day}: use 15-minute steps (10:00, 10:15, …).`
      const next = sorted.at(i + 1)
      if (next && next.start < x.end) return `${day}: two shifts overlap.`
    }
  }
  return null
}

function Hours({ s, edit }: { s: Staff; edit: boolean }) {
  const [week, setWeek] = useState<Week>(() => toWeek(s.hours))
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
        <p className="font-medium">Weekly hours</p>
        {edit && week[1].length > 0 && (
          <button type="button" className="text-sm text-brand underline" onClick={copyMonday}>
            Copy Monday to Tue–Sat
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <li key={d} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0">
            <div className="flex items-center justify-between">
              <span className="w-12 font-medium">{weekdayName(d)}</span>
              {week[d].length === 0 && <span className="flex-1 text-sm text-muted">Off</span>}
              {edit && week[d].length < 2 && (
                <button
                  type="button"
                  className="text-sm text-brand underline"
                  onClick={() => setWeek({ ...week, [d]: withSecondShift(week[d]) })}
                >
                  {week[d].length ? 'Add a second shift' : 'Add hours'}
                </button>
              )}
            </div>
            {week[d].map((x, i) => (
              <div key={i} className="flex flex-col gap-1">
                {edit ? (
                  <>
                    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <Field id={`h-${d}-${i}-s`} label="From" type="time" step={900} value={x.start} onChange={(e) => setShift(d, i, 'start', e.target.value)} />
                      {x.end === '24:00' ? (
                        <p className="flex min-h-12 items-center text-sm">To midnight</p>
                      ) : (
                        <Field id={`h-${d}-${i}-e`} label="To" type="time" step={900} value={x.end} onChange={(e) => setShift(d, i, 'end', e.target.value)} />
                      )}
                      <Button variant="ghost" aria-label={`Remove ${weekdayName(d)} shift`} onClick={() => setWeek({ ...week, [d]: week[d].filter((_, j) => j !== i) })}>
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
                      Till midnight
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
        <Button busy={busy} disabled={Boolean(problem)} onClick={() => run(() => setupApi.setHours(s.id, s.version, fromWeek(week)))}>
          Save hours
        </Button>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <BookingsInTheWay list={inTheWay} />
      {saved && !error && <Banner tone="good">{saved}</Banner>}
    </Card>
  )
}
