import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useMyHandover, useShop } from '../../api/shop'
import { Banner, Button, Card, ErrorState, Field, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { formatPhone, normalizePhone } from '../../lib/phone'

/**
 * Hand the shop over (owner): name a phone number; the person with it sees the request after signing in and accepts
 * or declines. The backend's answer is the same whether or not the number has an account, and so is what this screen
 * shows. One request waits at a time (Cancel it to ask someone else); it runs out after 7 days.
 */
export function HandOver() {
  const t = useT()
  const shop = useShop()
  const qc = useQueryClient()
  const pending = useMyHandover()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [sent, setSent] = useState<string | null>(null)
  const sending = useRef(false)
  const normalized = normalizePhone(phone)

  async function run(work: () => Promise<void>) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e)
      // Someone else's request already waits (another phone of the owner): show it
      if (isApiError(e, 'HANDOVER_PENDING')) void qc.invalidateQueries({ queryKey: shopKeys.handover })
      if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'NO_SHOP') || isApiError(e, 'OWNER_ONLY')) {
        void qc.invalidateQueries({ queryKey: shopKeys.mine })
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const send = () =>
    run(async () => {
      const answer = await shopApi.requestHandover(normalized!, shop.version)
      qc.setQueryData(shopKeys.handover, answer.handover)
      setSent('shop.handoverRequestSent')
      setPhone('')
    })

  const cancel = () =>
    run(async () => {
      await shopApi.cancelHandover()
      qc.setQueryData(shopKeys.handover, null)
      setSent(null)
    })

  const phoneProblem = isApiError(error, 'INVALID_PHONE')
    ? t('shop.handoverPhoneInvalid')
    : isApiError(error, 'VALIDATION_FAILED') && error.details.phone === 'is your own number'
      ? t('shop.handoverPhoneOwn')
      : fieldError(error, 'phone')
  const text = phoneProblem
    ? null
    : isApiError(error, 'SHOP_CHANGED')
      ? t('shop.handoverShopChanged')
      : isApiError(error, 'NO_SHOP')
        ? t('shop.handoverNoLongerOwner')
        : error && !isApiError(error, 'EDIT_LOCKED')   // the code sheet asks for it instead (EditGate)
          ? messageOf(error)
          : null

  return (
    <Page back={shop.status === 'DRAFT' ? '/register' : '/more'} title={t('shop.handoverTitle', { name: shop.name })}>
      <p className="text-muted">
        {t('shop.handoverIntro', { name: shop.name })}
      </p>
      {sent && <Banner tone="info">{t(sent)}</Banner>}
      {pending.isPending ? (
        <Loading />
      ) : pending.isError && pending.data === undefined ? (
        <ErrorState message={messageOf(pending.error)} onRetry={() => pending.refetch()} />
      ) : pending.data ? (
        <Card className="flex flex-col gap-3">
          <p className="font-semibold">{t('shop.handoverWaiting')}</p>
          <p>
            {t('shop.handoverAskedBefore')} <span className="font-semibold">+91 {formatPhone(pending.data.phone)}</span>{' '}
            {t('shop.handoverAskedAfter', { date: dateTimeIst(pending.data.createdAt) })}
          </p>
          <p className="text-sm text-muted">{t('shop.handoverRunsOut', { date: dateTimeIst(pending.data.expiresAt) })}</p>
          {text && <Banner tone="bad">{text}</Banner>}
          <Button variant="secondary" busy={busy} onClick={cancel}>
            {t('shop.handoverCancel')}
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <Field
            id="handover-phone"
            label={t('shop.handoverPhoneLabel')}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={phoneProblem}
          />
          {text && <Banner tone="bad">{text}</Banner>}
          <Button busy={busy} disabled={!normalized} onClick={send}>
            {t('shop.handoverSend')}
          </Button>
        </Card>
      )}
      <p className="text-sm text-muted">
        {t('shop.handoverCloseInstead')}{' '}
        <Link to="/shop/close" className="text-link underline">
          {t('shop.handoverCloseLink', { name: shop.name })}
        </Link>
      </p>
    </Page>
  )
}
