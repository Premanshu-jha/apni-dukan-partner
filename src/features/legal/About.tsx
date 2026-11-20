import { Link } from 'react-router'
import { spaceBefore, useT } from '../../i18n'
import { LanguagePicker } from '../../i18n/LanguagePicker'
import { BUSINESS } from '../../lib/business'
import { useSession } from '../../store/session'
import { Brand } from '../auth/Brand'
import { LegalPage, Section } from './LegalPage'

/**
 * Clozest for salon owners: what they get and the price. The front page for first-time visitors to partner.clozest.in
 * (`/` comes here), and what Razorpay's website check reads: salons pay the subscription in this app. In the reader's
 * language (a visitor can pick one here, as on the sign-in screen); the amounts are data, the same in every language.
 */
export function About() {
  const t = useT()
  const status = useSession((s) => s.status)
  const signedIn = status === 'signedIn'
  const start = signedIn
    ? { to: '/', label: t('about.openSalon') }
    : { to: '/signin', label: t('about.signInOrUp') }
  const price = BUSINESS.salonPricePerMonth
  return (
    <LegalPage path="/about" title={t('about.title')}>
      <Brand subtitle="Near You. For You." />
      {/* A first-time visitor picks a language here: a real choice, kept on this phone and by the sign-in screen */}
      {status === 'signedOut' && <LanguagePicker heading compact />}
      <p className="text-ink">{t('about.intro')}</p>
      {/* While the session is still starting, no button yet: it would say "Sign in" to someone signed in */}
      {status !== 'starting' && (
        <Link
          to={start.to}
          className="flex min-h-12 items-center justify-center rounded-xl py-2 text-center bg-brand bg-linear-to-br from-brand to-brand-deep px-4 font-semibold text-brand-ink shadow-lg shadow-brand/25 hover:brightness-110"
        >
          {start.label}
        </Link>
      )}

      <Section title={t('about.getTitle')}>
        <ul>
          <li>{t('about.getBookings')}</li>
          <li>{t('about.getOneApp')}</li>
          <li>{t('about.getVisit')}</li>
        </ul>
      </Section>

      <Section title={t('about.priceTitle')}>
        <p>
          <strong>{t('about.priceLine', { price, days: BUSINESS.trialDays })}</strong>
        </p>
        <ul>
          <li>{t('about.priceTrialStarts')}</li>
          <li>{t('about.pricePay')}</li>
          <li>{t('about.priceCancel')}</li>
          <li>{t('about.priceNoGst', { price })}</li>
          <li>{t('about.priceWhen')}</li>
        </ul>
        <p>
          <strong>{t('about.helpersBold')}</strong>
          {spaceBefore(t('about.helpersAfter'))}
          {t('about.helpersAfter')}
        </p>
        <p>
          {t('about.customersBefore')}{' '}
          <Link to="/refunds" className="text-link underline">
            {t('about.customersRefundLink')}
          </Link>
          {spaceBefore(t('about.customersAnd'))}
          {t('about.customersAnd')}{' '}
          <Link to="/terms" className="text-link underline">
            {t('about.customersTermsLink')}
          </Link>
          {spaceBefore(t('about.customersAfter'))}
          {t('about.customersAfter')}
        </p>
      </Section>

      <Section title={t('about.whereTitle')}>
        <p>{t('about.where')}</p>
      </Section>

      <p className="text-sm">
        {t('about.questionsBefore')}{' '}
        <Link to="/contact" className="text-link underline">
          {t('about.questionsLink')}
        </Link>
        {spaceBefore(t('about.questionsAfter'))}
        {t('about.questionsAfter')}
      </p>
    </LegalPage>
  )
}
