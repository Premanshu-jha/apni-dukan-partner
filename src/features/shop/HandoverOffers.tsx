import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { refreshSession } from '../../api/client'
import { isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useIncomingHandovers, useMyShop } from '../../api/shop'
import type { IncomingHandover, Shop } from '../../api/types'
import { Banner, Button, Card, EmptyState, ErrorState, Loading, Page, Sheet } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { useSession } from '../../store/session'
import { rememberReturn } from '../auth/flow'
import { goneText, shopChanged } from './ownership'

/**
 * Hand-over requests made to this person's phone (GET /me/handover), each with Accept and Decline. Shown at the top of
 * the start screen (no shop yet) and of the day board, and on its own page (/handover, where the message points).
 * Nothing is drawn while there are none, unless `page` (then it says so).
 */
export function HandoverOffers({ page = false }: { page?: boolean }) {
  const incoming = useIncomingHandovers()
  const [note, setNote] = useState<string | null>(null)
  if (incoming.isPending) return page ? <Loading /> : null
  if (incoming.isError && incoming.data === undefined) {
    return page ? <ErrorState message={messageOf(incoming.error)} onRetry={() => incoming.refetch()} /> : null
  }
  const list = incoming.data ?? []
  return (
    <>
      {note && <Banner tone="info">{note}</Banner>}
      {list.length === 0
        ? page && <EmptyState title="No requests waiting" body="When a shop owner asks you to take over their shop, it shows here." />
        : list.map((h) => <Offer key={h.id} offer={h} onNote={setNote} />)}
    </>
  )
}

function Offer({ offer, onNote }: { offer: IncomingHandover; onNote: (text: string | null) => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const mine = useMyShop().data ?? null
  const setUser = useSession((s) => s.setUser)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Accepted, but the sign-in couldn't be renewed: the shop is theirs; renewing again opens it
  const [unrenewed, setUnrenewed] = useState<Shop | null>(null)
  const sameShop = mine?.id === offer.shopId

  async function answer(kind: 'accept' | 'decline') {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'accept') {
        const { shop, renewed } = await shopApi.accept(offer.id)
        if (!renewed) {
          setUnrenewed(shop)
          setError("You're the owner now, but this phone couldn't renew its sign-in. Check the connection and tap Try again.")
          return
        }
        open(shop)
        return
      }
      await shopApi.decline(offer.id)
      qc.setQueryData<IncomingHandover[]>(shopKeys.incoming, (l) => (l ?? []).filter((h) => h.id !== offer.id))
      onNote(`You declined. ${offer.ownerName} has been told.`)
    } catch (e) {
      if (isApiError(e, 'HANDOVER_GONE') || isApiError(e, 'HANDOVER_NOT_FOUND')) {
        // Answered, cancelled, run out or the shop closed meanwhile: it leaves the list, and the reason stays
        onNote(isApiError(e, 'HANDOVER_GONE') ? goneText(e.details.status) : "This request isn't open for your number any more.")
        setAsking(false)
        void qc.invalidateQueries({ queryKey: shopKeys.incoming })
      } else if (isApiError(e, 'PROFILE_INCOMPLETE')) {
        // The saved profile was out of date: read it again; the sign-in steps ask for what's missing, then come back
        // to the requests (on /handover first, so that is where the steps return to)
        rememberReturn('/handover')
        setError('Finish your profile (a verified email and your name) first.')
        navigate('/handover')
        void authApi.me().then(setUser).catch(() => {})
      } else if (isApiError(e, 'ALREADY_IN_A_SHOP')) {
        setError(`${messageOf(e)}${mine ? ` You can leave ${mine.name} from More.` : ''}`)
      } else {
        setError(messageOf(e))
      }
    } finally {
      setBusy(null)
    }
  }

  function open(shop: Shop) {
    qc.setQueryData<IncomingHandover[]>(shopKeys.incoming, (l) => (l ?? []).filter((h) => h.id !== offer.id))
    shopChanged(qc, shop)
    navigate('/', { replace: true })
  }

  async function renewAgain() {
    setBusy('accept')
    if (await refreshSession()) open(unrenewed!)
    else setBusy(null)
  }

  if (unrenewed) {
    return (
      <Card className="flex flex-col gap-3 border-brand/50">
        <p className="text-lg font-semibold">{offer.shopName} is yours</p>
        <Banner tone="warn">{error}</Banner>
        <Button busy={busy === 'accept'} onClick={renewAgain}>
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 border-brand/50">
      <p className="text-lg font-semibold">Take over {offer.shopName}?</p>
      <p className="text-sm">
        {offer.ownerName}, the owner of {offer.shopName} (shop code {offer.shopCode}, {offer.area}, {offer.city}), wants to
        hand the shop over to you.
      </p>
      <p className="text-xs text-muted">Asked on {dateTimeIst(offer.createdAt)}; open until {dateTimeIst(offer.expiresAt)}.</p>
      {error && !asking && <Banner tone="bad">{error}</Banner>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setAsking(true)} disabled={busy !== null}>
          Accept
        </Button>
        <Button variant="secondary" className="flex-1" busy={busy === 'decline'} disabled={busy === 'accept'} onClick={() => answer('decline')}>
          Decline
        </Button>
      </div>
      <Sheet open={asking} title={`Become the owner of ${offer.shopName}?`} onClose={() => (busy ? undefined : setAsking(false))}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">
            You become its owner: its details, photos, bookings and team are yours to run. {offer.ownerName} leaves the shop.
            {sameShop ? ' You stay in it, as the owner now.' : ''} Check the owner's name and photo afterwards (a new photo
            means our team checks the shop again).
          </p>
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy === 'accept'} onClick={() => answer('accept')}>
            Accept and become the owner
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => setAsking(false)}>
            Not now
          </Button>
        </div>
      </Sheet>
    </Card>
  )
}

/** /handover: where the "A shop for you" message opens, with or without a shop. */
export function HandoverPage() {
  return (
    <Page back="/" title="Take over a shop">
      <HandoverOffers page />
    </Page>
  )
}
