/**
 * The Play Store app's ways in from outside the screens: a tapped notification and a link to partner.clozest.in that
 * Android opened in the app. They can arrive before the router is drawn (the app opened from closed by the tap), so
 * the screen to open waits here until NativeBridge takes it.
 */

let pending: string | null = null
const listeners = new Set<() => void>()

/** Ask for this screen to open (replaces one still waiting: the newest tap wins). */
export function openInApp(path: string) {
  pending = path
  listeners.forEach((l) => l())
}

/** The screen waiting to open, taken once. */
export function takePendingOpen(): string | null {
  const p = pending
  pending = null
  return p
}

export function onOpenRequest(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * The screen a tapped notification opens, by the same rule as the website's service worker (public/sw.js): only this
 * app's own pages (the day board and bookings, shop news, hand-over requests, invitations, a support request), shop
 * news on the start page; anything else (a customer-app page: one account can be a customer too) the day board.
 */
export function notificationTarget(url: string | null): string {
  let target: URL
  try {
    target = new URL(url || '/salon/day', 'https://app.invalid')
  } catch {
    return '/salon/day'
  }
  if (target.origin !== 'https://app.invalid') return '/salon/day'
  const p = target.pathname
  const ours =
    p.startsWith('/salon/') || p.startsWith('/shops/') || p === '/handover' || p === '/invites' || /^\/help\/requests\/[0-9A-Za-z-]{1,64}$/.test(p)
  if (!ours) return '/salon/day'
  return p.startsWith('/shops/') ? '/' : p + target.search + target.hash
}

/**
 * The screen for a link Android opened in the app (https://partner.clozest.in/..., the app's own website): the same
 * path, query and hash. Anything else (another site) opens nothing.
 */
export function linkTarget(url: string, ownHost: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.host !== ownHost) return null
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}
