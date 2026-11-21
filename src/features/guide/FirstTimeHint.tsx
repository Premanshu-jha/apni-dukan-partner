import { useT } from '../../i18n'
import { useSeen } from './storage'

/** The screens with a first-time hint: each is remembered on its own. */
export type HintScreen = 'bookings' | 'salon' | 'services' | 'barbers' | 'walkIn' | 'offers' | 'hours'

/**
 * One plain line at the top of a screen the first time this account opens it: what the screen is for and its main
 * button. "Got it" hides it for good (on this phone, for this account; another tab hides it too).
 *
 * In the page's flow, never over it: it is drawn with the screen's first paint (the mark is read from the phone, no
 * request), so nothing jumps down after the screen showed, and it covers no button. Hiding it moves the screen up by
 * its own height, which the person asked for. `show` false holds it back (another note is up on that screen), so two
 * notes never stack.
 */
export function FirstTimeHint({ screen, text, show = true }: { screen: HintScreen; text: string; show?: boolean }) {
  const t = useT()
  const [seen, markSeen] = useSeen(`hint.${screen}`)
  if (seen || !show) return null
  return (
    <aside
      aria-label={t('guide.hintLabel')}
      data-testid="first-time-hint"
      className="flex items-start gap-3 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm"
    >
      <InfoIcon />
      <p className="min-w-0 flex-1 py-1.5 break-words">{text}</p>
      <button
        type="button"
        onClick={markSeen}
        className="min-h-11 shrink-0 rounded-lg px-3 font-medium text-link underline hover:bg-raised"
      >
        {t('guide.gotIt')}
      </button>
    </aside>
  )
}

/** A small "i" in a circle: the hint's mark (hidden from screen readers; the label says it). */
export function InfoIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" width="20" height="20" className="mt-1.5 shrink-0 text-link" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5" strokeLinecap="round" />
      <circle cx="10" cy="6.2" r="0.6" fill="currentColor" />
    </svg>
  )
}
