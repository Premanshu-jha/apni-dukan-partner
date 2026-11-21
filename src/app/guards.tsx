import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Loading } from '../components/ui'
import { useShop } from '../api/shop'
import type { ShopRole, ShopType } from '../api/types'
import { forgetReturn, nextAfterSignIn, rememberReturn } from '../features/auth/flow'
import { missingSteps, signedInHereBefore, useSession } from '../store/session'

/** Screens for signed-out people only (sign-in); a signed-in person goes on to the app. */
export function SignedOutOnly() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  if (status === 'starting') return <Loading />
  // Same target as the sign-in step's own navigate, so the two never disagree.
  if (status === 'signedIn' && user) return <Navigate to={nextAfterSignIn(user)} replace />
  return <Outlet />
}

/** The sign-up steps after the phone code: signed in, profile not finished yet. */
export function FinishingProfile() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  if (status === 'starting') return <Loading />
  if (status !== 'signedIn' || !user) return <Navigate to="/signin" replace />
  if (missingSteps(user).length === 0) return <Navigate to={nextAfterSignIn(user)} replace />
  return <Outlet />
}

/**
 * Everything else: signed in with phone, email and name done. The backend needs the same before a shop can be
 * registered (a verified email is how a lost phone number is recovered), and every screen needs a session.
 */
export function SignedIn() {
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  const endedHere = useSession((s) => s.endedHere)
  const location = useLocation()
  const ready = status === 'signedIn' && user !== null && missingSteps(user).length === 0
  useEffect(() => {
    if (ready) forgetReturn()
  }, [ready])
  if (status === 'starting') return <Loading />
  if (status !== 'signedIn' || !user) {
    // A first-time visitor opening the site's address (partner.clozest.in) sees what Clozest offers salons first, with
    // Sign in on it. Anyone who has signed in on this browser before (signed out, session ended, the installed app)
    // goes straight to sign-in, as before. A path saved by an earlier visit is dropped, so sign-in from About ends at
    // the start.
    if (location.pathname === '/' && !endedHere && !signedInHereBefore()) {
      forgetReturn()
      return <Navigate to="/about" replace />
    }
    // Coming from a link: come back here after sign-in. Just signed out here: the next person starts at Home.
    if (!endedHere) rememberReturn(location.pathname + location.search)
    return <Navigate to="/signin" replace />
  }
  const missing = missingSteps(user)
  if (missing.length) {
    rememberReturn(location.pathname + location.search)
    return <Navigate to={`/welcome/${missing[0]}`} replace />
  }
  return <Outlet />
}

/**
 * Screens that need the salon to be past registration: the owner once it is submitted, everyone else once it is
 * approved (helpers and barbers have nothing to do before the field team's visit). Others go back to the start.
 */
export function PastRegistration() {
  const shop = useShop()
  // A kirana's helpers bill from the day it is submitted, as the owner does (the counter works before approval)
  const ok = shop.myRole === 'OWNER' || (shop.type === 'KIRANA' && shop.status === 'PENDING_VISIT')
    ? shop.status !== 'DRAFT'
    : shop.status === 'APPROVED' || shop.status === 'SUSPENDED'
  if (!ok) return <Navigate to="/" replace />
  return <Outlet />
}

/** Registration screens: the owner of a draft only. */
export function DraftOwner() {
  const shop = useShop()
  if (shop.myRole !== 'OWNER' || shop.status !== 'DRAFT') return <Navigate to="/" replace />
  return <Outlet />
}

/** Screens only some roles use (setup for the owner and helpers, the team for the owner). */
export function RoleOnly({ roles }: { roles: ShopRole[] }) {
  const shop = useShop()
  if (!roles.includes(shop.myRole)) return <Navigate to="/" replace />
  return <Outlet />
}

/**
 * Screens for one kind of shop: a kirana's people never open a salon screen (its calls would only answer 409
 * NOT_A_SALON) and a salon's never a kirana one. Anyone else goes home, which knows where they belong.
 */
export function KindOnly({ kind }: { kind: ShopType }) {
  const shop = useShop()
  if (shop.type !== kind) return <Navigate to="/" replace />
  return <Outlet />
}
