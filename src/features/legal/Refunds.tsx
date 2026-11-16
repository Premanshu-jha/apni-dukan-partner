import { Link } from 'react-router'
import { BUSINESS } from '../../lib/business'
import { LegalPage, Section } from './LegalPage'

/** The refund and cancellation policy for the salon subscription (customers pay Clozest nothing). */
export function Refunds() {
  return (
    <LegalPage path="/refunds" title="Refunds and cancellation" updated={BUSINESS.policiesUpdated}>
      <Section title="The monthly subscription">
        <p>
          Customers pay Clozest nothing. Salons pay <strong>₹{BUSINESS.salonPricePerMonth} a month</strong> after a free trial of{' '}
          {BUSINESS.trialDays} days, through Razorpay (UPI AutoPay, card or netbanking). The month is paid at its
          start.
        </p>
      </Section>

      <Section title="Cancelling">
        <ul>
          <li>
            Cancel any time: stop Clozest's AutoPay in your UPI app (PhonePe, Google Pay, Paytm…) or with your bank, or
            write to us and we'll stop it.
          </li>
          <li>You keep the month already paid; nothing more is charged after you cancel.</li>
          <li>The salon keeps taking online bookings until the end of the month already paid.</li>
        </ul>
      </Section>

      <Section title="Refunds">
        <p>
          <strong>Subscription payments are not refunded</strong>, including for a month that has already started,
          whether or not the salon took bookings in it.
        </p>
        <p>
          Questions about a payment? Write to <span className="[overflow-wrap:anywhere]">{BUSINESS.email}</span> with
          the salon's name, the date and the amount (see{' '}
          <Link to="/contact" className="text-link underline">
            Contact
          </Link>
          ).
        </p>
      </Section>
    </LegalPage>
  )
}
