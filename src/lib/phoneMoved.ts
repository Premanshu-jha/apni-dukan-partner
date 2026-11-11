/**
 * A phone change whose answer was lost, and the session ended right after (the change went through and ended every
 * old token): the sign-in screen says the number may have moved and fills it in, so the person doesn't sign in with
 * the old number (that would make a new, empty account). Kept in this tab only, for 30 minutes; read once.
 */
const KEY = 'ad.phoneMovedTo'
const KEEP_MS = 30 * 60_000

export function rememberPhoneMove(phone: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ phone, at: Date.now() }))
  } catch {
    /* storage blocked: no hint */
  }
}

/** The number the account probably moved to, if a change's answer was lost in the last 30 minutes (then forgotten). */
export function takePhoneMove(): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    window.sessionStorage.removeItem(KEY)
    const kept = raw ? (JSON.parse(raw) as { phone?: string; at?: number }) : null
    return kept?.phone && typeof kept.at === 'number' && Date.now() - kept.at < KEEP_MS ? kept.phone : null
  } catch {
    return null
  }
}

/** A Profile/More notice after a change: shown once, not again on reload or Back. */
let changedTo: string | null = null

export function flashPhoneChanged(phone: string): void {
  changedTo = phone
}

export function takePhoneChanged(): string | null {
  const phone = changedTo
  changedTo = null
  return phone
}
