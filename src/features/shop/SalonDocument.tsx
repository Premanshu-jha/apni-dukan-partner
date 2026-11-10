import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { explain, isApiError } from '../../api/errors'
import { shopApi, shopKeys, useShop } from '../../api/shop'
import type { RegistrationDocType, Shop } from '../../api/types'
import { Banner, Button, Card, Page } from '../../components/ui'
import { RegistrationDocCard } from './RegistrationDoc'

/**
 * More → Salon → Registration document (the owner): add, change or remove it at any time. The salon stays live; a new
 * document waits for our field team's check, and customers see "Registered" only once it is checked.
 */
export function SalonDocumentPage() {
  const qc = useQueryClient()
  const shop = useShop()
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
      back="/setup"
      title="Registration document"
      leaveWarning={docBusy ? 'The document is still uploading. Leave anyway? It may not be saved.' : null}
    >
      {has && (
        <Banner tone={shop.registrationDocCheckedAt ? 'good' : 'warn'}>
          {shop.registrationDocCheckedAt
            ? 'Checked by our team: customers see "Registered" on your salon.'
            : 'Waiting for our team to check it: customers see "Unregistered" until then. Your salon stays open for bookings.'}
        </Banner>
      )}
      {!has && <p className="text-sm text-muted">No document added: customers see "Unregistered" on your salon.</p>}
      <RegistrationDocCard
        type={shop.registrationDocType ?? null}
        fileId={shop.registrationDocFileId ?? null}
        save={(type: RegistrationDocType, fileId: string) =>
          withLatest((latest) => shopApi.setRegistrationDoc(latest.version, type, fileId))
        }
        onBusy={setDocBusy}
      />
      {has && (
        <Card className="flex flex-col gap-2">
          {asking ? (
            <>
              <p className="text-sm">Remove the document? Customers will see "Unregistered" on your salon.</p>
              <Button variant="danger" busy={busy} disabled={docBusy} onClick={remove}>
                Remove it
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="secondary" disabled={docBusy} onClick={() => setAsking(true)}>
              Remove the document
            </Button>
          )}
        </Card>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
    </Page>
  )
}
