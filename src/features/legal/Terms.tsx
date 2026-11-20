import { Link } from 'react-router'
import { BUSINESS } from '../../lib/business'
import { useT } from '../../i18n'
import { LegalPage, Section } from './LegalPage'

/** The terms of service for salons: owners, helpers and barbers using the partner app. */
export function Terms() {
  const t = useT()
  return (
    <LegalPage path="/terms" title={t('about.termsTitle')} updated={BUSINESS.policiesUpdated} englishOnly>
      <p className="text-sm text-muted">
        These terms are an agreement between you and {BUSINESS.operator}, who runs {BUSINESS.brand} (the partner app
        at {BUSINESS.website} and the customer app at {BUSINESS.customerSite}). By using the partner app you accept
        them.
      </p>

      <Section title="The service">
        <p>
          {BUSINESS.brand} lets customers near your salon find it and book a time, and lets you manage bookings,
          walk-ins, staff, hours, services and offers. Your salon provides the haircut or other service and is
          responsible for it, its price and its quality.
        </p>
      </Section>

      <Section title="Your account and your salon">
        <ul>
          <li>You sign in with your own mobile number, and keep your phone and codes safe.</li>
          <li>You must be 18 or over to register a salon.</li>
          <li>
            A salon goes live only after the Clozest field team visits and approves it. The details, photos, video and
            documents you give must be true and your salon's own.
          </li>
          <li>
            The owner decides who helps run the salon in the app (helpers and barbers) and is responsible for what they
            do in it.
          </li>
        </ul>
      </Section>

      <Section title="Customers and bookings">
        <ul>
          <li>Customers book for free and pay you at the salon. {BUSINESS.brand} takes no payment from them.</li>
          <li>Keep your hours, services and prices up to date, and honour the bookings you accept.</li>
          <li>Use customers' names and booking details only to serve their bookings.</li>
        </ul>
      </Section>

      <Section title="The subscription">
        <ul>
          <li>
            After a free trial of {BUSINESS.trialDays} days from approval, the subscription is ₹
            {BUSINESS.salonPricePerMonth} a month, paid in advance through Razorpay.
          </li>
          <li>
            If a month is not paid within 3 days of its start, the salon is hidden from customers and takes no new
            online bookings until it pays. Bookings already made stay.
          </li>
          <li>
            Cancelling and refunds follow the{' '}
            <Link to="/refunds" className="text-link underline">
              refund and cancellation policy
            </Link>
            .
          </li>
        </ul>
      </Section>

      <Section title="Fair use">
        <p>
          Don't misuse {BUSINESS.brand}: no fake salons, bookings or details, harassment of customers, or attempts to
          break or overload the service. We can suspend salons or accounts that do.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          {BUSINESS.brand} is provided as it is. As far as the law allows, {BUSINESS.operator} is not liable for losses
          from the service being unavailable for a while, and its liability to a salon is limited to the subscription
          paid in the last month.
        </p>
      </Section>

      <Section title="Law and disputes">
        <p>
          These terms follow the laws of India. Disputes go to the courts of Hyderabad, Telangana. Write to us first (
          <Link to="/contact" className="text-link underline">
            Contact
          </Link>
          ); most things can be sorted out quickly.
        </p>
      </Section>

      <Section title="Changes">
        <p>When these terms change, the date at the top changes, and important changes are told in the app.</p>
      </Section>
    </LegalPage>
  )
}
