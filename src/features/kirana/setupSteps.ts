import type { ListLine, PhotoNeeded, SetupView } from '../../api/kiranaSetup'

/**
 * The product setup's plain rules, kept apart from its screens so they are tested on their own: what to offer next (one
 * big button), how far the owner has come ("37 of 412"), a new product's name from a line, and the words for a code.
 */

/** The one thing to do next, as the setup card's big button: where it goes and the number it shows. */
export type NextAction =
  | { kind: 'photographList'; to: string }
  | { kind: 'checkLines'; to: string; left: number }
  | { kind: 'reading'; to: string; pages: number }
  | { kind: 'retakePages'; to: string; pages: number; readId: string | null }
  | { kind: 'count'; to: string; left: number }
  | { kind: 'photos'; to: string; left: number }
  | { kind: 'wait'; to: string; checking: number }
  | { kind: 'finish'; to: string }
  | { kind: 'askOwner'; to: string }
  | { kind: 'done'; to: string }

export const SETUP = '/kirana/setup'

/** Products still needing a photo that the shop can take now (not being checked, not a picture still being looked for). */
export function photosToTake(v: SetupView): number {
  return Math.max(0, v.photosMissing - v.photosChecking - v.photosFinding)
}

/** What the setup card offers next, from the backend's nextStep (the backend decides; the app only words it). */
export function nextAction(v: SetupView, owner: boolean): NextAction {
  switch (v.nextStep) {
    case 'ADD':
    case 'LIST':
      if (v.linesToCheck > 0) return { kind: 'checkLines', to: `${SETUP}/lines`, left: v.linesToCheck }
      // No products yet but pages that couldn't be read (the backend says ADD): taking them again comes first
      if (v.pagesFailed > 0) {
        const failed = v.pages.find((p) => p.status === 'FAILED')
        return { kind: 'retakePages', to: failed ? `${SETUP}/list?retake=${encodeURIComponent(failed.readId)}` : SETUP, pages: v.pagesFailed, readId: failed?.readId ?? null }
      }
      if (v.nextStep === 'ADD' && v.pagesReading === 0) return { kind: 'photographList', to: `${SETUP}/list` }
      return { kind: 'reading', to: SETUP, pages: v.pagesReading }
    case 'COUNT':
      return { kind: 'count', to: `${SETUP}/count`, left: v.uncounted }
    case 'PHOTOS':
      return { kind: 'photos', to: `${SETUP}/photos`, left: photosToTake(v) }
    case 'WAIT':
      return { kind: 'wait', to: `${SETUP}/photos`, checking: v.photosChecking + v.photosFinding }
    case 'FINISH':
      return owner ? { kind: 'finish', to: SETUP } : { kind: 'askOwner', to: SETUP }
    default:
      return { kind: 'done', to: SETUP }
  }
}

/** Whether the setup still has something for the shop to do (the card on the counter can't be hidden until then). */
export function setupOpen(v: SetupView): boolean {
  return v.nextStep !== 'DONE'
}

/** Lines of the list decided out of all read so far: "37 of 412", "375 left". `at` is the line being looked at now. */
export function lineProgress(v: Pick<SetupView, 'linesToCheck' | 'linesAdded' | 'linesSkipped'>): { at: number; total: number; left: number; done: number } {
  const done = v.linesAdded + v.linesSkipped
  const total = done + v.linesToCheck
  return { at: Math.min(total, done + 1), total, left: v.linesToCheck, done }
}

/** A percentage for the progress bar (0 to 100, whole). */
export function percent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((done * 100) / total)))
}

/** The name a new product gets from a line, as the backend gives it: brand, name and size as read, else the wording. */
export function lineProductName(l: Pick<ListLine, 'wording' | 'brand' | 'name' | 'size'>): string {
  if (!l.name) return l.wording.slice(0, 100).trim()
  const parts: string[] = []
  if (l.brand && !l.name.toLowerCase().includes(l.brand.toLowerCase())) parts.push(l.brand)
  parts.push(l.name)
  if (l.size) parts.push(l.size)
  return parts.join(' ').slice(0, 100).trim()
}

/** The order the photos are taken in: ones to take or retake first, then pictures still being looked for; never one being checked. */
export function photoQueue(items: PhotoNeeded[], skipped: ReadonlySet<string>, sent: ReadonlySet<string>): PhotoNeeded[] {
  const open = items.filter((p) => p.photoCheck !== 'CHECKING' && !sent.has(p.productId) && !skipped.has(p.productId))
  return [...open.filter((p) => !p.findingPicture), ...open.filter((p) => p.findingPicture)]
}

/** The words for why a page of the list couldn't be read (ReadFailure's code): a key of kiranaSetup, or null for the backend's own. */
export function pageFailureKey(code: string | null | undefined): string | null {
  const known = ['NOT_A_LIST', 'LIST_UNREADABLE', 'CANT_OPEN', 'TOO_LARGE', 'FILE_PASSWORD', 'FILE_CANT_OPEN', 'TOO_LONG', 'TRY_LATER', 'READING_OFF', 'PHOTO_UNREADABLE']
  return code && known.includes(code) ? `kiranaSetup.fail_${code}` : null
}

/** The words for why a product's photo was refused (PhotoRules' code): a key of kiranaSetup, or null. */
export function photoRefusalKey(code: string | null | undefined): string | null {
  const known = ['NOT_GOODS', 'PEOPLE', 'MANY', 'BLURRY', 'OTHER_PRODUCT', 'NOT_FRONT', 'NEED_SIZE', 'SIZE_UNREADABLE', 'WRONG_SIZE', 'PRODUCT_UNCLEAR', 'LABEL_UNREADABLE']
  return code && known.includes(code) ? `kiranaSetup.photo_${code}` : null
}

/**
 * WhatsApp with a message typed in, for a helper to send the owner (the app doesn't know the owner's number for a
 * helper: WhatsApp asks whom to send it to). Nothing is sent by the app.
 */
export function askOwnerHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/**
 * A made-once id for something the phone sends (a page, a photo, a count), kept in this tab until it is settled: tried
 * again after a lost answer, the backend sees the same one and does it once. `forget` once the answer came.
 */
export function onceRef(key: string): { ref: string; forget: () => void } {
  const k = `adp.kiranaRef.${key}`
  let ref: string | null = null
  try {
    ref = sessionStorage.getItem(k)
    if (!ref) {
      ref = crypto.randomUUID()
      sessionStorage.setItem(k, ref)
    }
  } catch {
    ref = ref ?? crypto.randomUUID()
  }
  return {
    ref,
    forget: () => {
      try {
        sessionStorage.removeItem(k)
      } catch {
        /* storage blocked: nothing kept */
      }
    },
  }
}
