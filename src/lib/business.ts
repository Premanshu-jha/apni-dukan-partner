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
