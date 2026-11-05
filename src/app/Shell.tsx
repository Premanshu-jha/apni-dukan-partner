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
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'text-brand' : 'text-muted'}`
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

/** Sign-in and full-screen steps: no bottom bar. */
export function Bare() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <Outlet />
    </div>
  )
}
