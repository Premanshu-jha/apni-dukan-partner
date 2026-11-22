import { Link } from 'react-router'
import { useClosures, useSalonHours, useServices, useSettings, useStaff } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Page } from '../../components/ui'
import { useT } from '../../i18n'
import { can } from '../../lib/roles'
import { licenceSummary } from '../shop/RegistrationDoc'
import { FirstTimeHint } from '../guide/FirstTimeHint'
import { SkippedStepsRow } from '../guide/SkippedStepsRow'

/** The salon's setup: what it offers, who works, and the booking rules. Owner edits; helpers look. */
export function SetupHub() {
  const t = useT()
  const shop = useShop()
  const services = useServices()
  const staff = useStaff()
  const settings = useSettings()
  const hours = useSalonHours()
  const rights = can(shop.myRole)
  const closures = useClosures(rights.closures)
  const edit = rights.editSetup
  const sub = (q: { isError: boolean }, text: string | null) => (text ?? (q.isError ? t('setup.couldntLoadOpen') : '…'))
  const owner = shop.myRole === 'OWNER'
  // What the owner gave at registration: his to change any time (helpers don't see these)
  const salonRows = owner
    ? [
        { to: '/setup/details', title: t('setup.rowDetails'), sub: `${shop.name} · ${shop.area}` },
        { to: '/setup/photos', title: t('setup.rowPhotos'), sub: t('setup.rowPhotosSub') },
        {
          to: '/setup/document',
          title: t('setup.rowLicence'),
          sub: licenceSummary(shop),
        },
      ]
    : []
  const rows = [
    // First: how to bring customers in (also in More)
    { to: '/salon/share', title: t('share.title'), sub: t('share.setupRowSub') },
    ...salonRows,
    {
      to: '/setup/services',
      title: t('setup.servicesTitle'),
      sub: sub(services, services.data ? t('setup.servicesOnOffer', { count: services.data.filter((s) => s.active).length }) : null),
    },
    {
      to: '/setup/hours',
      title: t('setup.hoursTitle'),
      sub: sub(hours, hours.data ? (hours.data.days.length ? t('setup.openDaysAWeek', { count: hours.data.days.length }) : t('setup.notSetYet')) : null),
    },
    // Next to the opening hours, where an owner looks for a holiday (also in More)
    ...(rights.closures
      ? [
          {
            to: '/salon/closures',
            title: t('setup.closedDays'),
            sub: sub(closures, closures.data ? (closures.data.length ? t('setup.holidaysSet', { count: closures.data.length }) : t('setup.holidaysNone')) : null),
          },
        ]
      : []),
    { to: '/setup/staff', title: t('setup.barbersTitle'), sub: sub(staff, staff.data ? t('setup.barbersWorking', { count: staff.data.filter((s) => s.active).length }) : null) },
    // Next to the services and prices they are about (also in More)
    { to: '/salon/offers', title: t('setup.offersTitle'), sub: t('setup.rowOffersSub') },
    { to: '/salon/ratings', title: t('setup.rowRatings'), sub: t('setup.rowRatingsSub') },
    {
      to: '/setup/rules',
      title: t('setup.rulesTitle'),
      sub: sub(settings, settings.data ? t('setup.rulesSummary', { notice: String(settings.data.minLeadMinutes), days: settings.data.maxDaysAhead }) : null),
    },
  ]
  return (
    <Page title={t('setup.hubTitle')}>
      <FirstTimeHint screen="salon" text={edit ? t('guide.hintSalon') : t('guide.hintSalonHelper')} />
      {/* The setup steps skipped on Today, to bring back once that card is gone */}
      <SkippedStepsRow />
      {!edit && <p className="text-sm text-muted">{t('setup.ownerOnlyChange')}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.to}>
            {/* Each screen's back arrow comes back here (they are opened from Today's setup card and More too) */}
            <Link to={r.to} state={{ from: '/setup' }} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 hover:bg-raised">
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
