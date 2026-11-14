import { Link } from 'react-router'
import { useClosures, useSalonHours, useServices, useSettings, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Page } from '../../components/ui'
import { can } from '../../lib/roles'
import { licenceSummary } from '../shop/RegistrationDoc'

/** The salon's setup: what it offers, who works, and the booking rules. Owner edits; helpers look. */
export function SetupHub() {
  const shop = useShop()
  const services = useServices()
  const staff = useStaff()
  const settings = useSettings()
  const hours = useSalonHours()
  const rights = can(shop.myRole)
  const closures = useClosures(rights.closures)
  const edit = rights.editSetup
  const sub = (q: { isError: boolean }, text: string | null) => (text ?? (q.isError ? "Couldn't load. Open to try again." : '…'))
  const owner = shop.myRole === 'OWNER'
  // What the owner gave at registration: his to change any time (helpers don't see these)
  const salonRows = owner
    ? [
        { to: '/setup/details', title: 'Salon details', sub: `${shop.name} · ${shop.area}` },
        { to: '/setup/photos', title: 'Photos and video', sub: 'Your photo, the shop front and the salon video' },
        {
          to: '/setup/document',
          title: 'Trade licence',
          sub: licenceSummary(shop),
        },
      ]
    : []
  const rows = [
    ...salonRows,
    {
      to: '/setup/services',
      title: 'Services and prices',
      sub: sub(services, services.data ? `${services.data.filter((s) => s.active).length} on offer` : null),
    },
    {
      to: '/setup/hours',
      title: 'Opening hours',
      sub: sub(hours, hours.data ? (hours.data.days.length ? `Open ${hours.data.days.length} days a week` : 'Not set yet') : null),
    },
    // Next to the opening hours, where an owner looks for a holiday (also in More)
    ...(rights.closures
      ? [
          {
            to: '/salon/closures',
            title: 'Closed days',
            sub: sub(closures, closures.data ? (closures.data.length ? `Festival holidays: ${closures.data.length} set` : "Festival holidays: none set") : null),
          },
        ]
      : []),
    { to: '/setup/staff', title: 'Barbers', sub: sub(staff, staff.data ? `${staff.data.filter((s) => s.active).length} working` : null) },
    // Next to the services and prices they are about (also in More)
    { to: '/salon/offers', title: 'Offers', sub: 'Discounts customers see on your services' },
    { to: '/salon/ratings', title: 'Ratings', sub: 'What customers said after their visit' },
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
