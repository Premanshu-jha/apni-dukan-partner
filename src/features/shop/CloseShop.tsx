import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { refreshSession } from '../../api/client'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useShop } from '../../api/shop'
import { Banner, Button, Page, TextArea } from '../../components/ui'
import { rememberClosed, rememberStartNote, shopChanged } from './ownership'

/** The backend's limits for the reason (ShopOwnershipService.CLOSE_REASON): optional, 2 to 200 characters. */
const REASON_MAX = 200

/**
 * Close the shop for good (owner). Says plainly what happens: every upcoming online booking is cancelled and its
 * customer told; helpers and barbers lose access at once; the owner leaves too; it can't be undone (to come back,
 * register a new shop). Then the session is refreshed (no shop any more) and the start screen opens.
 */
export function CloseShop() {
  const shop = useShop()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const sending = useRef(false)
  const trimmed = reason.trim()
  const reasonProblem = trimmed.length === 1 ? 'Write at least 2 characters, or leave it empty' : trimmed.length > REASON_MAX ? `Keep it under ${REASON_MAX} characters` : undefined

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
      if (isApiError(e, 'NO_SHOP')) rememberStartNote(`You're no longer the owner of ${shop.name}: it was handed over or closed already.`)
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
    ? 'Your shop changed a moment ago (on another phone, or by the field team). It has been read again: check and try again.'
    : isApiError(error, 'NO_SHOP')
      ? "You're no longer the owner of this shop (it was handed over or closed already)."
      : error && !isApiError(error, 'EDIT_LOCKED')   // the code sheet asks for it instead (EditGate)
        ? messageOf(error)
        : null

  return (
    <Page back={shop.status === 'DRAFT' ? '/register' : '/more'} title={`Close ${shop.name}`}>
      <Banner tone="bad">
        <p className="font-semibold">Closing is for good. It can't be undone.</p>
        <ul className="mt-2 list-disc pl-5">
          <li>Every upcoming online booking is cancelled, and each customer is told the salon has closed.</li>
          <li>Your helpers and barbers lose access at once.</li>
          <li>You leave the shop too. Customers can no longer find it.</li>
          <li>To come back later, you register a new shop: a new field visit and a new shop code.</li>
        </ul>
      </Banner>
      <p className="text-sm text-muted">
        Want someone else to run it instead?{' '}
        <Link to="/shop/handover" className="text-link underline">
          Hand over the shop
        </Link>{' '}
        keeps its bookings, team and listing.
      </p>
      <TextArea
        id="close-reason"
        label="Why are you closing? (optional)"
        value={reason}
        maxLength={REASON_MAX + 20}
        onChange={(e) => setReason(e.target.value)}
        hint="Only our team sees this."
        error={reasonProblem ?? fieldError(error, 'reason')}
      />
      <label className="flex min-h-11 items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>I understand that {shop.name} closes for good and its upcoming bookings are cancelled.</span>
      </label>
      {text && <Banner tone="bad">{text}</Banner>}
      <Button variant="danger" busy={busy} disabled={!sure || Boolean(reasonProblem)} onClick={close}>
        Close {shop.name} for good
      </Button>
      <Button variant="secondary" onClick={() => navigate(shop.status === 'DRAFT' ? '/register' : '/more')}>
        Keep my shop
      </Button>
    </Page>
  )
}
