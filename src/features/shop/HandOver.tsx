import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { shopApi, shopKeys, useMyHandover, useShop } from '../../api/shop'
import { Banner, Button, Card, ErrorState, Field, Loading, Page } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'
import { formatPhone, normalizePhone } from '../../lib/phone'

/**
 * Hand the shop over (owner): name a phone number; the person with it sees the request after signing in and accepts
 * or declines. The backend's answer is the same whether or not the number has an account, and so is what this screen
 * shows. One request waits at a time (Cancel it to ask someone else); it runs out after 7 days.
 */
export function HandOver() {
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
      setSent(answer.message)
      setPhone('')
    })

  const cancel = () =>
    run(async () => {
      await shopApi.cancelHandover()
      qc.setQueryData(shopKeys.handover, null)
      setSent(null)
    })

  const phoneProblem = isApiError(error, 'INVALID_PHONE')
    ? 'Enter a 10-digit Indian mobile number'
    : fieldError(error, 'phone') === 'is your own number'
      ? "That's your own number. Enter the number of the person who'll take over."
      : fieldError(error, 'phone')
  const text = phoneProblem
    ? null
    : isApiError(error, 'SHOP_CHANGED')
      ? 'Your shop changed a moment ago. It has been read again: send the request again.'
      : isApiError(error, 'NO_SHOP')
        ? "You're no longer the owner of this shop."
        : error && !isApiError(error, 'EDIT_LOCKED')   // the code sheet asks for it instead (EditGate)
          ? messageOf(error)
          : null

  return (
    <Page back={shop.status === 'DRAFT' ? '/register' : '/more'} title={`Hand over ${shop.name}`}>
      <p className="text-muted">
        Give {shop.name} to someone else, such as a new owner or a family member. They see your request when they sign in to
        Clozest Partner with their number. When they accept, they become the owner and you leave the shop (you're
        signed out of it). Its details, photos, bookings and team stay as they are.
      </p>
      {sent && <Banner tone="info">{sent}</Banner>}
      {pending.isPending ? (
        <Loading />
      ) : pending.isError && pending.data === undefined ? (
        <ErrorState message={messageOf(pending.error)} onRetry={() => pending.refetch()} />
      ) : pending.data ? (
        <Card className="flex flex-col gap-3">
          <p className="font-semibold">Waiting for an answer</p>
          <p>
            You asked <span className="font-semibold">+91 {formatPhone(pending.data.phone)}</span> on{' '}
            {dateTimeIst(pending.data.createdAt)}.
          </p>
          <p className="text-sm text-muted">It runs out on {dateTimeIst(pending.data.expiresAt)} if they don't answer.</p>
          {text && <Banner tone="bad">{text}</Banner>}
          <Button variant="secondary" busy={busy} onClick={cancel}>
            Cancel this request
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <Field
            id="handover-phone"
            label="Their mobile number"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={phoneProblem}
          />
          {text && <Banner tone="bad">{text}</Banner>}
          <Button busy={busy} disabled={!normalized} onClick={send}>
            Send request
          </Button>
        </Card>
      )}
      <p className="text-sm text-muted">
        Closing the shop instead?{' '}
        <Link to="/shop/close" className="text-link underline">
          Close {shop.name}
        </Link>
      </p>
    </Page>
  )
}
