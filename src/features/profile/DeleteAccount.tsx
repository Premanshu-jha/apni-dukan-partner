import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { ApiError, messageOf } from '../../api/errors'
import { shopKeys, useMyShop } from '../../api/shop'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Loading, Page } from '../../components/ui'
import { formatPhone } from '../../lib/phone'
import { useSession } from '../../store/session'
import { signOutHere } from './signOut'

/**
 * Delete account, for helpers, barbers and anyone without a shop (e.g. after closing theirs): a code by SMS to their own phone, then delete. The backend refuses an
 * owner (409 SHOP_OWNER: close or hand over the shop first), a booking of theirs starting within the hour or in
 * progress (409 BOOKING_SOON), a booking pause from no-shows (409 BOOKING_BLOCKED); its message is shown as it is.
 */
export function DeleteAccount() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  // Outside the shop gate: someone without a shop deletes their account here too
  const mine = useMyShop()
  const shop = mine.data ?? null
  // Staff of a salon not live yet, and a draft's owner, have no More: back to their own screen
  const back = !shop ? '/start' : shop.status === 'DRAFT' && shop.myRole === 'OWNER' ? '/register' : shop.myRole !== 'OWNER' && shop.status !== 'APPROVED' && shop.status !== 'SUSPENDED' ? '/' : '/more'
  const phone = useSession((s) => s.user?.phone)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function refused(e: unknown) {
    setError(messageOf(e))
    // Made the owner meanwhile: the shop is read again, and this screen says what to do instead
    if (e instanceof ApiError && e.code === 'SHOP_OWNER') void qc.invalidateQueries({ queryKey: shopKeys.mine })
  }

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await authApi.sendDeleteCode()
      setSent(true)
    } catch (e) {
      refused(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await authApi.deleteAccount(code)
      // The backend has already ended every session; just forget everything here.
      await signOutHere(qc, { skipBackend: true })
      navigate('/signin', { replace: true, state: { deleted: true } })
    } catch (e) {
      refused(e)
      setBusy(false)
    }
  }

  if (mine.isPending) return <Loading />

  if (shop?.myRole === 'OWNER') {
    return (
      <Page back={back} title="Delete account">
        <Banner tone="warn">Close or hand over your shop first. Then you can delete your account.</Banner>
        <Link to="/shop/handover" className="flex min-h-12 items-center justify-center rounded-xl border border-line text-brand">
          Hand over {shop.name}
        </Link>
        <Link to="/shop/close" className="flex min-h-12 items-center justify-center rounded-xl border border-line text-bad">
          Close {shop.name}
        </Link>
        <Button variant="secondary" onClick={() => navigate(back)}>
          Back
        </Button>
      </Page>
    )
  }

  return (
    <Page back={back} title="Delete account">
      <Banner tone="warn">
        This can't be undone. {shop ? `You leave ${shop.name}, any` : 'Any'} salon bookings you made as a customer are cancelled, your name,
        phone and email are removed, and you are signed out everywhere.{shop ? ' The salon keeps a record of your past work without your details.' : ''}
      </Banner>
      {!sent ? (
        <Button variant="danger" busy={busy} onClick={send}>
          Send code to +91 {formatPhone(phone)}
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          <CodeInput id="delete-code" label="SMS code" value={code} onChange={setCode} />
          <Button variant="danger" busy={busy} disabled={code.length !== 6} onClick={remove}>
            Delete my account
          </Button>
        </div>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <Button variant="secondary" onClick={() => navigate(back)}>
        Keep my account
      </Button>
    </Page>
  )
}
