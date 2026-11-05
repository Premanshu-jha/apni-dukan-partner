import { formatInTimeZone } from 'date-fns-tz'

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
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  const [y, m, d] = date.split('-').map(Number)
  return formatInTimeZone(new Date(Date.UTC(y, m - 1, d, 6)), 'UTC', 'EEE d MMM')
}

/** "4:30 PM" for an instant, in India time. */
export function timeIst(instant: string): string {
  return formatInTimeZone(new Date(instant), IST, 'h:mm a')
}

/** "Fri 7 Nov, 4:30 PM" for an instant, in India time. */
export function dateTimeIst(instant: string): string {
  return formatInTimeZone(new Date(instant), IST, 'EEE d MMM, h:mm a')
}

/** The yyyy-MM-dd date of an instant, in India time. */
export function dateOfIst(instant: string): string {
  return formatInTimeZone(new Date(instant), IST, 'yyyy-MM-dd')
}

/** Minutes from now until an instant (negative once it has passed). */
export function minutesUntil(instant: string, now: Date = new Date()): number {
  return Math.round((new Date(instant).getTime() - now.getTime()) / 60000)
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "Mon" for the backend's weekday number (1 = Monday … 7 = Sunday). */
export function weekdayName(weekday: number): string {
  return WEEKDAYS.at(weekday - 1) ?? ''
}

/** "10:00" (24-hour, as the backend sends it) as "10:00 AM". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 && h < 24 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
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
