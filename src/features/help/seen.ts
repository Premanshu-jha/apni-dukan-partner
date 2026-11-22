import { create } from 'zustand'
import type { MyRequest } from '../../api/types'
import { storage } from '../../lib/storage'

/**
 * Which of support's replies this person has already read, so the Help button's "Support replied" dot goes away once
 * they open the request (its status stays "We replied" until they answer or it's resolved: a dot that never went
 * away would soon be ignored). Per person on this phone: request id → the last message time they saw. Only ids and
 * times, nothing of what was written. Times are compared, never matched: opening a newer reply (from a message, while
 * the cached list is older) marks it read, and an older list arriving later never brings the dot back.
 */
const seenKey = (userId: string) => `pd.helpSeen.${userId}`

interface SeenState {
  userId: string | null
  seen: Record<string, string>
  /** Reads this person's list (once per person; a new sign-in on a shared phone reads theirs). */
  load: (userId: string) => void
  /** The request was opened with this last message time. */
  mark: (userId: string, id: string, lastMessageAt: string) => void
}

export const useHelpSeen = create<SeenState>((set, get) => ({
  userId: null,
  seen: {},
  load: (userId) => {
    if (get().userId === userId) return
    set({ userId, seen: storage.getJson<Record<string, string>>(seenKey(userId)) ?? {} })
  },
  mark: (userId, id, lastMessageAt) => {
    get().load(userId)
    const before = get().seen[id]
    // Only ever forward: a list read before the request was opened mustn't take the mark back
    if (before && !(Date.parse(lastMessageAt) > Date.parse(before))) return
    // Only the latest 30 requests ever come in the list: keep the newest 50 marks so this never grows without end
    const next = Object.fromEntries(
      Object.entries({ ...get().seen, [id]: lastMessageAt })
        .sort((a, b) => b[1].localeCompare(a[1]))
        .slice(0, 50),
    )
    storage.setJson(seenKey(userId), next)
    set({ seen: next })
  },
}))

/**
 * When support last wrote on a request: lastReplyAt, whatever the status (a reply that resolves it counts); from a
 * backend without it, the last message while it waits on them.
 */
export function replyAt(r: MyRequest): string | null {
  if (r.lastReplyAt !== undefined) return r.lastReplyAt
  return r.status === 'WAITING' ? r.lastMessageAt : null
}

/** Support replied after this person last opened the request (on this phone). */
export function unreadReplies(list: MyRequest[] | undefined, seen: Record<string, string>): MyRequest[] {
  return (list ?? []).filter((r) => {
    const at = replyAt(r)
    if (!at) return false
    const opened = seen[r.id]
    return !opened || Date.parse(at) > Date.parse(opened)
  })
}
