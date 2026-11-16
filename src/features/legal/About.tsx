import { Link } from 'react-router'
import { BUSINESS } from '../../lib/business'
import { useSession } from '../../store/session'
import { Brand } from '../auth/Brand'
import { LegalPage, Section } from './LegalPage'

/**
 * Clozest for salon owners: what they get and the price. The front page for first-time visitors to partner.clozest.in
 * (`/` comes here), and what Razorpay's website check reads: salons pay the subscription in this app.
 */
export function About() {
  const status = useSession((s) => s.status)
  const signedIn = status === 'signedIn'
  const start = signedIn ? { to: '/', label: 'Open my salon' } : { to: '/signin', label: 'Sign in or sign up' }
  return (
    <LegalPage path="/about" title="Clozest for salons">
      <Brand subtitle="Near You. For You." />
      <p className="text-ink">
        Clozest helps local salons take bookings online from customers nearby, and run the day in one app.
      </p>
      {/* While the session is still starting, no button yet: it would say "Sign in" to someone signed in */}
      {status !== 'starting' && (
        <Link
          to={start.to}
          className="flex min-h-12 items-center justify-center rounded-xl bg-brand bg-linear-to-br from-brand to-brand-deep px-4 font-semibold text-brand-ink shadow-lg shadow-brand/25 hover:brightness-110"
        >
          {start.label}
        </Link>
      )}

      <Section title="What you get">
        <ul>
          <li>Online bookings from customers near your salon.</li>
          <li>Walk-ins, barbers' shifts and leave, holidays, services, prices and offers, in one app.</li>
          <li>A visit and check by the Clozest field team before your salon goes live.</li>
        </ul>
      </Section>

      <Section title="Price">
        <p>
          <strong>
            ₹{BUSINESS.salonPricePerMonth} a month per salon, after a free trial of {BUSINESS.trialDays} days.
          </strong>
        </p>
        <ul>
          <li>The trial starts when the field team approves your salon, not when you sign up.</li>
          <li>Pay by UPI AutoPay (approve once with your UPI PIN), card or netbanking, through Razorpay.</li>
          <li>Cancel any time: you keep the month already paid, and nothing more is taken.</li>
          <li>₹{BUSINESS.salonPricePerMonth} is the full price: no GST is added.</li>
          <li>Paying opens in the app when your trial is ending; we tell you before the first payment.</li>
        </ul>
        <p>
          <strong>Helpers and barbers</strong> the owner adds pay nothing: just sign in.
        </p>
        <p>
          Customers book on Clozest for free and pay nothing to Clozest; they pay you at the salon. See the{' '}
          <Link to="/refunds" className="text-link underline">
            refund policy
          </Link>{' '}
          and the{' '}
          <Link to="/terms" className="text-link underline">
            terms
          </Link>
          .
        </p>
      </Section>

      <Section title="Where we work">
        <p>Hyderabad, Telangana, starting with a few areas and growing from there.</p>
      </Section>

      <p className="text-sm">
        Questions?{' '}
        <Link to="/contact" className="text-link underline">
          Contact us
        </Link>
        .
      </p>
    </LegalPage>
  )
}
