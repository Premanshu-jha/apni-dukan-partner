import { BUSINESS } from '../../lib/business'
import { useT } from '../../i18n'
import { LegalPage, Section } from './LegalPage'

/** Shipping and delivery: Clozest sells a service, nothing is shipped (Razorpay's website check asks for this page). */
export function Delivery() {
  const t = useT()
  return (
    <LegalPage path="/delivery" title={t('about.deliveryTitle')} updated={BUSINESS.policiesUpdated} englishOnly>
      <Section title="Nothing is shipped">
        <p>{BUSINESS.brand} is an online service. We sell and ship no physical goods.</p>
      </Section>

      <Section title="The salon subscription">
        <p>
          The subscription starts as soon as it is paid: the salon can take online bookings in this app at once, for
          the month paid. Customers' bookings are served at the salon, at the booked time.
        </p>
      </Section>
    </LegalPage>
  )
}
