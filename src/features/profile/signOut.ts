import type { QueryClient } from '@tanstack/react-query'
import { authApi } from '../../api/auth'
import { refreshSettled } from '../../api/client'
import { closeShownNotifications, turnOffPush } from '../../api/push'
import { forgetRegisterDraft } from '../../lib/registerDraft'
import { forgetReturn } from '../auth/flow'
import { forgetHelpDrafts } from '../help/drafts'
import { useSession } from '../../store/session'

/** Ends the session on this browser: stops notifications here, tells the backend, forgets everything local. */
export async function signOutHere(qc: QueryClient, opts: { everywhere?: boolean; skipBackend?: boolean } = {}) {
  // A refresh on its way would replace the token we are about to sign out: let it finish first.
  await refreshSettled()
  if (!opts.everywhere) await turnOffPush()
  const { refreshToken, signOut } = useSession.getState()
  if (!opts.skipBackend) {
    if (opts.everywhere) {
      // Must reach the backend (a lost phone): a failure is thrown and this device stays signed in to retry
      await authApi.logoutAll()
    } else if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {
        /* signed out here anyway; the token expires on its own */
      })
    }
  }
  if (opts.everywhere) await turnOffPush()
  signOut()
  forgetThisPerson(qc)
}

/**
 * Forgets everything this browser holds about the person who was signed in, so the next person on a shared phone
 * sees none of it: cached shop and day data, where they were going, an unsaved registration, shown notifications.
 * Also run when the session ends elsewhere (another tab, or the backend refusing a refresh).
 */
export function forgetThisPerson(qc: QueryClient) {
  forgetReturn()
  forgetRegisterDraft()
  forgetHelpDrafts()
  void closeShownNotifications()
  qc.clear()
}
