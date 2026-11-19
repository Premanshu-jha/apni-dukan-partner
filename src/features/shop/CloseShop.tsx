import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { refreshSession } from '../../api/client'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useShop } from '../../api/shop'
import { Banner, Button, Page, TextArea } from '../../components/ui'
import { useT } from '../../i18n'
import { rememberClosed, rememberStartNote, shopChanged } from './ownership'

/** The backend's limits for the reason (ShopOwnershipService.CLOSE_REASON): optional, 2 to 200 characters. */
const REASON_MAX = 200

/**
 * Close the shop for good (owner). Says plainly what happens: every upcoming online booking is cancelled and its
 * customer told; helpers and barbers lose access at once; the owner leaves too; it can't be undone (to come back,
 * register a new shop). Then the session is refreshed (no shop any more) and the start screen opens.
 */
export function CloseShop() {
  const t = useT()
  const shop = useShop()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const sending = useRef(false)
  const trimmed = reason.trim()
  const reasonProblem = trimmed.length === 1 ? t('shop.closeReasonTooShort') : trimmed.length > REASON_MAX ? t('shop.closeReasonTooLong', { max: REASON_MAX }) : undefined

  async function close() {
    if (sending.current || !sure || reasonProblem) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const closed = await shopApi.close(shop.version, trimmed || null)
      // The owner keeps the session but has no shop now: a fresh token without it
      await refreshSession()
      rememberClosed(closed.name)
      navigate('/start', { replace: true })
      shopChanged(qc, null)
    } catch (e) {
      setError(e)
      // Not the owner any more (a hand-over accepted, or closed on another phone): the gate moves to Start, which says so
      if (isApiError(e, 'NO_SHOP')) rememberStartNote(t('shop.noLongerOwnerOfNamed', { name: shop.name }))
      // The shop changed meanwhile (an edit, a hand-over accepted, closed from another phone): read it again; the
      // gate moves on if it is no longer this person's
      if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'NO_SHOP') || isApiError(e, 'OWNER_ONLY')) {
        void qc.invalidateQueries({ queryKey: shopKeys.mine })
      }
      setBusy(false)
    } finally {
      sending.current = false
    }
  }

  const text = isApiError(error, 'SHOP_CHANGED')
    ? t('shop.closeShopChanged')
    : isApiError(error, 'NO_SHOP')
      ? t('shop.closeNoLongerOwner')
      : error && !isApiError(error, 'EDIT_LOCKED')   // the code sheet asks for it instead (EditGate)
        ? messageOf(error)
        : null

  return (
    <Page back={shop.status === 'DRAFT' ? '/register' : '/more'} title={t('shop.closeTitle', { name: shop.name })}>
      <Banner tone="bad">
        <p className="font-semibold">{t('shop.closeForGoodWarning')}</p>
        <ul className="mt-2 list-disc pl-5">
          <li>{t('shop.closeEffectBookings')}</li>
          <li>{t('shop.closeEffectTeam')}</li>
          <li>{t('shop.closeEffectYou')}</li>
          <li>{t('shop.closeEffectComeBack')}</li>
        </ul>
      </Banner>
      <p className="text-sm text-muted">
        {t('shop.closeHandOverBefore')}{' '}
        <Link to="/shop/handover" className="text-link underline">
          {t('shop.closeHandOverLink')}
        </Link>{' '}
        {t('shop.closeHandOverAfter')}
      </p>
      <TextArea
        id="close-reason"
        label={t('shop.closeReasonLabel')}
        value={reason}
        maxLength={REASON_MAX + 20}
        onChange={(e) => setReason(e.target.value)}
        hint={t('shop.closeReasonHint')}
        error={reasonProblem ?? fieldError(error, 'reason')}
      />
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>{t('shop.closeUnderstand', { name: shop.name })}</span>
      </label>
      {text && <Banner tone="bad">{text}</Banner>}
      <Button variant="danger" busy={busy} disabled={!sure || Boolean(reasonProblem)} onClick={close}>
        {t('shop.closeForGoodButton', { name: shop.name })}
      </Button>
      <Button variant="secondary" onClick={() => navigate(shop.status === 'DRAFT' ? '/register' : '/more')}>
        {t('shop.closeKeepShop')}
      </Button>
    </Page>
  )
}
