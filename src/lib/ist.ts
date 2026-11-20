import { formatInTimeZone } from 'date-fns-tz'
import { language, t } from '../i18n'

/** Salons work in India time, whatever zone the phone is set to. */
export const IST = 'Asia/Kolkata'

/** Today's date in India as yyyy-MM-dd. */
export function todayIst(now: Date = new Date()): string {
  return formatInTimeZone(now, IST, 'yyyy-MM-dd')
}

/** A yyyy-MM-dd date plus some days, as yyyy-MM-dd (calendar maths, no time zones involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

/** The next `count` dates starting today, in India. */
export function nextDates(count: number, now: Date = new Date()): string[] {
  const start = todayIst(now)
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

/** "Today", "Tomorrow" or "Fri 7 Nov" for a yyyy-MM-dd date. */
export function dayLabel(date: string, now: Date = new Date()): string {
  const today = todayIst(now)
  if (date === today) return t('day.dayToday')
  if (date === addDays(today, 1)) return t('day.dayTomorrow')
  const [y, m, d] = date.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d, 6))
  return local(at, 'UTC', DAY) ?? formatInTimeZone(at, 'UTC', 'EEE d MMM')
}

const DAY: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }

/**
 * A date or time in the app's language (its own day and month names, digits 0-9); null in English, which keeps the
 * wording it always had.
 */
export function local(at: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string | null {
  const lang = language()
  if (lang === 'en') return null
  try {
    return new Intl.DateTimeFormat(`${lang}-IN-u-nu-latn`, { ...options, timeZone }).format(at)
  } catch {
    return null // a phone without this language's formats: as in English
  }
}

/** "4:30 PM" for an instant, in India time. */
export function timeIst(instant: string): string {
  // In another language: the same "4:30 PM" words as opening hours use (clock12), so one screen never mixes styles
  return language() === 'en' ? formatInTimeZone(new Date(instant), IST, 'h:mm a')
    : clock12(formatInTimeZone(new Date(instant), IST, 'HH:mm'))
}

/** "Fri 7 Nov, 4:30 PM" for an instant, in India time. */
export function dateTimeIst(instant: string): string {
  const day = local(new Date(instant), IST, DAY)
  return day === null ? formatInTimeZone(new Date(instant), IST, 'EEE d MMM, h:mm a') : `${day}, ${timeIst(instant)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "7 Nov 2026" for a yyyy-MM-dd date (a licence's last valid day), in the app's language with the app's own month
 * words (the same on every phone, whatever its date formats; digits 0-9).
 */
export function fullDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (language() === 'en') {
    const at = new Date(Date.UTC(y, m - 1, d, 6))
    return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return `${t('shop.dayMonth', { day: d, month: t(`shop.monthShort${MONTHS[m - 1]}`) })} ${y}`
}

/** The yyyy-MM-dd date of an instant, in India time. */
export function dateOfIst(instant: string): string {
  return formatInTimeZone(new Date(instant), IST, 'yyyy-MM-dd')
}

/** Minutes from now until an instant (negative once it has passed). */
export function minutesUntil(instant: string, now: Date = new Date()): number {
  return Math.round((new Date(instant).getTime() - now.getTime()) / 60000)
}

/** The keys of the weekdays' short names (translated when asked for, so they follow the language). */
const WEEKDAYS = ['day.weekdayMon', 'day.weekdayTue', 'day.weekdayWed', 'day.weekdayThu', 'day.weekdayFri', 'day.weekdaySat', 'day.weekdaySun']

/** "Mon" for the backend's weekday number (1 = Monday … 7 = Sunday). */
export function weekdayName(weekday: number): string {
  const key = WEEKDAYS.at(weekday - 1)
  return key ? t(key) : ''
}

/** "10:00" (24-hour, as the backend sends it) as "10:00 AM". */
export function clock12(hhmm: string): string {
  if (hhmm === '24:00') return t('day.midnight')   // the end of the day: "12:00 AM" would read as its start
  const [h, m] = hhmm.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  const time = `${h12}:${String(m).padStart(2, '0')}`
  return h >= 12 && h < 24 ? t('day.clockPm', { time }) : t('day.clockAm', { time })
}

/** A yyyy-MM-dd date and "HH:mm" in India time, as an ISO instant (India has no daylight saving: always +05:30). */
export function istInstant(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, h, min) - 330 * 60_000).toISOString()
}

/** "16:30" for an instant, in India time (24-hour, for time inputs). */
export function hhmmIst(instant: string): string {
  return formatInTimeZone(new Date(instant), IST, 'HH:mm')
}

/** A real yyyy-MM-dd date (a cleared date field gives ""; date maths on it would throw). */
export function isDate(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
}
