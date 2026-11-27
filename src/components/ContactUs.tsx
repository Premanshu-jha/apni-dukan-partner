import { useT } from '../i18n'
import { BUSINESS, CALL_US, whatsappUs } from '../lib/business'
import { isApp } from '../lib/platform'

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3.5h3.2l1.6 4-2.1 1.3a11 11 0 0 0 5.5 5.5l1.3-2.1 4 1.6V17a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 5.5a2 2 0 0 1 2-2Z" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6Z" />
    </svg>
  )
}

/**
 * "Call us" and "WhatsApp us": two big buttons, for anyone (signed in or not, with or without an email), so nobody is
 * ever stuck where typing a message isn't possible. Plain links (no router): they work on the crash screen and the
 * update screens too. The WhatsApp message is already typed: the screen they were on and, when known, the shop code.
 */
export function ContactUs({ screen, shopCode, heading }: { screen: string; shopCode?: number | string | null; heading?: string }) {
  const t = useT()
  const text = shopCode
    ? t('help.whatsappTextShop', { screen, code: String(shopCode) })
    : t('help.whatsappText', { screen })
  const button =
    'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-line bg-raised px-3 text-center text-base font-semibold text-ink hover:bg-line'
  return (
    <section aria-label={t('help.talkToUs')} className="flex flex-col gap-2">
      {heading && <p className="text-center text-sm font-medium text-muted">{heading}</p>}
      <div className="grid grid-cols-2 gap-2">
        <a href={CALL_US} className={button}>
          <PhoneIcon />
          {t('help.callUs')}
        </a>
        <a href={whatsappUs(text)} {...newTab()} className={button}>
          <ChatIcon />
          {t('help.whatsappUs')}
        </a>
      </div>
      <p className="text-center text-sm text-muted">{t('help.ourNumber', { phone: BUSINESS.phone })}</p>
      {/* When someone answers (a call at 9 PM shouldn't make the number look dead) */}
      <p className="text-center text-xs text-muted">{t('help.callHours')}</p>
    </section>
  )
}

/**
 * WhatsApp in a new tab on the website (the app stays open behind it); a plain link in the Play Store app, where a new
 * tab does nothing in the WebView and the link is handed to WhatsApp itself.
 */
function newTab(): { target?: string; rel?: string } {
  return isApp() ? {} : { target: '_blank', rel: 'noopener noreferrer' }
}
