import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Page } from '../../components/ui'
import { OPERATED_BY } from '../../lib/business'
import { screensBehind } from '../../lib/nav'
import { useSession } from '../../store/session'
import { useT } from '../../i18n'

/** The public pages, in the order the footer lists them (each with its label's language key). Open to everyone: no sign-in needed. */
const LEGAL_LINKS = [
  { to: '/about', label: 'misc.legalAbout' },
  { to: '/contact', label: 'misc.legalContact' },
  { to: '/terms', label: 'misc.legalTerms' },
  { to: '/privacy', label: 'misc.legalPrivacy' },
  { to: '/refunds', label: 'misc.legalRefunds' },
  { to: '/delivery', label: 'misc.legalDelivery' },
] as const

/** A row of links to the public pages (on sign-in, More and every public page). */
export function LegalLinks({ current }: { current?: string }) {
  const t = useT()
  return (
    <nav aria-label={t('misc.legalNavAria')} className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
      {LEGAL_LINKS.map((l) =>
        l.to === current ? (
          <span key={l.to} aria-current="page" className="text-muted">
            {t(l.label)}
          </span>
        ) : (
          <Link key={l.to} to={l.to} className="text-link underline">
            {t(l.label)}
          </Link>
        ),
      )}
    </nav>
  )
}

/** A heading and its paragraphs inside a public page. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
        {children}
      </div>
    </section>
  )
}

/**
 * The frame of every public page: title, back (to the screen that opened it, or Home / About when opened from a link),
 * the "operated by" line, an optional "last updated" date, and the links to the other pages at the bottom.
 */
export function LegalPage({
  path,
  title,
  updated,
  children,
}: {
  path: string
  title: string
  updated?: string
  children: ReactNode
}) {
  // Back: to the screen that opened this one. Opened from a link: Home when signed in, otherwise the front page
  // (About), not sign-in (Razorpay's reviewer may be reading). About itself, opened first, has no Back.
  // While the session is still starting, `/` too: its guard sends each person to the right place once it is known.
  const t = useT()
  const signedOut = useSession((s) => s.status === 'signedOut')
  const back = screensBehind() > 0 ? true : !signedOut ? '/' : path === '/about' ? undefined : '/about'
  return (
    <Page title={title} back={back} backReplace>
      <article className="flex flex-col gap-5">
        {updated && <p className="text-xs text-muted">{t('misc.legalUpdated', { date: updated })}</p>}
        {children}
        <p className="text-sm text-muted">{OPERATED_BY}</p>
      </article>
      <div className="mt-auto border-t border-line pt-4">
        <LegalLinks current={path} />
      </div>
    </Page>
  )
}
