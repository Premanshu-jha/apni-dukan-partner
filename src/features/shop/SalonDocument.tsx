import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { explain, isApiError } from '../../api/errors'
import { shopApi, shopKeys, useShop } from '../../api/shop'
import type { RegistrationDocType, Shop } from '../../api/types'
import { Banner, Button, Card, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { useLocation } from 'react-router'
import { cameFrom } from './Register'
import { RegistrationDocCard } from './RegistrationDoc'

/**
 * The Salon tab → Trade licence (the owner): add, change or remove it at any time. The salon stays live; a new licence
 * is checked automatically, and customers see "Licensed" once it passed (until its last valid day).
 */
export function SalonDocumentPage() {
  const t = useT()
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
      title={t('shop.licencePageTitle')}
      leaveWarning={docBusy ? t('shop.licenceLeaveWarning') : null}
    >
      {!has && <p className="text-sm text-muted">{t('shop.licenceNoneNote')}</p>}
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
                {t('shop.licenceRemoveAsk')}
              </p>
              <Button variant="danger" busy={busy} disabled={docBusy} onClick={remove}>
                {t('shop.licenceRemoveIt')}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
                {t('shop.licenceKeepIt')}
              </Button>
            </>
          ) : (
            <Button variant="secondary" disabled={docBusy} onClick={() => setAsking(true)}>
              {t('shop.licenceRemove')}
            </Button>
          )}
        </Card>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
    </Page>
  )
}
