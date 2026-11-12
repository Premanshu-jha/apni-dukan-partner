import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Outlet } from 'react-router'
import { messageOf } from '../../api/errors'
import { ShopContext, shopKeys, useMyShop } from '../../api/shop'
import { Button, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'
import { signOutHere } from '../profile/signOut'

/**
 * Every screen after sign-in goes through here: GET /shops/me decides what this person sees. No shop → the start
 * screen; a kirana → "coming soon" and nothing else (kirana screens are never shown in this app).
 */
export function ShopGate() {
  const shop = useMyShop()
  if (shop.isPending) return <Loading label="Opening your salon…" />
  // A failed re-check keeps the shop it already had (and whatever is on screen); only a first load shows the error.
  if (shop.isError && shop.data === undefined) {
    return (
      <Page title="Clozest Partner">
        <ErrorState message={messageOf(shop.error)} onRetry={() => shop.refetch()} />
      </Page>
    )
  }
  // CLOSED is seen only in the answer to closing (the owner has no shop after it): the same as none
  if (!shop.data || shop.data.status === 'CLOSED') return <Navigate to="/start" replace />
  if (shop.data.type !== 'SALON') return <KiranaSoon />
  return (
    <ShopContext.Provider value={shop.data}>
      <Outlet />
    </ShopContext.Provider>
  )
}

function KiranaSoon() {
  const qc = useQueryClient()
  return (
    <Page title="Clozest Partner">
      <EmptyState
        title="Kirana partners: coming soon"
        body="This app is for salons for now. We'll let you know when kirana shops can use it."
        action={
          <div className="flex flex-col gap-2">
            <Link to={`/help?${new URLSearchParams({ about: 'Kirana partner' })}`} className="text-link underline">
              Write to support
            </Link>
            <p className="text-sm text-muted">
              Or email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <Button variant="ghost" onClick={() => signOutHere(qc)}>
              Sign out
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
