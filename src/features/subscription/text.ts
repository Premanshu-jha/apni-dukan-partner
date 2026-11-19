import { formatInTimeZone } from 'date-fns-tz'
import type { SubscriptionView } from '../../api/types'
import { t } from '../../i18n'
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
  if (s.autoPayFailed) return t('subscription.endedAutoPay')
  return s.paidUntil ? t('subscription.endedPaid') : t('subscription.endedTrial')
}

/** One line for the More screen. */
export function summary(s: SubscriptionView, now: Date = new Date()): string {
  // Printed as it is ("₹1500"), not grouped
  const price = String(s.pricePerMonth)
  switch (s.state) {
    case 'NONE':
      return t('subscription.summaryNone', { price })
    case 'AUTOPAY':
      return s.accessUntil && Date.parse(s.accessUntil) > now.getTime()
        ? t('subscription.summaryAutoPayNext', { price, day: dayIst(s.accessUntil) })
        : t('subscription.summaryAutoPay', { price })
    case 'TRIAL':
      return s.autoPayFailed ? t('subscription.summaryAutoPayFailed') : t('subscription.summaryTrial', { day: dayIst(s.accessUntil!) })
    case 'PAID':
      return s.autoPayFailed ? t('subscription.summaryAutoPayFailed') : t('subscription.summaryPaid', { day: dayIst(s.accessUntil!) })
    case 'GRACE': {
      // Keys: summaryGrace{Failed,Paid,Trial}PayBy and summaryGrace{Failed,Paid,Trial}Pay
      const what = s.autoPayFailed ? 'Failed' : s.paidUntil ? 'Paid' : 'Trial'
      return s.enforced
        ? t(`subscription.summaryGrace${what}PayBy`, { day: payByDay(s) })
        : t(`subscription.summaryGrace${what}Pay`, { price })
    }
    case 'HIDDEN':
      return s.enforced
        ? t('subscription.summaryHidden')
        : t('subscription.summaryHiddenPay', { price })
  }
}
