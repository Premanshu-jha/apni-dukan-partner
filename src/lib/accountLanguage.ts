import { authApi } from '../api/auth'
import { ApiError } from '../api/errors'
import { onAccountLanguage, setAccount } from '../i18n'
import { retryLanguageSync, syncLanguage, type SendLanguage } from '../i18n/sync'
import { useSession } from '../store/session'

/**
 * PATCH /me {"language"} for the account signed in now. Never for an account that has signed out since (its call
 * would go with the next person's token): that one is sent when it signs in here again. A refused language (400) is
 * dropped; anything else is tried again at the next start.
 */
const send: SendLanguage = async (userId, lang) => {
  if (useSession.getState().user?.id !== userId) throw new Error('signed out')
  try {
    const user = await authApi.saveLanguage(lang)
    const session = useSession.getState()
    if (session.user?.id === user.id) session.setUser({ ...session.user, ...user })
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) return
    throw e
  }
}

/**
 * Each account keeps its own language on a shared phone, and has it saved on the account (its messages come in it):
 * follows sign-ins and sign-outs, and sends a choice still waiting from an earlier start.
 */
export function followAccountLanguage(): void {
  onAccountLanguage((userId, lang) => void syncLanguage(userId, lang, send))
  const apply = (status: string, user: { id: string; language?: string | null } | null) => {
    if (status === 'signedIn' && user) {
      void setAccount(user.id, user.language ?? null).then(() => retryLanguageSync(user.id, send))
    } else if (status === 'signedOut') {
      void setAccount(null)
    }
  }
  useSession.subscribe((now, before) => {
    if (now.status !== before.status || now.user?.id !== before.user?.id) apply(now.status, now.user)
  })
  const s = useSession.getState()
  apply(s.status, s.user)
}
