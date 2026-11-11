/**
 * A phone change whose answer was lost, and the session ended right after (the change went through and ended every
 * old token): the sign-in screen says the number may have moved and fills it in, so the person doesn't sign in with
 * the old number (that would make a new, empty account). Kept in this tab only; read once.
 */
const KEY = 'ad.phoneMovedTo'

export function rememberPhoneMove(phone: string): void {
  try {
    window.sessionStorage.setItem(KEY, phone)
  } catch {
    /* storage blocked: no hint */
  }
}

export function takePhoneMove(): string | null {
  try {
    const phone = window.sessionStorage.getItem(KEY)
    window.sessionStorage.removeItem(KEY)
    return phone
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
