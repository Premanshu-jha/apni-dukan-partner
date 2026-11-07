import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { refreshSession } from '../../api/client'
import { isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useIncomingInvites, useMyShop } from '../../api/shop'
import type { IncomingInvite, Shop } from '../../api/types'
import { Banner, Button, Card, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { shopChanged } from './ownership'

/** Why an invitation can't be answered any more (409 INVITE_GONE `details.status`). */
export function inviteGoneText(status: unknown): string {
  switch (status) {
    case 'ACCEPTED':
      return 'You already accepted this invitation.'
    case 'DECLINED':
      return 'You already declined this invitation.'
    case 'CANCELLED':
      return 'The owner cancelled this invitation.'
    case 'EXPIRED':
      return 'This invitation ran out (invitations last 7 days). Ask the owner to invite you again.'
    case 'CLOSED':
      return 'That shop has been closed.'
    case 'STAFF_CHANGED':
      return 'The owner changed that barber profile meanwhile. Ask them to invite you again.'
    default:
      return "This invitation isn't open any more."
  }
}

const roleWord = { HELPER: 'a helper', BARBER: 'a barber' } as const

/**
 * Invitations to join a shop made to this person's phone (GET /me/invites), each with Accept and Decline. Shown at
 * the top of the start screen (no shop yet), of the day board for helpers and barbers, and of "not live yet", and on
 * its own page (/invites, where the "An invitation to join …" message points). Nothing is drawn while there are none,
 * unless `page` (then it says so).
 */
export function InviteOffers({ page = false }: { page?: boolean }) {
  const incoming = useIncomingInvites()
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
        ? page && <EmptyState title="No invitations waiting" body="When a shop owner invites your number, it shows here." />
        : list.map((v) => <Invite key={v.id} invite={v} onNote={setNote} />)}
    </>
  )
}

function Invite({ invite, onNote }: { invite: IncomingInvite; onNote: (text: string | null) => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const mine = useMyShop().data ?? null
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Joined, but the sign-in couldn't be renewed: renewing again opens the shop
  const [unrenewed, setUnrenewed] = useState<Shop | null>(null)

  const drop = () => qc.setQueryData<IncomingInvite[]>(shopKeys.incomingInvites, (l) => (l ?? []).filter((v) => v.id !== invite.id))

  function open(shop: Shop) {
    drop()
    shopChanged(qc, shop)
    navigate('/', { replace: true })
  }

  async function answer(kind: 'accept' | 'decline') {
    if (busy) return
    setBusy(kind)
    setError(null)
    onNote(null)
    try {
      if (kind === 'accept') {
        const { shop, renewed } = await shopApi.acceptInvite(invite.id)
        if (!renewed) {
          setUnrenewed(shop)
          setError("You've joined, but this phone couldn't renew its sign-in. Check the connection and tap Try again.")
          return
        }
        open(shop)
        return
      }
      await shopApi.declineInvite(invite.id)
      drop()
      onNote(`You declined the invitation from ${invite.shopName}. The owner has been told.`)
    } catch (e) {
      if (isApiError(e, 'INVITE_GONE') || isApiError(e, 'INVITE_NOT_FOUND')) {
        // Answered, cancelled, run out or the shop closed meanwhile: it leaves the list, and the reason stays
        onNote(isApiError(e, 'INVITE_GONE') ? inviteGoneText(e.details.status) : "This invitation isn't open for your number any more.")
        void qc.invalidateQueries({ queryKey: shopKeys.incomingInvites })
      } else if (isApiError(e, 'ALREADY_IN_A_SHOP')) {
        setError(`${messageOf(e)}${mine ? ` You can leave ${mine.name} from More.` : ''}`)
      } else {
        setError(messageOf(e))
      }
    } finally {
      setBusy(null)
    }
  }

  async function renewAgain() {
    setBusy('accept')
    if (await refreshSession()) open(unrenewed!)
    else setBusy(null)
  }

  if (unrenewed) {
    return (
      <Card className="flex flex-col gap-3 border-brand/50">
        <p className="text-lg font-semibold">You've joined {invite.shopName}</p>
        <Banner tone="warn">{error}</Banner>
        <Button busy={busy === 'accept'} onClick={renewAgain}>
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 border-brand/50">
      <p className="text-lg font-semibold">Join {invite.shopName}?</p>
      <p className="text-sm">
        {invite.shopName} (shop code {invite.shopCode}, {invite.area}, {invite.city}) invited you to join as {roleWord[invite.role]}.
        {invite.role === 'BARBER' ? ' You will see your own bookings and add your breaks.' : ' You will help run the day: walk-ins, starting bookings, breaks.'}
      </p>
      <p className="text-xs text-muted">Sent on {dateTimeIst(invite.createdAt)}; open until {dateTimeIst(invite.expiresAt)}.</p>
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="flex gap-2">
        <Button className="flex-1" busy={busy === 'accept'} disabled={busy === 'decline'} onClick={() => answer('accept')}>
          Accept
        </Button>
        <Button variant="secondary" className="flex-1" busy={busy === 'decline'} disabled={busy === 'accept'} onClick={() => answer('decline')}>
          Decline
        </Button>
      </div>
    </Card>
  )
}

/** /invites: where the "An invitation to join …" message opens, with or without a shop. */
export function InvitesPage() {
  return (
    <Page back="/" title="Invitations">
      <InviteOffers page />
    </Page>
  )
}
