import { Link } from 'react-router'
import { useServices, useSettings, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Page } from '../../components/ui'
import { can } from '../../lib/roles'

/** The salon's setup: what it offers, who works, and the booking rules. Owner edits; helpers look. */
export function SetupHub() {
  const shop = useShop()
  const services = useServices()
  const staff = useStaff()
  const settings = useSettings()
  const edit = can(shop.myRole).editSetup
  const rows = [
    {
      to: '/setup/services',
      title: 'Services and prices',
      sub: services.data ? `${services.data.filter((s) => s.active).length} on offer` : '…',
    },
    { to: '/setup/staff', title: 'Barbers', sub: staff.data ? `${staff.data.filter((s) => s.active).length} working` : '…' },
    {
      to: '/setup/rules',
      title: 'Booking rules',
      sub: settings.data ? `${settings.data.minLeadMinutes} min notice · up to ${settings.data.maxDaysAhead} days ahead` : '…',
    },
  ]
  return (
    <Page title="Salon">
      {!edit && <p className="text-sm text-muted">Only the owner can change these.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.to}>
            <Link to={r.to} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 hover:bg-raised">
              <span className="flex flex-col">
                <span className="font-semibold">{r.title}</span>
                <span className="text-sm text-muted">{r.sub}</span>
              </span>
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}
