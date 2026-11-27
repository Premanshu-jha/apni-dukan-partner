import { Link } from 'react-router'
import { spaceBefore, useT } from '../../i18n'
import { BUSINESS } from '../../lib/business'
import { LegalPage, Section } from './LegalPage'
import { ContactUs } from '../../components/ContactUs'

/**
 * How to reach Clozest: email, phone and address (also the grievance contact under the privacy policy). The words are
 * in the reader's language; the email, phone and address are data, the same in every language.
 */
export function Contact() {
  const t = useT()
  const tel = BUSINESS.phone.replace(/\s/g, '')
  return (
    <LegalPage path="/contact" title={t('about.contactTitle')}>
      {/* The quickest way first, for anyone (signed in or not, sign-up not finished) */}
      <ContactUs screen={t('about.contactTitle')} heading={t('help.talkToUs')} />
      <Section title={t('about.contactWriteTitle')}>
        <dl className="flex flex-col gap-3">
          <div>
            <dt>{t('about.contactEmail')}</dt>
            <dd>
              <a href={`mailto:${BUSINESS.email}`} className="text-link underline [overflow-wrap:anywhere]">
                {BUSINESS.email}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t('about.contactPhone')}</dt>
            <dd>
              <a href={`tel:${tel}`} className="text-link underline">
                {BUSINESS.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t('about.contactAddress')}</dt>
            <dd className="text-ink">
              {BUSINESS.operator} ({BUSINESS.brand}), {BUSINESS.address}
            </dd>
          </div>
        </dl>
      </Section>

      <Section title={t('about.contactHelpTitle')}>
        <p>
          {t('about.contactHelpBefore')} <strong>{t('help.writeToSupport')}</strong>
          {spaceBefore(t('about.contactHelpMiddle', { more: t('app.tabMore') }))}
          {t('about.contactHelpMiddle', { more: t('app.tabMore') })} <strong>{t('help.myRequests')}</strong>
          {spaceBefore(t('about.contactHelpAfter'))}
          {t('about.contactHelpAfter')}
        </p>
      </Section>

      <Section title={t('about.contactGrievanceTitle')}>
        <p>
          {t('about.contactGrievanceBefore')}{' '}
          <Link to="/privacy" className="text-link underline">
            {t('about.contactGrievanceLink')}
          </Link>
          {spaceBefore(t('about.contactGrievanceMiddle', { operator: BUSINESS.operator }))}
          {t('about.contactGrievanceMiddle', { operator: BUSINESS.operator })}{' '}
          <span className="[overflow-wrap:anywhere]">{BUSINESS.email}</span>
          {spaceBefore(t('about.contactGrievanceAfter'))}
          {t('about.contactGrievanceAfter')}
        </p>
      </Section>
    </LegalPage>
  )
}
