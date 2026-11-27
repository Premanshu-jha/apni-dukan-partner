import { SUPPORT_EMAIL } from './config'

/**
 * Who runs Clozest, as shown on the partner app's public pages (About, Contact and the policies). Salons pay the
 * subscription here, so this is the website registered with Razorpay, which checks that the name on it matches the name
 * on its account: the operator is the proprietor's own name until a company exists. The customer app (clozest.in) has
 * its own copy for its customer pages. Change these in one place when the business details change.
 */
export const BUSINESS = {
  brand: 'Clozest',
  operator: 'Premanshu Jha',
  /** How the operator is described in the policies */
  operatorKind: 'sole proprietor',
  email: SUPPORT_EMAIL,
  phone: '+91 93812 51613',
  /** Shown on the Contact page and in the policies */
  address: 'G-10, A Block, G.K. Habitat Royal, Yapral, Secunderabad, Hyderabad, Telangana 500094, India',
  website: 'https://partner.clozest.in',
  /** The customer app, where customers find salons and book */
  customerSite: 'https://clozest.in',
  /** The salons' monthly price, in rupees, and the free trial before it */
  salonPricePerMonth: 500,
  trialDays: 30,
  /** The date the policies were last changed (shown at the top of each) */
  /** When the policies last changed (shown as a date in the reader's language; English: "15 November 2026"). */
  policiesUpdated: '2026-11-15',
} as const

/** "Clozest is operated by Premanshu Jha, a sole proprietor" — the line every public page carries. */
export const OPERATED_BY = `${BUSINESS.brand} is operated by ${BUSINESS.operator}, a ${BUSINESS.operatorKind}.`

/** The phone number as a dialler and WhatsApp take it: digits only, with the country code (919381251613). */
const PHONE_DIGITS = BUSINESS.phone.replace(/\D/g, '')

/** "Call us": opens the phone's dialler with our number (a plain link: it works outside the app's screens too). */
export const CALL_US = `tel:+${PHONE_DIGITS}`

/**
 * "WhatsApp us": a chat with our number, the message already typed (the screen they were on, the shop code), so
 * someone who can't type much only taps Send. WhatsApp opens on the phone; on a computer, WhatsApp Web.
 */
export function whatsappUs(text?: string): string {
  return whatsappTo(PHONE_DIGITS, text)
}

/** A WhatsApp chat with any Indian number (10 digits, or with 91 in front), the message already typed. */
export function whatsappTo(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '')
  const full = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
