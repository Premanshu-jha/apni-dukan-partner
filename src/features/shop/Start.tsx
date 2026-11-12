import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { refreshSession } from '../../api/client'
import { messageOf } from '../../api/errors'
import { fetchMyShop, shopApi, shopKeys, useMyShop } from '../../api/shop'
import { Banner, Button, Card, Loading, Page } from '../../components/ui'
import { formatPhone } from '../../lib/phone'
import { useSession } from '../../store/session'
import { Brand } from '../auth/Brand'
import { signOutHere } from '../profile/signOut'
import { HandoverOffers } from './HandoverOffers'
import { InviteOffers } from './InviteOffers'
import { closedNotice, forgetClosed, startNotice } from './ownership'

/**
 * Signed in, no shop yet (404 NO_SHOP): register a salon, or, for someone who works in one, show the number the
 * owner must add.
 */
export function Start() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useSession((s) => s.user)!
  const shop = useMyShop()
  const [worker, setWorker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Just closed a shop (CloseShop): say so while this screen is open, once
  const [closed] = useState(closedNotice)
  const [note] = useState(startNotice)
  useEffect(() => forgetClosed(), [])

  if (shop.isPending) return <Loading />
  if (shop.data && shop.data.status !== 'CLOSED') return <Navigate to="/" replace />

  async function checkAgain() {
    setBusy(true)
    setNotice(null)
    try {
      const mine = await fetchMyShop()
      if (mine) {
        // Added to a shop: a fresh token carries it.
        await refreshSession()
        qc.setQueryData(shopKeys.mine, mine)
        navigate('/', { replace: true })
      } else {
        // Joining is by invitation now: look for one for this number
        const invites = await qc.fetchQuery({ queryKey: shopKeys.incomingInvites, queryFn: shopApi.incomingInvites, staleTime: 0 })
        setNotice(invites.length ? 'Your invitation is at the top of this screen: accept it to join.' : 'No invitation for this number yet.')
      }
    } catch (e) {
      setNotice(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <Brand subtitle={`Welcome, ${user.name ?? ''}. Let's get your salon on Clozest.`} />
      {closed && (
        <Banner tone="info">
          {closed} is closed. Its upcoming bookings were cancelled and the customers told. You can register a new salon,
          or delete your account below.
        </Banner>
      )}
      {note && <Banner tone="info">{note}</Banner>}
      {shop.isError && <Banner tone="bad">{messageOf(shop.error)}</Banner>}
      <InviteOffers />
      <HandoverOffers />
      {!worker ? (
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <p className="text-lg font-semibold">I own a salon</p>
            <p className="text-sm text-muted">
              Register it in three short steps. Our field team visits, and then customers nearby can book you.
            </p>
            <Button onClick={() => navigate('/register')}>Register my salon</Button>
          </Card>
          <Card className="flex flex-col gap-3">
            <p className="text-lg font-semibold">I work at a salon</p>
            <p className="text-sm text-muted">A barber or a helper whose owner already uses Clozest.</p>
            <Button variant="secondary" onClick={() => setWorker(true)}>
              I work at a salon
            </Button>
          </Card>
        </div>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-semibold">Ask your owner to invite you</p>
          <p className="text-muted">
            Your owner invites this number in their Clozest Partner app (Team for helpers, or a barber's profile for
            barbers). The invitation shows on this screen; accept it to join:
          </p>
          <p className="text-center text-2xl font-bold tracking-wide">+91 {formatPhone(user.phone)}</p>
          {notice && <Banner tone="info">{notice}</Banner>}
          <Button busy={busy} onClick={checkAgain}>
            I've been invited, check again
          </Button>
          <Button variant="ghost" onClick={() => setWorker(false)}>
            Back
          </Button>
        </Card>
      )}
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
