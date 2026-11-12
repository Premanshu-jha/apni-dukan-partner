import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { shopApi, useShop } from '../../api/shop'
import { can } from '../../lib/roles'
import { fieldError, messageOf } from '../../api/errors'
import { Banner, Button, Card, Field, Loading, Page, Sheet } from '../../components/ui'
import { CopyCode } from '../../components/CopyCode'
import { MapBoundary } from '../../components/MapBoundary'
import { formatPhone } from '../../lib/phone'
import { takePhoneChanged } from '../../lib/phoneMoved'
import { SUPPORT_EMAIL } from '../../lib/config'
import { useSession } from '../../store/session'
import { NotificationsRow } from './Notifications'
import { signOutHere } from './signOut'

/** The map library is big: loaded only when the owner opens the pin. */
const PinMap = lazy(() => import('../../components/PinMap').then((m) => ({ default: m.PinMap })))

/** More: the person's profile, the salon's other screens, help and signing out. */
export function Profile() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [phoneChanged] = useState(takePhoneChanged)
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
  const [showPin, setShowPin] = useState(false)
  const owner = shop.myRole === 'OWNER'

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
    rights.seeSetup && { to: '/salon/offers', text: 'Offers' },
    rights.seeSetup && { to: '/salon/ratings', text: 'Ratings' },
    { to: '/notifications', text: 'Messages' },
  ].filter(Boolean) as Array<{ to: string; text: string }>

  return (
    <Page title="More">
      {phoneChanged && (
        <Banner tone="good">
          Your mobile number is now +91 {formatPhone(phoneChanged)}. Other devices were signed out; sign in there with
          the new number.
        </Banner>
      )}
      {/* The salon as registered, in full: what the owner can check and, if wrong, change in one tap */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-semibold break-words">{shop.name}</p>
          {owner && (
            <Link to="/setup/details" state={{ from: '/more' }} className="shrink-0 text-sm text-link" aria-label="Edit salon details">
              Edit
            </Link>
          )}
        </div>
        <p className="text-sm text-muted break-words">
          {shop.addressLine}, {shop.area}, {shop.city} {shop.pincode}
        </p>
        <p className="text-sm text-muted break-words">Owner: {shop.ownerName}</p>
        {owner && (
          <p className="text-sm text-muted break-words">
            GSTIN: {shop.gstin ?? 'not added'} · Udyam: {shop.udyamNumber ?? 'not added'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>Shop code {shop.shopCode}</span>
          <CopyCode code={String(shop.shopCode)} />
          <span>· You are the {owner ? 'owner' : shop.myRole === 'HELPER' ? 'helper' : 'barber'}</span>
        </div>
        {shop.recheckSince && (
          <p className="text-sm text-muted">Our field team will check your recent changes. Your salon stays live meanwhile.</p>
        )}
        {owner && (
          <p className="flex flex-wrap gap-x-4 text-sm">
            <Link to="/setup/photos" state={{ from: '/more' }} className="text-link underline">
              Photos and video
            </Link>
            <Link to="/setup/document" state={{ from: '/more' }} className="text-link underline">
              Registration document
            </Link>
          </p>
        )}
        <button type="button" className="self-start text-sm text-link underline" aria-expanded={showPin} onClick={() => setShowPin((v) => !v)}>
          {showPin ? 'Hide the map' : 'See the pin on the map'}
        </button>
        {showPin && (
          <MapBoundary>
            <Suspense fallback={<Loading label="Loading the map…" />}>
              <PinMap lat={shop.latitude} lng={shop.longitude} />
            </Suspense>
          </MapBoundary>
        )}
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
            <Field id="profile-name" label="Your name" hint="Your sign-in name. The salon's owner name is in the salon details." value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
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
          <Row label="Your name" value={user.name ?? ''} action={<button type="button" className="text-link" aria-label="Edit your name" onClick={() => setEditing(true)}>Edit</button>} />
        )}
        <Row
          label="Mobile"
          value={`+91 ${formatPhone(user.phone)}`}
          action={
            <Link to="/profile/phone" className="text-link" aria-label="Change mobile number">
              Change
            </Link>
          }
        />
        <Row
          label="Email"
          value={user.email ?? ''}
          action={
            <Link to="/profile/email" className="text-link">
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
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-link underline">
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
        {shop.myRole === 'OWNER' && (
          <>
            <Link to="/shop/handover" className="py-3 text-center text-sm text-link underline">
              Hand over {shop.name}
            </Link>
            <Link to="/shop/close" className="py-3 text-center text-sm text-bad underline">
              Close {shop.name}
            </Link>
          </>
        )}
        {rights.deleteAccount ? (
          <Link to="/profile/delete" className="py-3 text-center text-sm text-bad underline">
            Delete my account
          </Link>
        ) : (
          <p className="py-3 text-center text-sm text-muted">
            To delete your account, <Link to="/shop/close" className="underline">close</Link> or{' '}
            <Link to="/shop/handover" className="underline">hand over</Link> your shop first.
          </p>
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
        <p className="break-all">{value}</p>
      </div>
      {action}
    </div>
  )
}
