import type { OfferView } from '../../api/offers'
import { t } from '../../i18n'
import { clock12 } from '../../lib/ist'

/** The keys of the months' short names (translated when asked for, so they follow the language). */
const MONTHS = [
  'offers.monthJan', 'offers.monthFeb', 'offers.monthMar', 'offers.monthApr', 'offers.monthMay', 'offers.monthJun',
  'offers.monthJul', 'offers.monthAug', 'offers.monthSep', 'offers.monthOct', 'offers.monthNov', 'offers.monthDec',
]

/** "12 Nov" for a yyyy-MM-dd date. */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return t('offers.shortDate', { day: d, month: t(MONTHS[m - 1]) })
}

/** "12 Nov – 14 Nov, 12:00 PM–4:00 PM", "12 Nov" for one day; the hours only when set, in 12-hour time as everywhere. */
export function offerWhen(o: Pick<OfferView, 'startsOn' | 'endsOn' | 'from' | 'until'>): string {
  const days = o.startsOn === o.endsOn ? shortDate(o.startsOn) : `${shortDate(o.startsOn)} – ${shortDate(o.endsOn)}`
  return o.from && o.until ? `${days}, ${clock12(o.from)}–${clock12(o.until)}` : days
}

/** "All services", or the names it covers (from the salon's services; unknown ids are skipped). */
export function offerWhat(o: Pick<OfferView, 'allServices' | 'serviceIds'>, names: Map<string, string>): string {
  if (o.allServices) return t('offers.whatAllServices')
  const known = o.serviceIds.map((id) => names.get(id)).filter((n): n is string => !!n)
  return known.length ? known.join(', ') : t('offers.whatSomeServices')
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
  if (!Number.isInteger(f.percentOff) || f.percentOff < 5 || f.percentOff > 50) return t('offers.checkPercent')
  if (!f.allServices && f.serviceIds.length === 0) return t('offers.checkServices')
  if (!f.startsOn || !f.endsOn) return t('offers.checkDays')
  if (f.startsOn < f.today) return t('offers.checkFirstDay')
  if (f.endsOn < f.startsOn) return t('offers.checkLastDay')
  if (f.startsOn > f.lastStart) return t('offers.checkStartBy', { date: shortDate(f.lastStart) })
  if (f.endsOn > f.lastEnd) return t('offers.checkTooFar', { days: MAX_DAYS_AHEAD })
  if (f.someHours) {
    if (!f.from || !f.until) return t('offers.checkBothTimes')
    if (endTime(f.until) <= f.from) return t('offers.checkEndAfterStart')
  }
  return null
}
