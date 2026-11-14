import { NavLink, Outlet } from 'react-router'
import { useShop } from '../api/shop'
import { can } from '../lib/roles'

/** The bottom bar's tabs for a role: barbers have no Salon tab (setup is for the owner and helpers). */
export function tabsFor(role: Parameters<typeof can>[0]) {
  return [
    { to: '/salon/day', label: 'Today', icon: '◷' },
    { to: '/salon/bookings', label: 'Bookings', icon: '▤' },
    ...(can(role).seeSetup ? [{ to: '/setup', label: 'Salon', icon: '✂' }] : []),
    { to: '/more', label: 'More', icon: '☰' },
  ]
}

/** The signed-in app: the screen, with the bottom bar. Wide screens get more room for the board. */
export function Shell() {
  const tabs = tabsFor(useShop().myRole)
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col md:max-w-3xl">
      <ApprovalBar />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <nav
        aria-label="Main"
        className="sticky bottom-0 z-20 grid border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-link' : 'text-muted'}`
            }
          >
            <span aria-hidden className="text-lg leading-none">
              {t.icon}
            </span>
            {t.label}
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
  const shop = useShop()
  if (shop.status !== 'PENDING_VISIT') return null
  return (
    <section
      aria-label="Waiting for approval"
      className="border-b-2 border-warn bg-warn/20 px-4 py-3 text-center"
    >
      <p className="font-display text-lg font-bold text-warn">
        <span aria-hidden>⏳ </span>Waiting for approval
      </p>
      <p className="text-sm text-ink">Customers can't book {shop.name} until our field team approves it.</p>
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
