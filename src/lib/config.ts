/** The Cloudflare Turnstile site key (public). Empty = no robot check (a local backend without a secret). */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ''

/** Where salon partners write for help. */
export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'support@apnidukan.in'
