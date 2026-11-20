import { storage } from '../lib/storage'
import { isLang, unsyncedKey, type Lang } from './index'

/**
 * Saving the account's language on the account (PATCH /me {"language"}), so its messages come in it. Fire and
 * forget: the choice waits on the phone until the backend has it, and is sent again at the next start if it failed.
 * One call at a time per account (tapping through the languages sends the first and then only the last), never a
 * storm. While it waits, it is the account's language on this phone (over the one /me says: see setAccount).
 */

/** Sends one account's language; resolves when the backend has it, rejects to try again at the next start. */
export type SendLanguage = (userId: string, lang: Lang) => Promise<unknown>

/** Each account's call on its way: resolves false when it failed (then nothing more is sent until the next start). */
const running = new Map<string, Promise<boolean>>()

/** Saves this language for the account, now if possible. */
export function syncLanguage(userId: string, lang: Lang, send: SendLanguage): Promise<void> {
  storage.set(unsyncedKey(userId), lang)
  return retryLanguageSync(userId, send)
}

/** Sends the account's language if it is still waiting on this phone (at start-up, after a failure). */
export function retryLanguageSync(userId: string, send: SendLanguage): Promise<void> {
  const busy = running.get(userId)
  // The call on its way sends the newest choice after it; one chosen just as it finished goes next. On a failure,
  // the next start sends it.
  if (busy) return busy.then((ok) => (ok && languageUnsynced(userId) ? retryLanguageSync(userId, send) : undefined))
  const run = (async (): Promise<boolean> => {
    // A newer choice made while one was on its way is sent after it, the newest only
    for (;;) {
      const lang = storage.get(unsyncedKey(userId))
      if (!isLang(lang)) {
        storage.remove(unsyncedKey(userId))
        return true
      }
      try {
        await send(userId, lang)
      } catch {
        return false // kept: sent again at the next start
      }
      if (storage.get(unsyncedKey(userId)) === lang) {
        storage.remove(unsyncedKey(userId))
        return true
      }
    }
  })().finally(() => running.delete(userId))
  running.set(userId, run)
  return run.then(() => undefined)
}

/** Whether this account's language still waits to be saved on it. */
export function languageUnsynced(userId: string): Lang | null {
  const lang = storage.get(unsyncedKey(userId))
  return isLang(lang) ? lang : null
}
