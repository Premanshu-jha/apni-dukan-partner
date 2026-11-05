import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { useParams } from 'react-router'
import { isApiError, messageOf } from '../../api/errors'
import { salonKeys, setupApi, useServices, useStaff } from '../../api/salon'
import { fileApi, useShop } from '../../api/shop'
import type { Shift, Staff } from '../../api/types'
import { PhotoPicker } from '../../components/PhotoPicker'
import { Banner, Button, Card, EmptyState, ErrorState, Field, Loading, Page, Switch } from '../../components/ui'
import { clock12, weekdayName } from '../../lib/ist'
import { normalizePhone } from '../../lib/phone'
import { can } from '../../lib/roles'
import { loginText } from './Staff'

/** Every change on this page reloads the barber list, so the next change sends the newest version. */
function useAfterChange() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: salonKeys.all })
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
        <Login s={s} edit={edit} />
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
  async function run(call: () => Promise<unknown>, message = 'Saved.') {
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      await call()
      setSaved(message)
    } catch (e) {
      setError(
        isApiError(e, 'STAFF_CHANGED') ? 'Someone changed this barber meanwhile. The page now shows the latest; try again.' : messageOf(e),
      )
    } finally {
      setBusy(false)
      await after()
    }
  }
  return { busy, error, saved, run }
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
          With a sign-in he opens this app with his phone number and sees his own bookings. {loginText(s.loginPhone)}.
        </p>
      </div>
      {edit &&
        (s.loginPhone ? (
          <Button variant="secondary" busy={busy} onClick={() => run(() => setupApi.unlinkLogin(s.id), 'Sign-in removed. He is signed out.')}>
            Remove his sign-in
          </Button>
        ) : (
          <>
            <Field id="staff-phone" label="His mobile number" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button busy={busy} disabled={!normalized} onClick={() => run(() => setupApi.linkLogin(s.id, normalized!), 'Done. He can sign in with this number now.')}>
              Give sign-in
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
  const { busy, error, saved, run } = useSaver()
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
  const { busy, error, saved, run } = useSaver()
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
                  onClick={() => setWeek({ ...week, [d]: [...week[d], week[d].length ? { start: '16:00', end: '20:00' } : { start: '10:00', end: '20:00' }] })}
                >
                  {week[d].length ? 'Add a second shift' : 'Add hours'}
                </button>
              )}
            </div>
            {week[d].map((x, i) => (
              <div key={i} className="flex items-end gap-2">
                {edit ? (
                  <>
                    <Field id={`h-${d}-${i}-s`} label="From" type="time" step={900} value={x.start} onChange={(e) => setShift(d, i, 'start', e.target.value)} />
                    <Field id={`h-${d}-${i}-e`} label="To" type="time" step={900} value={x.end} onChange={(e) => setShift(d, i, 'end', e.target.value)} />
                    <Button variant="ghost" aria-label={`Remove ${weekdayName(d)} shift`} onClick={() => setWeek({ ...week, [d]: week[d].filter((_, j) => j !== i) })}>
                      ✕
                    </Button>
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
      {saved && !error && <Banner tone="good">{saved}</Banner>}
    </Card>
  )
}
