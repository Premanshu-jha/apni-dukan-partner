import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet } from 'react-router'
import { messageOf } from '../../api/errors'
import { ShopContext, shopKeys, useMyShop } from '../../api/shop'
import { Button, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { kiranaOn, shopTypeOn, SUPPORT_EMAIL } from '../../lib/config'
import { signOutHere } from '../profile/signOut'

/**
 * Every screen after sign-in goes through here: GET /shops/me decides what this person sees. No shop → the start
 * screen. A kirana's people see only kirana screens and a salon's only salon screens (KindOnly in the routes). With the
 * kirana switch off, a kirana (there shouldn't be one: the backend's switch is off too) sees only "Kirana shops aren't
 * on Clozest yet", and nothing of the app behind it.
 */
export function ShopGate() {
  const t = useT()
  const shop = useMyShop()
  if (shop.isPending) return <Loading label={t(kiranaOn() ? 'register.openingShop' : 'register.openingSalon')} />
  // A failed re-check keeps the shop it already had (and whatever is on screen); only a first load shows the error.
  if (shop.isError && shop.data === undefined) {
    return (
      <Page title={t('register.appName')}>
        <ErrorState message={messageOf(shop.error)} onRetry={() => shop.refetch()} />
      </Page>
    )
  }
  // CLOSED is seen only in the answer to closing (the owner has no shop after it): the same as none
  if (!shop.data || shop.data.status === 'CLOSED') return <Navigate to="/start" replace />
  if (!shopTypeOn(shop.data.type)) return <KiranaOff />
  return (
    <ShopContext.Provider value={shop.data}>
      <Outlet />
    </ShopContext.Provider>
  )
}

/** A kirana with the kirana switch off: said plainly, with help and signing out; no other screen, no kirana call. */
function KiranaOff() {
  const qc = useQueryClient()
  const t = useT()
  return (
    <Page title={t('register.appName')}>
      <EmptyState
        title={t('register.kiranaOffTitle')}
        body={t('register.kiranaSoonBody')}
        action={
          <div className="flex flex-col gap-2">
            <Link to={`/help?${new URLSearchParams({ about: t('register.kiranaHelpSubject') })}`} className="text-link underline">
              {t('register.writeToSupport')}
            </Link>
            <p className="text-sm text-muted">
              {t('register.orEmailBefore')}{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <Button variant="ghost" onClick={() => signOutHere(qc)}>
              {t('register.signOut')}
            </Button>
          </div>
        }
      />
    </Page>
  )
}

/** Run after something that changes the shop (approval, joining, leaving): the gate decides again. */
export function useRecheckShop() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: shopKeys.mine })
}
