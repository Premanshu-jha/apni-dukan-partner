import { useCurrentOffers } from '../../api/offers'
import { messageOf } from '../../api/errors'
import { useSalonHours, useServices } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Card, EmptyState, ErrorState, Loading, Page, Pill } from '../../components/ui'
import { clock12 } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { weekLines } from '../../lib/salonHours'
import { offerWhat, offerWhen } from '../offers/offerText'

/**
 * Salon info, for a barber (anyone in the salon can open it): the opening hours, the services with their prices and
 * time, and the offers running or to come, so he can answer a customer. Read only: the owner changes them in the
 * Salon tab.
 */
export function SalonInfo() {
  const shop = useShop()
  const services = useServices()
  const hours = useSalonHours()
  const offers = useCurrentOffers()

  if (services.isPending || hours.isPending || offers.isPending) {
    return (
      <Page back="/more" title="Salon info">
        <Loading />
      </Page>
    )
  }
  // Only when something never loaded: a failed refresh keeps what is on screen
  const failed = (!services.data && services.error) || (!hours.data && hours.error) || (!offers.data && offers.error)
  if (failed) {
    return (
      <Page back="/more" title="Salon info">
        <ErrorState
          message={messageOf(failed)}
          onRetry={() => {
            void services.refetch()
            void hours.refetch()
            void offers.refetch()
          }}
        />
      </Page>
    )
  }

  const active = (services.data ?? []).filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const names = new Map(active.map((s) => [s.id, s.name]))
  return (
    <Page back="/more" title="Salon info">
      <p className="text-sm text-muted">What customers see for {shop.name}. Only the owner can change it.</p>
      <Card className="flex flex-col gap-1">
        <h2 className="font-semibold">Offers</h2>
        {offers.data?.length ? (
          <ul className="flex flex-col gap-2">
            {offers.data.map(({ offer, state }) => (
              <li key={offer.id} className="flex flex-col">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{offer.percentOff}% off</span>
                  <Pill tone={state === 'RUNNING' ? 'good' : 'brand'}>{state === 'RUNNING' ? 'Running' : 'Coming'}</Pill>
                </span>
                <span className="text-sm text-muted break-words">
                  {offerWhat(offer, names)} · {offerWhen(offer)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No offers on now or coming.</p>
        )}
      </Card>
      <Card className="flex flex-col gap-1">
        <h2 className="font-semibold">Opening hours</h2>
        {hours.data?.days.length ? (
          weekLines(hours.data.days, clock12).map((line) => (
            <p key={line} className="text-sm">
              {line}
            </p>
          ))
        ) : (
          <p className="text-sm text-muted">Not set yet.</p>
        )}
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">Services</h2>
        {active.length ? (
          <ul className="flex flex-col gap-2">
            {active.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  {s.name} <span className="text-sm text-muted">· {s.durationMinutes} min</span>
                </span>
                <span className="shrink-0">{rupees(s.pricePaise, s.priceIsFrom)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No services yet" />
        )}
      </Card>
    </Page>
  )
}
