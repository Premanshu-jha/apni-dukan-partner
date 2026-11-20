import { Link } from 'react-router'
import { BUSINESS } from '../../lib/business'
import { useT } from '../../i18n'
import { LegalPage, Section } from './LegalPage'

/** The privacy policy for salon owners, helpers and barbers (Digital Personal Data Protection Act, 2023). */
export function Privacy() {
  const t = useT()
  return (
    <LegalPage path="/privacy" title={t('about.privacyTitle')} updated={BUSINESS.policiesUpdated} englishOnly>
      <p className="text-sm text-muted">
        This policy explains what personal data the {BUSINESS.brand} partner app collects from salon owners, helpers and
        barbers, why, who it is shared with, and your rights under the Digital Personal Data Protection Act, 2023.{' '}
        {BUSINESS.operator} is the data fiduciary.
      </p>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account:</strong> your mobile number, name and email.
          </li>
          <li>
            <strong>Your salon:</strong> its name, address and map pin, the owner's photo, photos and a video of the
            salon, its trade licence if given, its services, prices, offers, hours, staff, shifts and leave.
          </li>
          <li>
            <strong>Work in the app:</strong> bookings and walk-ins, and your messages to support with any files you
            attach.
          </li>
          <li>
            <strong>Payments:</strong> the salon's subscription payments and their status, from Razorpay.
          </li>
          <li>
            <strong>Technical:</strong> sign-in sessions, notification settings, and the network address of requests
            (to stop abuse).
          </li>
        </ul>
        <p>We never collect card numbers, UPI PINs or bank passwords: payments are handled by Razorpay.</p>
      </Section>

      <Section title="Why we use it">
        <ul>
          <li>To sign you in, check and approve the salon, and show it to customers near it.</li>
          <li>To run bookings, walk-ins and the salon's day, and send messages about them.</li>
          <li>To collect the subscription, answer support requests, prevent fraud and meet legal duties.</li>
        </ul>
        <p>
          Customers see the salon's public details (name, address, photos, services, prices, hours, offers), never the
          owner's phone, email or documents. We do not sell your data.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>Only with services that run Clozest for us, each only for its own job:</p>
        <ul>
          <li>SMS (MSG91) and email (Resend) for codes and messages</li>
          <li>Hosting and storage (Railway, Neon, Redis Cloud, Cloudflare R2), and Cloudflare's robot check</li>
          <li>Maps and address lookup (Google), and Razorpay for subscription payments</li>
        </ul>
        <p>And with authorities when the law requires it.</p>
      </Section>

      <Section title="Customers' data you see">
        <p>
          You see a customer's name and booking so you can serve them. Use it only for that, and don't copy it out of
          the app.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          While your account is open. When you delete your account (after closing or handing over your salon), your
          name, number and email are removed; records the law needs (such as payments) are kept without them.
        </p>
      </Section>

      <Section title="Your rights">
        <ul>
          <li>See and correct your details in the app; delete your account any time (an owner closes or hands over the salon first).</li>
          <li>Ask what data we hold about you, withdraw consent, or nominate someone to act for you.</li>
          <li>Complain to us first, and then to the Data Protection Board of India.</li>
        </ul>
        <p>
          Write to {BUSINESS.operator} at <span className="[overflow-wrap:anywhere]">{BUSINESS.email}</span> (see{' '}
          <Link to="/contact" className="text-link underline">
            Contact
          </Link>
          ).
        </p>
      </Section>

      <Section title="Changes">
        <p>When this policy changes, the date at the top changes, and important changes are told in the app.</p>
      </Section>
    </LegalPage>
  )
}
