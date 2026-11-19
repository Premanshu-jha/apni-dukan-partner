import type { Appointment, AppointmentStatus } from '../../api/types'
import { t } from '../../i18n'

/** Each status's words, as keys (translated when asked for, so they follow the language). */
const STATUS_KEYS: Record<AppointmentStatus, string> = {
  CONFIRMED: 'day.statusConfirmed',
  IN_SERVICE: 'day.statusInService',
  COMPLETED: 'day.statusCompleted',
  CANCELLED_BY_CUSTOMER: 'day.statusCancelledByCustomer',
  CANCELLED_BY_SALON: 'day.statusCancelledBySalon',
  NO_SHOW: 'day.statusNoShow',
  BLOCKED: 'day.statusBlocked',
  REMOVED: 'day.statusRemoved',
}

export function statusText(status: AppointmentStatus): string {
  return t(STATUS_KEYS[status])
}

/** The words for a status the backend names as text; a status the app doesn't know stays as sent. */
export function statusTextOr(status: string): string {
  const key = STATUS_KEYS[status as AppointmentStatus] as string | undefined
  return key ? t(key) : status
}

export type Tone = 'brand' | 'good' | 'warn' | 'bad' | 'muted'

export function statusTone(a: Appointment): Tone {
  if (a.status === 'CONFIRMED') return a.notStarted ? 'warn' : 'brand'
  if (a.status === 'IN_SERVICE') return 'good'
  if (a.status === 'COMPLETED') return 'muted'
  if (a.status === 'NO_SHOW' || a.status === 'CANCELLED_BY_SALON' || a.status === 'CANCELLED_BY_CUSTOMER') return 'bad'
  return 'muted'
}

/** "Booking", "Walk-in", "Break", "Leave", "Closed". */
export function kindText(a: Appointment): string {
  if (a.kind === 'BOOKING') return t('day.kindBooking')
  if (a.kind === 'WALK_IN') return t('day.kindWalkIn')
  if (a.blockType === 'BREAK') return t('day.kindBreak')
  if (a.blockType === 'LEAVE') return t('day.kindLeave')
  return t('day.kindClosed')
}

/** Who the appointment is for: the customer's name, the walk-in's name, or a plain word. */
export function whoText(a: Appointment): string {
  if (a.kind === 'BOOKING') return a.customerName || t('day.customer')
  if (a.kind === 'WALK_IN') return a.guestName || t('day.walkInCustomer')
  return kindText(a)
}

/** Still on the books: shown first and counted in the barber's day. */
export function isLive(a: Appointment): boolean {
  return a.status === 'CONFIRMED' || a.status === 'IN_SERVICE' || a.status === 'BLOCKED'
}

export function servicesText(a: Appointment): string {
  return a.services.map((s) => s.name).join(', ')
}

export function totalPaise(a: Appointment): { paise: number; from: boolean } {
  return { paise: a.services.reduce((sum, s) => sum + s.pricePaise, 0), from: a.services.some((s) => s.priceIsFrom) }
}

/** New random key for one walk-in, so a retried tap never adds it twice. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
