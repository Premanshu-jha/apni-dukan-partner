import type { OpenDay, Shift } from '../api/types'
import { weekdayName } from './ist'

/** One day of the salon's week as the editor holds it: open with its times, or closed (null). */
export type DayHours = { open: string; close: string } | null
/** The week, Monday (1) to Sunday (7). */
export type SalonWeek = Record<number, DayHours>

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/** What a new salon starts with: open 10 AM to 9 PM every day; the owner changes what differs. */
export function defaultWeek(): SalonWeek {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, { open: '10:00', close: '21:00' }]))
}

/** The backend's list (open days only) as the editor's week. */
export function toSalonWeek(days: OpenDay[]): SalonWeek {
  const week: SalonWeek = Object.fromEntries(WEEKDAYS.map((d) => [d, null]))
  for (const d of days) week[d.weekday] = { open: d.open, close: d.close }
  return week
}

/** The editor's week as the backend wants it: the open days, Monday first. */
export function fromSalonWeek(week: SalonWeek): OpenDay[] {
  return WEEKDAYS.flatMap((d) => {
    const h = week[d]
    return h ? [{ weekday: d, open: h.open, close: h.close }] : []
  })
}

/** Problems before sending: at least one open day, close after open, 15-minute steps. */
export function checkSalonWeek(week: SalonWeek): string | null {
  const open = WEEKDAYS.filter((d) => week[d])
  if (open.length === 0) return 'Open at least one day a week.'
  for (const d of open) {
    const h = week[d]!
    if (!h.open || !h.close) return `${weekdayName(d)}: fill in both times.`
    if (h.close <= h.open) return `${weekdayName(d)}: closing must be after opening.`
    if (![h.open, h.close].every((t) => Number(t.split(':')[1]) % 15 === 0)) {
      return `${weekdayName(d)}: use 15-minute steps (10:00, 10:15, …).`
    }
  }
  return null
}

/** "Mon–Sat 10:00 AM – 9:00 PM · Sun closed" style, for the review screen: each day on its own line. */
export function weekLines(days: OpenDay[], clock: (t: string) => string): string[] {
  const week = toSalonWeek(days)
  return WEEKDAYS.map((d) => {
    const h = week[d]
    return `${weekdayName(d)}: ${h ? `${clock(h.open)} – ${clock(h.close)}` : 'Closed'}`
  })
}

/** A barber's week the same as the salon's: one shift on each open day (the "Use the salon's hours" button). */
export function salonShifts(days: OpenDay[]): Shift[] {
  return days.map((d) => ({ weekday: d.weekday, start: d.open, end: d.close }))
}
