import { NavLink, Outlet } from 'react-router'
import { useShop } from '../api/shop'
import type { ShopType } from '../api/types'
import { useState } from 'react'
import { LANGUAGES, languageChosen, setLanguage, t, useLanguage, useT } from '../i18n'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { announceLanguageChosen } from '../i18n/LanguageToast'
import { can } from '../lib/roles'

/**
 * The bottom bar's tabs for a role: barbers have no Salon tab (setup is for the owner and helpers). A kirana's owner
 * and helpers: the counter, its bills, products and khata book.
 */
export function tabsFor(role: Parameters<typeof can>[0], kind: ShopType = 'SALON') {
  if (kind === 'KIRANA') {
    return [
      { to: '/kirana/counter', label: t('app.tabCounter'), icon: '⊞' },
      { to: '/kirana/bills', label: t('app.tabBills'), icon: '▤' },
      { to: '/kirana/products', label: t('app.tabProducts'), icon: '▣' },
      { to: '/kirana/khata', label: t('app.tabKhata'), icon: '₹' },
      { to: '/more', label: t('app.tabMore'), icon: '☰' },
    ]
  }
  return [
    { to: '/salon/day', label: t('app.tabToday'), icon: '◷' },
    { to: '/salon/bookings', label: t('app.tabBookings'), icon: '▤' },
    ...(can(role).seeSetup ? [{ to: '/setup', label: t('app.tabSalon'), icon: '✂' }] : []),
    { to: '/more', label: t('app.tabMore'), icon: '☰' },
  ]
}

/** The signed-in app: the screen, with the bottom bar. Wide screens get more room for the board. */
export function Shell() {
  // Drawn again when the language changes, so tabsFor's words are in it
  const t = useT()
  const shop = useShop()
  const tabs = tabsFor(shop.myRole, shop.type)
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col md:max-w-3xl">
      <ApprovalBar />
      <LanguageOffer />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <nav
        aria-label={t('app.navMain')}
        className="sticky bottom-0 z-20 grid border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-link' : 'text-muted'}`
            }
          >
            <span aria-hidden className="text-lg leading-none">
              {tab.icon}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/**
 * A salon submitted but not yet approved by the field team: said at the top of every tab and every salon screen past
 * registration, so the board, the walk-in button and the setup screens never look like a live salon's. Gone the
 * moment it is approved. Helpers and barbers of such a salon don't reach these screens (Home's "Waiting for approval").
 */
export function ApprovalBar() {
  const t = useT()
  const shop = useShop()
  if (shop.status !== 'PENDING_VISIT') return null
  return (
    <section
      aria-label={t('app.approvalWaiting')}
      className="border-b-2 border-warn bg-warn/20 px-4 py-3 text-center"
    >
      <p className="font-display text-lg font-bold text-warn">
        <span aria-hidden>⏳ </span>{t('app.approvalWaiting')}
      </p>
      <p className="text-sm text-ink">
        {t(shop.type === 'KIRANA' ? 'app.approvalBodyKirana' : 'app.approvalBody', { name: shop.name })}
      </p>
    </section>
  )
}

/**
 * Sign-in and full-screen steps: no bottom bar. `approvalBar` for the salon's own screens past registration (walk-in,
 * time off, services, hours…), so they too say a salon not approved yet is waiting.
 */
export function Bare({ approvalBar = false }: { approvalBar?: boolean }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {approvalBar && <ApprovalBar />}
      <Outlet />
    </div>
  )
}

/**
 * Someone signed in before languages came (or who never chose one): offered once, at the top of every tab, until they
 * pick a language or keep the one showing (English, or the phone's own language). Later it is under More → Language.
 */
function LanguageOffer() {
  const t = useT()
  const shown = useLanguage()
  const [open, setOpen] = useState(() => !languageChosen())
  if (!open) return null
  // The phone's own language showing (not chosen yet): keeping it is one tap too
  const name = LANGUAGES.find((l) => l.code === shown)?.name ?? ''
  const keep = shown === 'en' ? t('language.keepEnglish') : t('language.keepShown', { name })
  return (
    <div role="region" aria-label={t('language.offerTitle')} className="m-3 rounded-2xl border border-line bg-raised p-3">
      <p className="mb-2 font-medium">{t('language.offerTitle')}</p>
      <LanguagePicker onChosen={() => setOpen(false)} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{t('language.hint')}</p>
        <button
          type="button"
          className="min-h-11 shrink-0 px-2 text-sm text-link underline"
          onClick={() => {
            void setLanguage(shown).then((ok) => ok && announceLanguageChosen())
            setOpen(false)
          }}
        >
          {keep}
        </button>
      </div>
    </div>
  )
}
