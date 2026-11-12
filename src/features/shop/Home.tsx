import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from 'react-router'
import { useSalonHours, useServices } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Button, Card, EmptyState, Loading, Page } from '../../components/ui'
import { CopyCode } from '../../components/CopyCode'
import { readyForVisit } from '../../lib/salonVideo'
import { signOutHere } from '../profile/signOut'
import { HandoverOffers } from './HandoverOffers'
import { InviteOffers } from './InviteOffers'
import { useRecheckShop } from './ShopGate'

/** Where "/" goes: registration for a draft owner, a wait screen for staff of a salon not live yet, else today. */
export function Home() {
  const shop = useShop()
  if (shop.myRole === 'OWNER' && shop.status === 'DRAFT') return <ResumeRegistration />
  if (shop.myRole !== 'OWNER' && (shop.status === 'DRAFT' || shop.status === 'PENDING_VISIT')) return <NotLiveYet />
  return <Navigate to="/salon/day" replace />
}

/**
 * An owner coming back to a registration he started: straight to the first step not done yet (photos and video,
 * services, hours), or the review when all are (also after the field team sent it back: it shows their reason and
 * links to every step), instead of step 1 and tapping Continue through the rest.
 */
function ResumeRegistration() {
  const shop = useShop()
  const photosDone = readyForVisit(shop)
  const services = useServices()
  const hours = useSalonHours()
  // Sent back by the field team: the review shows their reason, with a link to each step
  if (shop.statusReason) return <Navigate to="/register/review" replace />
  if (!photosDone) return <Navigate to="/register/photos" replace />
  if (services.isError || hours.isError) return <Navigate to="/register/review" replace />
  if (!services.data || !hours.data) return <Loading />
  if (!services.data.some((s) => s.active)) return <Navigate to="/register/services" replace />
  if (hours.data.days.length === 0) return <Navigate to="/register/hours" replace />
  return <Navigate to="/register/review" replace />
}

/** A helper or barber of a salon the field team hasn't approved yet: nothing to do until then. */
function NotLiveYet() {
  const shop = useShop()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const recheck = useRecheckShop()
  return (
    <Page title={shop.name}>
      <HandoverOffers />
      <InviteOffers />
      <EmptyState
        title="Your salon isn't live yet"
        body={`${shop.ownerName} has registered ${shop.name}. Once our field team approves it, you'll see the day's bookings here.`}
        action={<Button onClick={() => recheck()}>Check again</Button>}
      />
      <Button variant="ghost" onClick={() => signOutHere(qc).then(() => navigate('/signin', { replace: true }))}>
        Sign out
      </Button>
      <Link to="/help" className="py-2 text-center text-sm text-link underline">
        Need help? Write to support
      </Link>
      <Link to="/profile/delete" className="py-2 text-center text-sm text-bad underline">
        Delete my account
      </Link>
    </Page>
  )
}

/** On Today for an owner waiting for the visit: what happens next, and the shop code to quote. */
export function WaitingForVisit() {
  const shop = useShop()
  return (
    <Card className="flex flex-col gap-2 border-brand/40">
      <p className="text-lg font-semibold">Waiting for our field team</p>
      <p className="text-sm text-muted">
        We'll call you to fix a time, visit {shop.name} and switch it on. Customers can book once it's approved.
      </p>
      <p className="text-sm">
        Your shop code: <span className="font-bold tracking-wide">{shop.shopCode}</span>{' '}
        <CopyCode code={String(shop.shopCode)} />
      </p>
      <p className="text-xs text-muted">Quote it when you talk to us.</p>
    </Card>
  )
}
