import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router'
import { messageOf } from '../../api/errors'
import { shopApi, shopKeys, useAddressRequest, useShop } from '../../api/shop'
import type { AddressRequest } from '../../api/types'
import { Banner, Button, Card, ErrorState, Loading } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { RegisterDetails } from './Register'

/**
 * Request address change (owner of a verified salon): the address and pin are the field team's to change, so the
 * owner sends them the new ones. What is waiting shows on top (with Cancel), a declined one with the reason; the form
 * below starts from the waiting request (to change it) or the salon's address. A salon not verified yet changes its
 * address itself in Salon details.
 */
export function AddressRequestPage() {
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
          <p className="font-semibold">{justSent ? 'Sent to our field team' : 'Waiting for our field team'}</p>
          <p className="text-sm break-words">
            New address: {waiting.addressLine}, {waiting.area}, {waiting.city} {waiting.pincode}
          </p>
          <p className="text-sm text-muted">
            Asked {dateTimeIst(waiting.createdAt)}. Until they approve it, customers see your salon at{' '}
            {shop.addressLine}, {shop.area} and can book as usual. Change it below, or:
          </p>
          {error && <Banner tone="bad">{error}</Banner>}
          <Button variant="secondary" busy={cancelling} onClick={cancel}>
            Cancel the request
          </Button>
        </Card>
      )}
      {request?.status === 'DECLINED' && (
        <Banner tone="warn" live={false}>
          Your last request ({request.addressLine}) wasn't approved: “{request.reason}” Your address stays as it was; you
          can send a new one below.
        </Banner>
      )}
    </>
  )
  // The form starts from the request waiting when the page opened; it keeps what is typed after that (a decision by
  // the field team meanwhile shows in the card above, not by wiping the form)
  return <RegisterDetails request={{ start: waiting, waiting: waiting !== null, onSent: sent, top }} />
}
