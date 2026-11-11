import type { OfferView } from '../../api/offers'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Nov" for a yyyy-MM-dd date. */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** "12 Nov – 14 Nov, 12:00–16:00", "12 Nov" for one day; the hours only when set. The same text as the message. */
export function offerWhen(o: Pick<OfferView, 'startsOn' | 'endsOn' | 'from' | 'until'>): string {
  const days = o.startsOn === o.endsOn ? shortDate(o.startsOn) : `${shortDate(o.startsOn)} – ${shortDate(o.endsOn)}`
  return o.from && o.until ? `${days}, ${o.from}–${o.until}` : days
}

/** "All services", or the names it covers (from the salon's services; unknown ids are skipped). */
export function offerWhat(o: Pick<OfferView, 'allServices' | 'serviceIds'>, names: Map<string, string>): string {
  if (o.allServices) return 'All services'
  const known = o.serviceIds.map((id) => names.get(id)).filter((n): n is string => !!n)
  return known.length ? known.join(', ') : 'Some services'
}

/** The offer price of a list price, as the backend works it out (SalonOffer.priceOf): to the rupee, half up. */
export function offerPrice(listPaise: number, percentOff: number): number {
  if (listPaise <= 0) return listPaise
  const rupees = Math.floor((listPaise * (100 - percentOff) + 5000) / 10000)
  return Math.max(1, rupees) * 100
}

/** "00:00" as an end time is midnight at the end of the day, which the backend writes "24:00". */
export function endTime(until: string): string {
  return until === '00:00' ? '24:00' : until
}

/** The last day an offer can end on (SalonOfferService.MAX_DAYS_AHEAD after today). */
export const MAX_DAYS_AHEAD = 90

/** The form's own checks, before the backend's: what is missing or wrong, or null. */
export function checkOffer(f: {
  percentOff: number
  startsOn: string
  endsOn: string
  someHours: boolean
  from: string
  until: string
  allServices: boolean
  serviceIds: string[]
  today: string
  /** The last day an offer can end on (today + 90) */
  lastEnd: string
  /** The last day it can start on: customers can book only so far ahead (the salon's booking window) */
  lastStart: string
}): string | null {
  if (!Number.isInteger(f.percentOff) || f.percentOff < 5 || f.percentOff > 50) return 'The discount must be 5% to 50%.'
  if (!f.allServices && f.serviceIds.length === 0) return 'Pick at least one service, or choose all services.'
  if (!f.startsOn || !f.endsOn) return 'Pick the first and last day.'
  if (f.startsOn < f.today) return 'The first day must be today or later.'
  if (f.endsOn < f.startsOn) return 'The last day must be on or after the first day.'
  if (f.startsOn > f.lastStart) return `Customers can book only so far ahead: start the offer by ${shortDate(f.lastStart)}.`
  if (f.endsOn > f.lastEnd) return `The last day can be at most ${MAX_DAYS_AHEAD} days from today.`
  if (f.someHours) {
    if (!f.from || !f.until) return 'Pick both times, or turn off "Only some hours".'
    if (endTime(f.until) <= f.from) return 'The end time must be after the start time.'
  }
  return null
}
