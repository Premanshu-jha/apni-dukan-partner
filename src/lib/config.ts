/** The Cloudflare Turnstile site key (public). Empty = no robot check (a local backend without a secret). */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ''

/** Where salon partners write for help. */
export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@clozest.in'

/**
 * The kirana switch (build-time, off by default): 'true' turns on everything for kiranas (choosing a kirana at
 * registration, the counter, bills, products, khata, licences, UPI ID). Off, the app is the salon app: no kirana screen,
 * route, tab or call. It must match the backend's KIRANA_ENABLED (off, its kirana paths answer 404 KIRANA_OFF).
 */
export const KIRANA_ENABLED = import.meta.env.VITE_KIRANA_ENABLED === 'true'

/** Whether the kirana side of the app is on (see {@link KIRANA_ENABLED}): the one question every gate asks. */
export function kiranaOn(): boolean {
  return KIRANA_ENABLED
}

/** Whether this kind of shop is served by this build: a salon always, a kirana only with the switch on. */
export function shopTypeOn(type: string): boolean {
  return type === 'SALON' || (type === 'KIRANA' && kiranaOn())
}

/**
 * A kirana test build of the Play Store app (CI's android job on a kirana… branch, scripts/kirana-build.mjs): it shows
 * the "Kirana test build" label (components/TestBuildMark.tsx). False everywhere else.
 */
export const KIRANA_TEST_BUILD = import.meta.env.VITE_KIRANA_TEST_BUILD === 'true'
