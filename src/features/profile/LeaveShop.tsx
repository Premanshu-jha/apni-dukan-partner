import { useQueryClient } from '@tanstack/react-query'
import { useContext, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { messageOf } from '../../api/errors'
import { ShopContext, shopApi } from '../../api/shop'
import type { Shop } from '../../api/types'
import { Button, ErrorBanner, Sheet } from '../../components/ui'
import { useT } from '../../i18n'
import { can } from '../../lib/roles'
import { signOutHere } from './signOut'
import { rememberReturn } from '../auth/flow'

/**
 * "Leave {shop}" for a helper or barber, with its sheet: on More, and wherever More can't be opened yet (the wait for
 * approval, an invitation or a hand-over from another shop). The backend lets them leave at any status. Nothing for
 * the owner (he hands over or closes instead).
 */
export function LeaveShop({ shop: given, then }: { shop?: Shop | null; then?: '/invites' | '/handover' }) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  // The shop gate's shop; outside it (the invitations page), the one given
  const gate = useContext(ShopContext)
  const shop = given ?? gate
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One leave at a time (a double tap would send a second one after the first signed everyone out)
  const sending = useRef(false)
  if (!shop || !can(shop.myRole).leaveShop) return null
  const kirana = shop.type === 'KIRANA'

  async function leave() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await shopApi.leave()
      // Out of the shop: this session's token still names it, so start again with a fresh sign-in. Left to accept
      // another shop's invitation or hand-over: that is where signing in again lands (sign-out forgets the place
      // first, so it is kept after it).
      await signOutHere(qc)
      if (then) rememberReturn(then)
      navigate('/signin', { replace: true })
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
      sending.current = false
    }
  }

  return (
    <>
      <Button variant="ghost" className="text-bad" onClick={() => setLeaving(true)}>
        {t('profile.leaveShop', { name: shop.name })}
      </Button>
      <Sheet open={leaving} busy={busy} title={t('profile.leaveShopTitle', { name: shop.name })} onClose={() => !busy && setLeaving(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t(kirana ? 'profile.leaveShopBodyKirana' : 'profile.leaveShopBody')}</p>
          {/* What happens next, said before it happens */}
          <p className="text-sm font-medium">{t(then ? 'profile.leaveSignsOutInvite' : 'profile.leaveSignsOut')}</p>
          {error && <ErrorBanner message={error} />}
          <Button variant="danger" busy={busy} onClick={leave}>
            {t('profile.leave')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setLeaving(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
