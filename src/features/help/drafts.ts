/**
 * What was typed in Need help and My requests, kept until sent (per person and request). Signing out, or the session
 * ending, forgets all of it: on a shared phone the next person mustn't read it.
 */
export function forgetHelpDrafts() {
  try {
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && (k.startsWith('pd.helpDraft.') || k.startsWith('ad.requestDraft.'))) keys.push(k)
    }
    keys.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* storage blocked: nothing was kept */
  }
}
