import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { explain, isApiError } from '../../api/errors'
import { shopApi, shopKeys, useShop } from '../../api/shop'
import type { RegistrationDocType, Shop } from '../../api/types'
import { Banner, Button, Card, Page } from '../../components/ui'
import { useLocation } from 'react-router'
import { cameFrom } from './Register'
import { RegistrationDocCard } from './RegistrationDoc'

/**
 * The Salon tab → Trade licence (the owner): add, change or remove it at any time. The salon stays live; a new licence
 * is checked automatically, and customers see "Licensed" once it passed (until its last valid day).
 */
export function SalonDocumentPage() {
  const qc = useQueryClient()
  const shop = useShop()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  // Saves and the removal go one after the other, each with the version the last one left
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  function withLatest(run: (latest: Shop) => Promise<Shop>) {
    const next = queue.current
      .catch(() => undefined)
      .then(async () => {
        const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
        try {
          qc.setQueryData(shopKeys.mine, await run(latest))
        } catch (e) {
          if (isApiError(e, 'SHOP_CHANGED')) await qc.invalidateQueries({ queryKey: shopKeys.mine })
          throw e
        }
      })
    queue.current = next
    return next
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await withLatest((latest) => shopApi.removeRegistrationDoc(latest.version))
      setAsking(false)
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }

  const has = Boolean(shop.registrationDocFileId)
  return (
    <Page
      back={cameFrom(location, '/setup')}
      title="Trade licence"
      leaveWarning={docBusy ? 'The licence is still uploading. Leave anyway? It may not be saved.' : null}
    >
      {!has && <p className="text-sm text-muted">No trade licence added: your salon shows no "Licensed" badge. It stays open for bookings either way.</p>}
      <RegistrationDocCard
        shop={shop}
        save={(type: RegistrationDocType, fileId: string) =>
          withLatest((latest) => shopApi.setRegistrationDoc(latest.version, type, fileId))
        }
        onBusy={setDocBusy}
      />
      {has && (
        <Card className="flex flex-col gap-2">
          {asking ? (
            <>
              <p className="text-sm">
                Remove the trade licence? Customers will no longer see "Licensed" on your salon. Your salon stays open for
                bookings.
              </p>
              <Button variant="danger" busy={busy} disabled={docBusy} onClick={remove}>
                Remove it
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="secondary" disabled={docBusy} onClick={() => setAsking(true)}>
              Remove the trade licence
            </Button>
          )}
        </Card>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
    </Page>
  )
}
