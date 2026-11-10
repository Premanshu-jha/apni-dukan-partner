import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { fieldError, messageOf } from '../../api/errors'
import { addOwnerAsBarber, ownProfile, setupApi, useStaff, refreshSalonWork, SETUP_KEYS } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Banner, Button, EmptyState, ErrorState, Field, Loading, Page, Pill, Sheet } from '../../components/ui'
import { weekdayName } from '../../lib/ist'
import { formatPhone } from '../../lib/phone'
import { can } from '../../lib/roles'
import { useSession } from '../../store/session'
import type { Shift } from '../../api/types'

/** The owner who cuts hair too: one tap adds him (once he is one, nothing shows). */
function AddMe() {
  const qc = useQueryClient()
  const staff = useStaff()
  const phone = useSession((s) => s.user?.phone ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!staff.data || ownProfile(staff.data, phone)) return null
  return (
    <>
      <Button
        variant="secondary"
        busy={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await addOwnerAsBarber(qc)
          } catch (e) {
            setError(messageOf(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        Add me as a barber
      </Button>
      {error && <Banner tone="bad">{error}</Banner>}
    </>
  )
}

/** "Mon–Sat 10:00 AM–8:00 PM" style summary of a week, or "No hours yet". */
export function weekText(hours: Shift[]): string {
  if (!hours.length) return 'No hours yet'
  const days = [...new Set(hours.map((h) => h.weekday))].sort()
  return `${days.length} day${days.length === 1 ? '' : 's'} a week · ${days.map(weekdayName).join(', ')}`
}

/** The salon's barbers. Tap one to set his services, hours, photo and sign-in. */
export function StaffList() {
  const shop = useShop()
  const edit = can(shop.myRole).editSetup
  const staff = useStaff()
  const [adding, setAdding] = useState(false)
  return (
    <Page back="/setup" title="Barbers">
      {staff.isPending ? (
        <Loading />
      ) : staff.isError ? (
        <ErrorState message={messageOf(staff.error)} onRetry={() => staff.refetch()} />
      ) : (
        <>
          {staff.data.length === 0 ? (
            <EmptyState title="No barbers yet" body={edit ? 'Add everyone who cuts hair, yourself too if you do.' : undefined} />
          ) : (
            <ul className="flex flex-col gap-2">
              {staff.data.map((s) => (
                <li key={s.id}>
                  <Link to={`/setup/staff/${s.id}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3 hover:bg-raised">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      {!s.active && <Pill tone="muted">Off</Pill>}
                      {s.loginPhone && <Pill tone="brand">Has sign-in</Pill>}
                      {!s.loginPhone && s.invitedPhone && <Pill tone="warn">Invited: +91 {formatPhone(s.invitedPhone)}</Pill>}
                    </span>
                    <span className="text-sm text-muted">
                      {s.serviceIds.length} service{s.serviceIds.length === 1 ? '' : 's'} · {weekText(s.hours)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {edit && <Button onClick={() => setAdding(true)}>+ Add a barber</Button>}
          {shop.myRole === 'OWNER' && <AddMe />}
        </>
      )}
      {adding && <AddStaff onClose={() => setAdding(false)} />}
    </Page>
  )
}

function AddStaff({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const ok = name.trim().length >= 2 && name.trim().length <= 60
  async function add() {
    setBusy(true)
    setError(null)
    try {
      const s = await setupApi.addStaff(name.trim())
      refreshSalonWork(qc, SETUP_KEYS)
      navigate(`/setup/staff/${s.id}`)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Sheet open title="New barber" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field id="staff-name" label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={fieldError(error, 'name')} />
        {error != null && !fieldError(error, 'name') && <Banner tone="bad">{messageOf(error)}</Banner>}
        <Button busy={busy} disabled={!ok} onClick={add}>
          Add
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  )
}

/** Shown on a barber's page: "+91 98480 12345" or nothing. */
export function loginText(phone: string | null): string {
  return phone ? `+91 ${formatPhone(phone)}` : 'No sign-in'
}
