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
  const sub = (q: { isError: boolean }, text: string | null) => (text ?? (q.isError ? "Couldn't load. Open to try again." : '…'))
  const rows = [
    {
      to: '/setup/services',
      title: 'Services and prices',
      sub: sub(services, services.data ? `${services.data.filter((s) => s.active).length} on offer` : null),
    },
    { to: '/setup/staff', title: 'Barbers', sub: sub(staff, staff.data ? `${staff.data.filter((s) => s.active).length} working` : null) },
    {
      to: '/setup/rules',
      title: 'Booking rules',
      sub: sub(settings, settings.data ? `${settings.data.minLeadMinutes} min notice · up to ${settings.data.maxDaysAhead} days ahead` : null),
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
