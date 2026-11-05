import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { shopApi, useShop } from '../../api/shop'
import { can } from '../../lib/roles'
import { fieldError, messageOf } from '../../api/errors'
import { Banner, Button, Card, Field, Page, Sheet } from '../../components/ui'
import { formatPhone } from '../../lib/phone'
import { SUPPORT_EMAIL } from '../../lib/config'
import { useSession } from '../../store/session'
import { NotificationsRow } from './Notifications'
import { signOutHere } from './signOut'

/** More: the person's profile, the salon's other screens, help and signing out. */
export function Profile() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useSession((s) => s.user)!
  const shop = useShop()
  const rights = can(shop.myRole)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const setUser = useSession((s) => s.setUser)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)

  async function saveName() {
    setBusy(true)
    setError(null)
    try {
      setUser(await authApi.rename(name.trim()))
      setEditing(false)
    } catch (e) {
      setError(fieldError(e, 'name') ?? messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const [outError, setOutError] = useState<string | null>(null)

  async function out(everywhere: boolean) {
    setBusy(true)
    setOutError(null)
    try {
      await signOutHere(qc, { everywhere })
      navigate('/signin', { replace: true })
    } catch (e) {
      // Not signed out anywhere: say so, so nobody believes a lost phone is signed out
      setOutError(`${messageOf(e)} Your other devices are still signed in.`)
      setBusy(false)
    }
  }

  async function leave() {
    setBusy(true)
    setLeaveError(null)
    try {
      await shopApi.leave()
      // Out of the shop: this session's token still names it, so start again with a fresh sign-in.
      await signOutHere(qc)
      navigate('/signin', { replace: true })
    } catch (e) {
      setLeaveError(messageOf(e))
      setBusy(false)
    }
  }

  const links = [
    rights.team && { to: '/team', text: 'Team and walk-in access' },
    rights.closures && { to: '/salon/closures', text: 'Closed days' },
    { to: '/notifications', text: 'Messages' },
  ].filter(Boolean) as Array<{ to: string; text: string }>

  return (
    <Page title="More">
      <Card className="flex flex-col gap-1">
        <p className="font-semibold">{shop.name}</p>
        <p className="text-sm text-muted">
          {shop.addressLine}, {shop.area}, {shop.city} {shop.pincode}
        </p>
        <p className="text-sm text-muted">
          Shop code {shop.shopCode} · You are the {shop.myRole === 'OWNER' ? 'owner' : shop.myRole === 'HELPER' ? 'helper' : 'barber'}
        </p>
      </Card>

      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 hover:bg-raised">
              {l.text}
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Card className="flex flex-col gap-4">
        {editing ? (
          <div className="flex flex-col gap-3">
            <Field id="profile-name" label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            {error && <Banner tone="bad">{error}</Banner>}
            <div className="flex gap-2">
              <Button busy={busy} disabled={name.trim().length < 2} onClick={saveName} className="flex-1">
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setName(user.name ?? '')
                  setError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Row label="Name" value={user.name ?? ''} action={<button type="button" className="text-brand" onClick={() => setEditing(true)}>Edit</button>} />
        )}
        <Row label="Mobile" value={`+91 ${formatPhone(user.phone)}`} />
        <Row
          label="Email"
          value={user.email ?? ''}
          action={
            <Link to="/profile/email" className="text-brand">
              Change
            </Link>
          }
        />
      </Card>

      <Card>
        <NotificationsRow />
      </Card>

      <Card className="flex flex-col gap-1">
        <p className="font-medium">Need help?</p>
        <p className="text-sm text-muted">
          A problem with a booking, the app or your salon's listing? Write to us with your shop code.
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-brand underline">
          {SUPPORT_EMAIL}
        </a>
      </Card>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" busy={busy} onClick={() => out(false)}>
          Sign out
        </Button>
        <Button variant="ghost" onClick={() => setConfirmAll(true)}>
          Sign out on all devices
        </Button>
        {rights.leaveShop && (
          <Button variant="ghost" className="text-bad" onClick={() => setLeaving(true)}>
            Leave {shop.name}
          </Button>
        )}
      </div>

      <Sheet open={confirmAll} title="Sign out everywhere?" onClose={() => setConfirmAll(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">Every phone and computer signed in to your account will need the SMS code again.</p>
          {outError && <Banner tone="bad">{outError}</Banner>}
          <Button busy={busy} onClick={() => out(true)}>
            Sign out everywhere
          </Button>
          <Button variant="secondary" onClick={() => setConfirmAll(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
      <Sheet open={leaving} title={`Leave ${shop.name}?`} onClose={() => setLeaving(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">You won't see this salon's bookings any more. The owner can add you again.</p>
          {leaveError && <Banner tone="bad">{leaveError}</Banner>}
          <Button variant="danger" busy={busy} onClick={leave}>
            Leave
          </Button>
          <Button variant="secondary" onClick={() => setLeaving(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="truncate">{value}</p>
      </div>
      {action}
    </div>
  )
}
