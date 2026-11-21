import type { ServiceItem, ShopStatus, Staff } from '../../api/types'
import { BUSINESS } from '../../lib/business'

/**
 * The salon's own page in the customer app (clozest.in/salons/<shop id>): what the owner sends to his customers and
 * what the counter poster's QR opens. The customer app's route is /salons/:id (its App.tsx); someone signed out who
 * opens it is sent to sign-in and brought back to this salon afterwards (its SignedIn guard keeps the address).
 */
export function salonLink(shopId: string): string {
  return `${BUSINESS.customerSite}/salons/${encodeURIComponent(shopId)}`
}

/**
 * WhatsApp's own "send this text" address: on a phone it opens WhatsApp with the message ready and the person picks
 * whom to send it to (a contact, a group, his status); on a computer, WhatsApp Web. wa.me works with or without the
 * app installed (it offers to get it), where whatsapp:// would do nothing without it.
 */
export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/**
 * Whether the link works for customers today, from the shop's status (the backend's BookingService.visibleSalon: only
 * an APPROVED salon has a page; anything else answers 404 "No such salon."):
 *  - live: APPROVED, the page opens (it may still say "not taking online bookings": the pause or the subscription);
 *  - notLive: DRAFT or PENDING_VISIT (not approved yet), or CLOSED;
 *  - suspended: taken off the app by our team for now.
 */
export type LinkState = 'live' | 'notLive' | 'suspended'

export function linkState(status: ShopStatus): LinkState {
  if (status === 'APPROVED') return 'live'
  if (status === 'SUSPENDED') return 'suspended'
  return 'notLive'
}

/** A file name for the poster from the salon's name: "Shine Unisex Salon" → "shine-unisex-salon-clozest-poster.png". */
export function posterFileName(salon: string): string {
  // Letters of any script stay (a Hindi name stays Hindi); spaces and symbols become one dash
  const slug = salon
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug ? `${slug}-` : ''}clozest-poster.png`
}

/**
 * What still stops customers from booking a live salon (its page opens, but no time can be picked), first missing
 * first; null when it is bookable. The same rule as Today's "Before customers can book" checklist (SetupChecklist):
 * an active service, an active barber, and an active barber with weekly hours and at least one active service.
 */
export type Missing = 'services' | 'barbers' | 'hours'

export function whatsMissing(services: ServiceItem[], staff: Staff[]): Missing | null {
  if (!services.some((s) => s.active)) return 'services'
  const activeStaff = staff.filter((s) => s.active)
  if (activeStaff.length === 0) return 'barbers'
  const ready = activeStaff.some((s) => s.hours.length > 0 && s.serviceIds.some((id) => services.some((v) => v.id === id && v.active)))
  return ready ? null : 'hours'
}
