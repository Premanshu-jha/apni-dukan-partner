import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Outlet } from 'react-router'
import { messageOf } from '../../api/errors'
import { ShopContext, shopKeys, useMyShop } from '../../api/shop'
import { ErrorState, Loading, Page } from '../../components/ui'

/**
 * Every screen after sign-in goes through here: GET /shops/me decides what this person sees. No shop → the start
 * screen. A kirana's people see only kirana screens and a salon's only salon screens (KindOnly in the routes).
 */
export function ShopGate() {
  const shop = useMyShop()
  if (shop.isPending) return <Loading label="Opening your shop…" />
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
  return (
    <ShopContext.Provider value={shop.data}>
      <Outlet />
    </ShopContext.Provider>
  )
}

/** Run after something that changes the shop (approval, joining, leaving): the gate decides again. */
export function useRecheckShop() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: shopKeys.mine })
}
