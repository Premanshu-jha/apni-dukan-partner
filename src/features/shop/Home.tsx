import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from 'react-router'
import { useShop } from '../../api/shop'
import { Button, Card, EmptyState, Page } from '../../components/ui'
import { signOutHere } from '../profile/signOut'
import { HandoverOffers } from './HandoverOffers'
import { useRecheckShop } from './ShopGate'

/** Where "/" goes: registration for a draft owner, a wait screen for staff of a salon not live yet, else today. */
export function Home() {
  const shop = useShop()
  if (shop.myRole === 'OWNER' && shop.status === 'DRAFT') return <Navigate to="/register" replace />
  if (shop.myRole !== 'OWNER' && (shop.status === 'DRAFT' || shop.status === 'PENDING_VISIT')) return <NotLiveYet />
  return <Navigate to="/salon/day" replace />
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
      <EmptyState
        title="Your salon isn't live yet"
        body={`${shop.ownerName} has registered ${shop.name}. Once our field team approves it, you'll see the day's bookings here.`}
        action={<Button onClick={() => recheck()}>Check again</Button>}
      />
      <Button variant="ghost" onClick={() => signOutHere(qc).then(() => navigate('/signin', { replace: true }))}>
        Sign out
      </Button>
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
        Your shop code: <span className="font-bold tracking-wide">{shop.shopCode}</span>
      </p>
      <p className="text-xs text-muted">Quote it when you talk to us.</p>
    </Card>
  )
}
