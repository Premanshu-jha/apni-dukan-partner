import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { refreshSession } from '../../api/client'
import { isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useIncomingInvites, useMyShop } from '../../api/shop'
import type { IncomingInvite, Shop } from '../../api/types'
import { Banner, Button, Card, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { t, useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { shopChanged } from './ownership'
import { LeaveShop } from '../profile/LeaveShop'

/** Why an invitation can't be answered any more (409 INVITE_GONE `details.status`). */
export function inviteGoneText(status: unknown): string {
  switch (status) {
    case 'ACCEPTED':
      return t('shop.inviteGoneAccepted')
    case 'DECLINED':
      return t('shop.inviteGoneDeclined')
    case 'CANCELLED':
      return t('shop.inviteGoneCancelled')
    case 'EXPIRED':
      return t('shop.inviteGoneExpired')
    case 'CLOSED':
      return t('shop.inviteGoneClosed')
    case 'STAFF_CHANGED':
      return t('shop.inviteGoneStaffChanged')
    default:
      return t('shop.inviteGoneOther')
  }
}

/**
 * What to say when another shop's invitation or hand-over is refused because this person is still in a shop
 * (ALREADY_IN_A_SHOP): leave it from More once More opens for them (the guard PastRegistration), else with the
 * "Leave" button shown right there.
 */
export function leaveAdvice(mine: Shop): string {
  return moreOpensFor(mine) ? t('shop.leaveShopFromMore', { name: mine.name }) : t('shop.leaveShopBelow', { name: mine.name })
}

/** More opens for this person (the same rule as the guard PastRegistration in guards.tsx). */
export function moreOpensFor(mine: Shop): boolean {
  return mine.myRole === 'OWNER' || (mine.type === 'KIRANA' && mine.status === 'PENDING_VISIT')
    ? mine.status !== 'DRAFT'
    : mine.status === 'APPROVED' || mine.status === 'SUSPENDED'
}

/**
 * Invitations to join a shop made to this person's phone (GET /me/invites), each with Accept and Decline. Shown at
 * the top of the start screen (no shop yet), of the day board for helpers and barbers, and of "not live yet", and on
 * its own page (/invites, where the "An invitation to join …" message points). Nothing is drawn while there are none,
 * unless `page` (then it says so).
 */
export function InviteOffers({ page = false }: { page?: boolean }) {
  const t = useT()
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
        ? page && <EmptyState title={t('shop.invitesNoneTitle')} body={t('shop.invitesNoneBody')} />
        : list.map((v) => <Invite key={v.id} invite={v} onNote={setNote} />)}
    </>
  )
}

function Invite({ invite, onNote }: { invite: IncomingInvite; onNote: (text: string | null) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const mine = useMyShop().data ?? null
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Refused: still in another shop (its Leave goes under the refusal when More can't be opened)
  const [inAnother, setInAnother] = useState(false)
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
    setInAnother(false)
    onNote(null)
    try {
      if (kind === 'accept') {
        const { shop, renewed } = await shopApi.acceptInvite(invite.id)
        if (!renewed) {
          setUnrenewed(shop)
          setError(t('shop.inviteJoinedNotRenewed'))
          return
        }
        open(shop)
        return
      }
      await shopApi.declineInvite(invite.id)
      drop()
      onNote(t('shop.inviteDeclined', { shopName: invite.shopName }))
    } catch (e) {
      if (isApiError(e, 'INVITE_GONE') || isApiError(e, 'INVITE_NOT_FOUND')) {
        // Answered, cancelled, run out or the shop closed meanwhile: it leaves the list, and the reason stays
        onNote(isApiError(e, 'INVITE_GONE') ? inviteGoneText(e.details.status) : t('shop.inviteNotOpenForNumber'))
        void qc.invalidateQueries({ queryKey: shopKeys.incomingInvites })
      } else if (isApiError(e, 'ALREADY_IN_A_SHOP')) {
        setError(`${messageOf(e)}${mine ? ` ${leaveAdvice(mine)}` : ''}`)
        setInAnother(true)
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
        <p className="text-lg font-semibold">{t('shop.inviteJoined', { shopName: invite.shopName })}</p>
        <Banner tone="warn">{error}</Banner>
        <Button busy={busy === 'accept'} onClick={renewAgain}>
          {t('common.retry')}
        </Button>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 border-brand/50">
      <p className="text-lg font-semibold">{t('shop.inviteJoin', { shopName: invite.shopName })}</p>
      <p className="text-sm">
        {t(invite.role === 'BARBER' ? 'shop.inviteBodyBarber' : 'shop.inviteBodyHelper', { shopName: invite.shopName, shopCode: String(invite.shopCode), area: invite.area, city: invite.city })}
      </p>
      <p className="text-xs text-muted">{t('shop.inviteSentOpenUntil', { sent: dateTimeIst(invite.createdAt), until: dateTimeIst(invite.expiresAt) })}</p>
      {error && <Banner tone="bad">{error}</Banner>}
      {inAnother && mine && !moreOpensFor(mine) && <LeaveShop shop={mine} then="/invites" />}
      <div className="flex gap-2">
        <Button className="flex-1" busy={busy === 'accept'} disabled={busy === 'decline'} onClick={() => answer('accept')}>
          {t('shop.accept')}
        </Button>
        <Button variant="secondary" className="flex-1" busy={busy === 'decline'} disabled={busy === 'accept'} onClick={() => answer('decline')}>
          {t('shop.decline')}
        </Button>
      </div>
    </Card>
  )
}

/** /invites: where the "An invitation to join …" message opens, with or without a shop. */
export function InvitesPage() {
  const t = useT()
  return (
    <Page back="/" title={t('shop.invitesPageTitle')}>
      <InviteOffers page />
    </Page>
  )
}
