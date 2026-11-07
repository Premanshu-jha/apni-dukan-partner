import type { QueryClient } from '@tanstack/react-query'
import { salonKeys } from '../../api/salon'
import { shopKeys } from '../../api/shop'
import type { Shop } from '../../api/types'

/**
 * After closing a shop or taking one over (the session was refreshed already): the shop gate gets the new answer at
 * once (null: no shop, so the start screen), the salon's data read under the old role is dropped, and everything else
 * is read again with the new token.
 */
export function shopChanged(qc: QueryClient, mine: Shop | null) {
  qc.removeQueries({ queryKey: salonKeys.all })
  qc.setQueryData(shopKeys.mine, mine)
  void qc.invalidateQueries({ predicate: (q) => !(q.queryKey.length === 1 && q.queryKey[0] === shopKeys.mine[0]) })
}

/**
 * A note for the start screen, said once: the name of the shop just closed here, or why this person has no shop now. Kept in memory, not in the address's
 * state: the shop gate also moves to the start when it sees no shop, and that navigation carries no state.
 */
let closedName: string | null = null
let startNote: string | null = null
export function rememberClosed(name: string) {
  closedName = name
}
export function closedNotice(): string | null {
  return closedName
}
/** Why the start screen is shown (e.g. a hand-over accepted first, then closing refused with NO_SHOP). */
export function rememberStartNote(text: string) {
  startNote = text
}
export function startNotice(): string | null {
  return startNote
}
export function forgetClosed() {
  closedName = null
  startNote = null
}

/** Why a hand-over request can't be answered any more (409 HANDOVER_GONE, details.status). */
export function goneText(status: unknown): string {
  switch (status) {
    case 'ACCEPTED':
      return 'This request was already accepted.'
    case 'DECLINED':
      return 'This request was already declined.'
    case 'CANCELLED':
      return 'The owner cancelled this request.'
    case 'EXPIRED':
      return 'This request ran out (requests last 7 days). Ask the owner to send it again.'
    case 'CLOSED':
      return 'The shop has been closed, so it can no longer be handed over.'
    case 'OWNER_CHANGED':
      return 'The shop has a different owner now, so this request no longer stands.'
    default:
      return "This hand-over request isn't open any more."
  }
}
