import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router'
import { messageOf } from '../../api/errors'
import { shopApi, shopKeys, useAddressRequest, useShop } from '../../api/shop'
import type { AddressRequest } from '../../api/types'
import { Banner, Button, Card, ErrorState, Loading } from '../../components/ui'
import { useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { RegisterDetails } from './Register'
import { teamAsk, TeamReasons } from './TeamReasons'

/**
 * Request address change (owner of a verified salon): the address and pin are the field team's to change, so the
 * owner sends them the new ones. What is waiting shows on top (with Cancel), a declined one with the reason; the form
 * below starts from the waiting request (to change it), else the declined one (to fix it), else the salon's address. A salon not verified yet changes its
 * address itself in Salon details.
 */
export function AddressRequestPage() {
  const t = useT()
  const shop = useShop()
  const qc = useQueryClient()
  const latest = useAddressRequest(Boolean(shop.addressLocked))
  const [justSent, setJustSent] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!shop.addressLocked) return <Navigate to="/setup/details" replace />
  if (latest.isPending) return <Loading />
  if (latest.isError) return <ErrorState message={messageOf(latest.error)} onRetry={() => void latest.refetch()} />

  const request = latest.data
  const waiting = request?.status === 'PENDING' ? request : null

  async function cancel() {
    setCancelling(true)
    setError(null)
    try {
      await shopApi.cancelAddressRequest(shop.version)
      setJustSent(false)
      await Promise.all([
        qc.invalidateQueries({ queryKey: shopKeys.addressRequest }),
        qc.invalidateQueries({ queryKey: shopKeys.mine }),
      ])
    } catch (e) {
      setError(messageOf(e))
      void qc.invalidateQueries({ queryKey: shopKeys.mine })
    } finally {
      setCancelling(false)
    }
  }

  function sent(r: AddressRequest) {
    qc.setQueryData(shopKeys.addressRequest, r)
    setJustSent(true)
  }

  const top = (
    <>
      {waiting && (
        <Card className="flex flex-col gap-2 border-brand/40">
          <p className="font-semibold">{justSent ? t('shop.addressSentToTeam') : t('shop.addressWaitingForTeam')}</p>
          <p className="text-sm break-words">
            {t('shop.addressNew', { addressLine: waiting.addressLine, area: waiting.area, city: waiting.city, pincode: waiting.pincode })}
          </p>
          <p className="text-sm text-muted">
            {t('shop.addressAskedUntilApproved', { date: dateTimeIst(waiting.createdAt), addressLine: shop.addressLine, area: shop.area })}
          </p>
          {error && <Banner tone="bad">{error}</Banner>}
          <Button variant="secondary" busy={cancelling} onClick={cancel}>
            {t('shop.addressCancelRequest')}
          </Button>
        </Card>
      )}
      {request?.status === 'DECLINED' && <Declined request={request} />}
    </>
  )
  // The form starts from the request waiting when the page opened, else a declined one (fix what the team named, not
  // type it all again); it keeps what is typed after that (a decision by the field team meanwhile shows in the card
  // above, not by wiping the form)
  // Only while nothing changed on the shop since the decline (the decline itself touches it): an address the field team
  // set afterwards is the one to start from, not the declined one
  const declined = request?.status === 'DECLINED' && request.decidedAt
    && Date.parse(shop.updatedAt) - Date.parse(request.decidedAt) < 5_000 ? request : null
  return <RegisterDetails request={{ start: waiting ?? declined, waiting: waiting !== null, onSent: sent, top }} />
}

/** A declined request: the team's reasons, each in the reader's language, and their note (or only their words, as before). */
function Declined({ request }: { request: AddressRequest }) {
  const t = useT()
  const ask = teamAsk(request.statusReasonCodes, request.reason)
  if (!ask || ask.codes.length === 0) {
    return (
      <Banner tone="warn" live={false}>
        {t('shop.addressDeclined', { addressLine: request.addressLine, reason: request.reason ?? '' })}
      </Banner>
    )
  }
  return (
    <Banner tone="warn" live={false}>
      <p className="mb-1">{t('shop.addressDeclinedList', { addressLine: request.addressLine })}</p>
      <TeamReasons ask={ask} />
    </Banner>
  )
}
