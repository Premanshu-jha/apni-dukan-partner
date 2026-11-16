import { formatInTimeZone } from 'date-fns-tz'
import type { SubscriptionView } from '../../api/types'
import { IST } from '../../lib/ist'

/** "10 Dec 2026" for an instant, in India time. */
export function dayIst(instant: string): string {
  return formatInTimeZone(new Date(instant), IST, 'd MMM yyyy')
}

/**
 * The last day to pay before customers stop finding the salon: hiddenFrom is the midnight (India time) starting the
 * day after, so the day before it.
 */
export function payByDay(s: SubscriptionView): string {
  return dayIst(new Date(Date.parse(s.hiddenFrom!) - 1).toISOString())
}

/** Whole days from now until the instant (0 on its last day, negative after). */
export function daysLeft(instant: string, now: Date = new Date()): number {
  return Math.ceil((Date.parse(instant) - now.getTime()) / 86_400_000) || 0   // never -0
}

/** What ended: the free trial, a paid month, or an AutoPay payment that didn't go through. */
export function whatEnded(s: SubscriptionView): string {
  if (s.autoPayFailed) return "Your AutoPay payment didn't go through"
  return s.paidUntil ? 'Your paid month has ended' : 'Your free trial has ended'
}

/** One line for the More screen. */
export function summary(s: SubscriptionView, now: Date = new Date()): string {
  switch (s.state) {
    case 'NONE':
      return `Free for 30 days once our field team approves your salon, then ₹${s.pricePerMonth} a month`
    case 'AUTOPAY':
      return s.accessUntil && Date.parse(s.accessUntil) > now.getTime()
        ? `AutoPay on: ₹${s.pricePerMonth} a month, next on ${dayIst(s.accessUntil)}`
        : `AutoPay on: ₹${s.pricePerMonth} a month`
    case 'TRIAL':
      return s.autoPayFailed ? "AutoPay payment didn't go through" : `Free trial until ${dayIst(s.accessUntil!)}`
    case 'PAID':
      return s.autoPayFailed ? "AutoPay payment didn't go through" : `Paid until ${dayIst(s.accessUntil!)}`
    case 'GRACE': {
      const what = s.autoPayFailed ? 'Payment failed' : s.paidUntil ? 'Paid month ended' : 'Free trial ended'
      return s.enforced
        ? `${what}: pay by ${payByDay(s)} to stay visible`
        : `${what}: pay ₹${s.pricePerMonth} to keep your salon on Clozest`
    }
    case 'HIDDEN':
      return s.enforced
        ? "Not paid: customers can't find your salon"
        : `Not paid: pay ₹${s.pricePerMonth} to keep your salon on Clozest`
  }
}
