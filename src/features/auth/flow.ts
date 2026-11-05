import type { User } from '../../api/types'
import { missingSteps } from '../../store/session'
import { storage } from '../../lib/storage'

const RETURN_KEY = 'adp.returnTo'

/** Remember where the person was going, so sign-in can bring them back there. */
export function rememberReturn(path: string) {
  if (path.startsWith('/signin') || path.startsWith('/welcome')) return
  storage.set(RETURN_KEY, path)
}

/** Forget the saved place once the person has arrived in the app. */
export function forgetReturn() {
  storage.remove(RETURN_KEY)
}

/** Where to go after a sign-in step: the next missing profile step, else back to where they started. */
export function nextAfterSignIn(user: User): string {
  const missing = missingSteps(user)
  if (missing[0] === 'email') return '/welcome/email'
  if (missing[0] === 'name') return '/welcome/name'
  const back = storage.get(RETURN_KEY)
  return back && back.startsWith('/') && !back.startsWith('//') ? back : '/'
}
