import type { Appointment, AppointmentStatus } from '../../api/types'

export const statusText: Record<AppointmentStatus, string> = {
  CONFIRMED: 'Booked',
  IN_SERVICE: 'In chair',
  COMPLETED: 'Done',
  CANCELLED_BY_CUSTOMER: 'Cancelled by customer',
  CANCELLED_BY_SALON: 'Cancelled by salon',
  NO_SHOW: 'No-show',
  BLOCKED: 'Blocked',
  REMOVED: 'Removed',
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
  if (a.kind === 'BOOKING') return 'Booking'
  if (a.kind === 'WALK_IN') return 'Walk-in'
  if (a.blockType === 'BREAK') return 'Break'
  if (a.blockType === 'LEAVE') return 'Leave'
  return 'Closed'
}

/** Who the appointment is for: the customer's name, the walk-in's name, or a plain word. */
export function whoText(a: Appointment): string {
  if (a.kind === 'BOOKING') return a.customerName || 'Customer'
  if (a.kind === 'WALK_IN') return a.guestName || 'Walk-in customer'
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
  return { paise: a.services.reduce((t, s) => t + s.pricePaise, 0), from: a.services.some((s) => s.priceIsFrom) }
}

/** New random key for one walk-in, so a retried tap never adds it twice. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
