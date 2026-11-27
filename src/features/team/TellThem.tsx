import { useShop } from '../../api/shop'
import { useT } from '../../i18n'
import { BUSINESS, whatsappTo } from '../../lib/business'
import { formatPhone } from '../../lib/phone'
import { isApp } from '../../lib/platform'

/** partner.clozest.in, as people type it */
const SITE = BUSINESS.website.replace(/^https:\/\//, '')

/**
 * After inviting a helper or a barber: the backend tells only a number that already has an account, so a new helper
 * or barber hears of it from the owner. Which app to install (Clozest Partner, not the customers' Clozest) and the
 * number to sign in with, and "Send on WhatsApp" to that number with all of it typed in (in the owner's language: he
 * sends it from his phone).
 */
export function TellThem({ phone, him = false }: { phone: string; him?: boolean }) {
  const t = useT()
  const shop = useShop()
  const text = t('team.whatsappInvite', { name: shop.name, site: SITE })
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-3">
      <p className="text-sm">{t(him ? 'setup.tellHim' : 'team.tellThem', { phone: formatPhone(phone), site: SITE })}</p>
      <a
        href={whatsappTo(phone, text)}
        {...newTab()}
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-4 font-semibold text-ink hover:bg-line"
      >
        {t('team.sendOnWhatsApp')}
      </a>
    </div>
  )
}

/**
 * WhatsApp in a new tab on the website (the app stays open behind it); a plain link in the Play Store app, where a new
 * tab does nothing in the WebView and the link is handed to WhatsApp itself.
 */
function newTab(): { target?: string; rel?: string } {
  return isApp() ? {} : { target: '_blank', rel: 'noopener noreferrer' }
}
