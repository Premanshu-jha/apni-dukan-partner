import { messageScreen, noScreenTarget } from './messageLinks'

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
 * The screen a tapped notification opens, by the same rule as the website's service worker (public/sw.js) and
 * Messages: only this app's own pages (lib/messageLinks.ts: the day board, paying, the screens a fix or a licence
 * message points to, shop news on More, hand-over requests, invitations, a support request, a kirana's licences);
 * anything else (a customer-app page: one account can be a customer too) the start, which says what it was about.
 */
export function notificationTarget(url: string | null, type?: string | null, title?: string | null): string {
  let target: URL
  try {
    target = new URL(url || '/salon/day', 'https://app.invalid')
  } catch {
    return noScreenTarget(title)
  }
  if (target.origin !== 'https://app.invalid') return noScreenTarget(title)
  // No screen of its own here: the start, which says what the message was about
  return messageScreen(target.pathname + target.search + target.hash, type) ?? noScreenTarget(title)
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
