import { useContext, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { useRequestsForBadge } from '../../api/help'
import { ShopContext } from '../../api/shop'
import { useT } from '../../i18n'
import { missingSteps, useSession } from '../../store/session'
import { helpHref, isHelpPage, isKiranaScreen, shopKindHere, topicFor } from './links'
import { unreadReplies, useHelpSeen } from './seen'

/** A question mark in a circle: help, without reading. */
export function HelpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.4-2.6 4" />
      <circle cx="12" cy="17.4" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * "Help" at the top right of every screen (Page puts it there): the help page with this screen's answers first and
 * a question about this screen one tap away. Signed out (or the profile not finished), /help can't open: Contact
 * instead, which anyone can read. Not on the help pages themselves, and not on a kirana's screens.
 *
 * A dot on it says support replied to one of this person's requests and they haven't opened it since. It comes from
 * the same cached list as My requests (one request when the app opens, again only on coming back to the app), so
 * thousands of salons moving between screens never ask for it again.
 */
export function HelpButton({ topic, leaveWarning }: { topic?: string; leaveWarning?: string | null }) {
  const t = useT()
  const location = useLocation()
  const status = useSession((s) => s.status)
  const user = useSession((s) => s.user)
  const shop = useContext(ShopContext)
  // A kirana registering has no shop yet on step 1: what was picked says it is a kirana's screen
  const kind = shopKindHere(location.pathname, shop?.type, user?.id)
  if (isHelpPage(location.pathname) || isKiranaScreen(location.pathname, kind)) return null
  const ready = status === 'signedIn' && user !== null && missingSteps(user).length === 0
  const to = ready
    ? helpHref({ from: location.pathname + location.search, topic: topic ?? topicFor(location.pathname) ?? undefined })
    : '/contact'
  return (
    <Link
      to={to}
      onClick={(e) => {
        // The same question the screen's back arrow asks (an upload under way, changes not saved)
        if (leaveWarning && !window.confirm(leaveWarning)) e.preventDefault()
      }}
      className="relative ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-link hover:bg-raised"
    >
      <HelpIcon />
      {t('help.button')}
      {ready && user && <RepliedDot userId={user.id} />}
    </Link>
  )
}

/**
 * "Help" inside a form sheet (New service, New barber, editing one), which covers the screen's own Help at the top
 * right: the same help page, about this screen, and back here after. Something typed in the sheet: it asks first,
 * with the same question as leaving the screen (the sheet and what was typed in it go when the help page opens).
 */
export function SheetHelpLink({ dirty }: { dirty: boolean }) {
  const t = useT()
  const location = useLocation()
  const to = helpHref({ from: location.pathname + location.search, topic: topicFor(location.pathname) ?? undefined })
  return (
    <Link
      to={to}
      onClick={(e) => {
        if (dirty && !window.confirm(t('help.leaveUnsaved'))) e.preventDefault()
      }}
      className="inline-flex min-h-11 items-center gap-1.5 self-end px-1 text-sm text-link underline"
    >
      <HelpIcon />
      {t('help.button')}
    </Link>
  )
}

/**
 * Where a screen's own "Write to us" / "Ask us" link goes: straight to the form (not the answers first: the person has
 * already said they want to write), about this screen, and back here after sending.
 */
export function useWriteToUsHref(): string {
  const location = useLocation()
  const shop = useContext(ShopContext)
  const userId = useSession((s) => s.user?.id)
  const kind = shopKindHere(location.pathname, shop?.type, userId)
  return helpHref({ write: true, from: location.pathname + location.search, topic: topicFor(location.pathname, kind) ?? undefined })
}

function RepliedDot({ userId }: { userId: string }) {
  const t = useT()
  const list = useRequestsForBadge(true)
  const seen = useHelpSeen((s) => s.seen)
  const seenFor = useHelpSeen((s) => s.userId)
  const load = useHelpSeen((s) => s.load)
  useEffect(() => load(userId), [load, userId])
  // Until this person's marks are read (the first draw), no dot: never one for a reply they already opened
  if (seenFor !== userId) return null
  if (unreadReplies(list.data, seen).length === 0) return null
  return (
    <>
      <span aria-hidden="true" data-testid="help-replied-dot" className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg bg-accent" />
      <span className="sr-only">{`(${t('help.supportReplied')})`}</span>
    </>
  )
}
