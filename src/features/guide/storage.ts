import { useCallback, useEffect, useState } from 'react'
import { storage } from '../../lib/storage'
import { useSession } from '../../store/session'

/**
 * What the app remembers about the guide for each account on this phone: which first-time hints and tips were seen,
 * which "Get your salon ready" steps were skipped, and whether "Your salon is ready" was shown. Kept per account (a
 * salon's phone is often shared by the owner, a helper and a barber: each sees their own hints once), and per salon
 * for the setup steps (someone who moves to another salon starts its list afresh). Not forgotten at sign-out: these are
 * only "seen it" marks, nothing private, and the same person signing in again must not be shown them all again.
 *
 * Only on this phone: on a new phone the person sees each hint once more, which is a fair price for no extra request
 * on every screen (thousands of salons, every open of every screen).
 */

/** A hint or the tips: seen once per account. `what` is a short fixed name ("hint.bookings", "tips.OWNER"). */
export const seenKey = (userId: string, what: string) => `adp.guide.${what}.${userId}`
/** The setup steps skipped, per account and salon: a JSON list of step names. */
export const skipsKey = (userId: string, shopId: string) => `adp.guide.skips.${userId}.${shopId}`

export function wasSeen(userId: string, what: string): boolean {
  return storage.get(seenKey(userId, what)) === '1'
}

export function markSeen(userId: string, what: string): void {
  storage.set(seenKey(userId, what), '1')
}

export function skippedSteps(userId: string, shopId: string): string[] {
  const saved = storage.getJson<unknown>(skipsKey(userId, shopId))
  return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === 'string') : []
}

export function skipStep(userId: string, shopId: string, step: string): void {
  const now = skippedSteps(userId, shopId)
  if (!now.includes(step)) storage.setJson(skipsKey(userId, shopId), [...now, step])
}

/** Brings skipped steps back (the person changed his mind): they show on the card again. */
export function unskipSteps(userId: string, shopId: string, steps: readonly string[]): void {
  storage.setJson(
    skipsKey(userId, shopId),
    skippedSteps(userId, shopId).filter((s) => !steps.includes(s)),
  )
}

/**
 * Follows a key that another tab may change (a hint dismissed there goes here too, without a reload). `read` is
 * called again on every storage change of that key; same-tab changes go through the setter this returns.
 */
function useStored<T>(key: string | null, read: () => T): [T, (next: T) => void] {
  const [value, setValue] = useState<{ key: string | null; value: T }>(() => ({ key, value: read() }))
  // Another account signed in on this tab (or the salon changed): read that one's marks
  if (value.key !== key) setValue({ key, value: read() })
  useEffect(() => {
    if (!key) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue({ key, value: read() })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // read follows the key; a new function each draw must not re-attach the listener
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const set = useCallback((next: T) => setValue({ key, value: next }), [key])
  return [value.key === key ? value.value : read(), set]
}

/**
 * Whether the signed-in account saw this hint or the tips, and a way to mark it seen. Signed out (no account): seen,
 * so nothing shows.
 */
export function useSeen(what: string): [boolean, () => void] {
  const userId = useSession((s) => s.user?.id ?? null)
  const [seen, setSeen] = useStored(userId ? seenKey(userId, what) : null, () => (userId ? wasSeen(userId, what) : true))
  const mark = useCallback(() => {
    if (!userId) return
    markSeen(userId, what)
    setSeen(true)
  }, [userId, what, setSeen])
  return [seen, mark]
}

/** The setup steps this account skipped in this salon, a way to skip one, and a way to bring some back. */
export function useSkips(shopId: string): [string[], (step: string) => void, (steps: readonly string[]) => void] {
  const userId = useSession((s) => s.user?.id ?? null)
  const [skips, setSkips] = useStored(userId ? skipsKey(userId, shopId) : null, () => (userId ? skippedSteps(userId, shopId) : []))
  const skip = useCallback(
    (step: string) => {
      if (!userId) return
      skipStep(userId, shopId, step)
      setSkips(skippedSteps(userId, shopId))
    },
    [userId, shopId, setSkips],
  )
  const unskip = useCallback(
    (steps: readonly string[]) => {
      if (!userId) return
      unskipSteps(userId, shopId, steps)
      setSkips(skippedSteps(userId, shopId))
    },
    [userId, shopId, setSkips],
  )
  return [skips, skip, unskip]
}

/**
 * Like useSeen, with a way to take the mark back too (a "seen" that can be undone, such as "notifications brought
 * back on this phone for this account").
 */
export function useMark(what: string): [boolean, (on: boolean) => void] {
  const userId = useSession((s) => s.user?.id ?? null)
  const [on, setOn] = useStored(userId ? seenKey(userId, what) : null, () => (userId ? wasSeen(userId, what) : false))
  const set = useCallback(
    (next: boolean) => {
      if (!userId) return
      if (next) markSeen(userId, what)
      else storage.remove(seenKey(userId, what))
      setOn(next)
    },
    [userId, what, setOn],
  )
  return [on, set]
}
