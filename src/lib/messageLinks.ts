import { kiranaOn } from './config'

/**
 * The screens a message may open (a tap in Messages, on a web push, or on the Play Store app's push), in one place:
 * Inbox, lib/appEvents.ts and the service worker (public/sw.js, which can't import this and keeps a copy of the same
 * list; sw.test.ts checks the two agree). Only this app's own pages: never another site or a customer-app page.
 *
 * - the day board and the salon's screens (/salon/…), with their query (a booking's day)
 * - the screens the backend's messages point to: paying the subscription (SubscriptionService.PAY_URL), a fix the
 *   field team asked for (/setup), the trade licence (/setup/document, or /register/photos while registering), an
 *   address request (/setup/address), hand-over requests and invitations. A fix asked for opens /setup?fix=1: a
 *   kirana's then opens More (the guard KindOnly; /setup is the salon's tab, and a kirana on it otherwise goes home)
 * - "Support replied": the request it is about
 * - shop news (/shops/me: an invitation accepted, a new owner, approved): More, where the shop card and Team are
 * - with the kirana switch on, a kirana's messages (KIRANA_SCREENS)
 * Anything else is no screen: the app opens the start ("/"), which says what the message was about.
 */
export const MESSAGE_SCREENS: readonly string[] = [
  '/subscription',
  '/setup',
  '/setup/document',
  '/setup/address',
  '/register/photos',
  '/handover',
  '/invites',
]

/**
 * A kirana's messages, kirana switch on only (the same switch serves its routes): the licences (LicenceCheckJob,
 * LicenceExpiryJob: /kirana/licences, /register/licences while registering). The backend's /kirana/online and
 * /kirana/shop-orders/<id> have no screen of their own in this app: the nearest one (KIRANA_NEAREST).
 */
export const KIRANA_SCREENS: readonly string[] = ['/kirana/licences', '/register/licences']

/**
 * /kirana/online: the FSSAI check (KIRANA_FSSAI) → the licences; a payout to the UPI ID that failed
 * (KIRANA_PAYOUT_FAILED) → the UPI ID. /kirana/shop-orders/<id> (an online order) → Bills.
 */
export function kiranaNearest(path: string, type: string | null | undefined): string | null {
  if (path === '/kirana/online') return type === 'KIRANA_PAYOUT_FAILED' ? '/kirana/upi' : '/kirana/licences'
  if (/^\/kirana\/shop-orders\/[0-9A-Za-z-]{1,64}$/.test(path)) return '/kirana/bills'
  return null
}

/** Where a message with no screen opens: the start, which says what it was about (its title). */
export function noScreenTarget(title: string | null | undefined): string {
  const about = (title ?? '').trim().slice(0, 200)
  return about ? `/?message=${encodeURIComponent(about)}` : '/'
}

/** Where "Fix this" (SHOP_FIX_ASKED, url /setup) opens: the Salon tab; a kirana's More (KindOnly reads `fix`). */
export const FIX_SCREEN = '/setup?fix=1'

/** Where shop news opens. */
export const SHOP_NEWS_SCREEN = '/more'

const REQUEST = /^\/help\/requests\/[0-9A-Za-z-]{1,64}$/

/**
 * The screen a message's url opens here, or null when it isn't one of this app's screens. `type` tells a kirana's
 * /kirana/online apart; `kirana` is the kirana switch (lib/config kiranaOn()).
 */
export function messageScreen(url: string | null | undefined, type?: string | null, kirana = kiranaOn()): string | null {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return null
  let target: URL
  try {
    target = new URL(url, 'https://app.invalid')
  } catch {
    return null
  }
  if (target.origin !== 'https://app.invalid') return null
  const p = target.pathname
  // Read as the browser reads it: "/handover/../evil" is not /handover
  if (p !== url.split(/[?#]/)[0]) return null
  if (p.startsWith('/salon/')) return p + target.search + target.hash
  // A fix asked for: marked, so a kirana's (its /setup is the salon's tab) opens More instead (guards KindOnly)
  if (p === '/setup' && !target.search) return FIX_SCREEN
  if (MESSAGE_SCREENS.includes(p)) return p + target.search
  if (REQUEST.test(p)) return p
  if (p.startsWith('/shops/')) return SHOP_NEWS_SCREEN
  if (kirana) {
    if (KIRANA_SCREENS.includes(p)) return p + target.search
    return kiranaNearest(p, type)
  }
  return null
}
