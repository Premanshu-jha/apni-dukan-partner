import { t } from '../../i18n'
import { kiranaOn } from '../../lib/config'
import { loadRegisterKind } from '../../lib/registerDraft'

/**
 * Where Help goes, and what it already knows about why it was opened.
 *
 * /help takes these in its address (other screens may link to them too):
 *   from   the screen Help was opened from (a path in this app): its how-to answers come first, and Done after sending
 *          goes back there
 *   topic  what that screen is about ("Walk-in"): shown on "Write to us", and the subject once they tap it
 *   about  the subject to fill in; with it (or text, or write=1) the message form opens at once
 *   text   the message to start with (an error the screen showed, a booking number)
 *   write  1: open the form at once, even with nothing to fill in
 * Nothing typed by the person is ever replaced by these (NeedHelp keeps a draft and asks).
 */
export interface HelpOpen {
  from?: string
  topic?: string
  about?: string
  text?: string
  write?: boolean
}

export function helpHref(open: HelpOpen = {}): string {
  const q = new URLSearchParams()
  if (open.from) q.set('from', open.from)
  if (open.topic) q.set('topic', open.topic)
  if (open.about) q.set('about', open.about)
  if (open.text) q.set('text', open.text)
  if (open.write) q.set('write', '1')
  const s = q.toString()
  return s ? `/help?${s}` : '/help'
}

/**
 * A path in this app only (never another site): what `from` may send the person back to. Read the way the browser
 * reads it, so `//host`, `/\\host` and `/<tab>/host` (the tab is dropped, leaving `//host`) are all refused; what is
 * kept is the path and query it lands on.
 */
export function safeFrom(from: string | null): string | null {
  if (!from || !from.startsWith('/')) return null
  try {
    const url = new URL(from, window.location.origin)
    if (url.origin !== window.location.origin) return null
    return (url.pathname + url.search).slice(0, 300)
  } catch {
    return null
  }
}

/** The help pages themselves and Contact: no Help button on them (they are help). */
export function isHelpPage(pathname: string): boolean {
  return pathname === '/help' || pathname.startsWith('/help/') || pathname === '/contact'
}

/**
 * The kind of shop a screen is about: the shop's own; on registration before the draft is saved (no shop yet), what
 * this person picked on "What do you run?" (kirana switch on only: off, every registration is a salon's).
 */
export function shopKindHere(pathname: string, shopType: string | undefined, userId: string | undefined): string | undefined {
  if (shopType) return shopType
  if (pathname.startsWith('/register') && kiranaOn()) return loadRegisterKind(userId) ?? undefined
  return undefined
}

/**
 * What a screen is about, in the reader's language, as the subject of a question from it. The screens are found by
 * their address, so every screen gets one without changing it; a screen can still say more (Page's `helpTopic`).
 * Screens not here ("/", More) leave the subject for the person to write.
 */
const TOPICS: Array<[RegExp, string]> = [
  [/^\/salon\/day/, 'help.topicToday'],
  [/^\/salon\/bookings/, 'help.topicBookings'],
  [/^\/salon\/walk-in/, 'help.topicWalkIn'],
  [/^\/salon\/time-off/, 'help.topicTimeOff'],
  [/^\/salon\/closures/, 'help.topicClosures'],
  [/^\/salon\/info/, 'help.topicSalonInfo'],
  [/^\/salon\/offers/, 'help.topicOffers'],
  [/^\/salon\/ratings/, 'help.topicRatings'],
  [/^\/salon\/share/, 'help.topicShare'],
  [/^\/subscription/, 'help.topicSubscription'],
  [/^\/setup\/services/, 'help.topicServices'],
  [/^\/setup\/hours/, 'help.topicHours'],
  [/^\/setup\/staff/, 'help.topicBarbers'],
  [/^\/setup\/rules/, 'help.topicRules'],
  [/^\/setup\/details/, 'help.topicDetails'],
  [/^\/setup\/photos/, 'help.topicPhotos'],
  [/^\/setup\/document/, 'help.topicLicence'],
  [/^\/setup\/address/, 'help.topicAddress'],
  [/^\/setup$/, 'help.topicSetup'],
  [/^\/register\/photos/, 'help.topicRegisterPhotos'],
  [/^\/register\/services/, 'help.topicRegisterServices'],
  [/^\/register\/hours/, 'help.topicRegisterHours'],
  [/^\/register\/review/, 'help.topicRegisterReview'],
  [/^\/register$/, 'help.topicRegisterDetails'],
  [/^\/team/, 'help.topicTeam'],
  [/^\/notifications/, 'help.topicMessages'],
  [/^\/profile\/phone/, 'help.topicPhone'],
  [/^\/profile\/email/, 'help.topicEmail'],
  [/^\/profile\/delete/, 'help.topicDelete'],
  [/^\/shop\/close/, 'help.topicClose'],
  [/^\/shop\/handover/, 'help.topicHandover'],
  [/^\/handover/, 'help.topicTakeOver'],
  [/^\/invites/, 'help.topicInvites'],
  [/^\/start/, 'help.topicStart'],
  // A kirana's screens: their own names, as the bottom bar and More call them
  [/^\/kirana\/setup/, 'help.topicKiranaSetup'],
  [/^\/kirana\/counter/, 'app.tabCounter'],
  [/^\/kirana\/bills/, 'app.tabBills'],
  [/^\/kirana\/products/, 'app.tabProducts'],
  [/^\/kirana\/khata/, 'app.tabKhata'],
  [/^\/kirana\/day/, 'profile.linkKiranaDay'],
  [/^\/kirana\/team/, 'profile.linkKiranaTeam'],
  [/^\/(kirana|register)\/upi/, 'profile.linkKiranaUpi'],
  [/^\/(kirana|register)\/licences/, 'profile.linkKiranaLicences'],
]

export function topicFor(pathname: string, kind?: string): string | null {
  // A kirana registering: its own words for step 1 (a shop's details, not a salon's)
  if (kind === 'KIRANA' && pathname === '/register') return t('help.topicRegisterShop')
  const hit = TOPICS.find(([re]) => re.test(pathname))
  return hit ? t(hit[1]) : null
}

/**
 * Kept until the screens and their tests stop asking it (they do in the next commits): Help shows on kirana screens
 * now (see helpSubject), so nothing hides it any more.
 */
const KIRANA_PATH = /^\/(kirana\/|register\/(licences|upi))/
export function isKiranaScreen(pathname: string, shopType: string | undefined): boolean {
  return shopType === 'KIRANA' || KIRANA_PATH.test(pathname)
}
