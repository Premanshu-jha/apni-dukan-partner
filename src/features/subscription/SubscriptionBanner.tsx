import { Link } from 'react-router'
import { useSubscription } from '../../api/subscription'
import { useShop } from '../../api/shop'
import { Banner } from '../../components/ui'
import { dayIst, daysLeft, payByDay, whatEnded } from './text'

/**
 * On Today: the owner's reminder in the last week of the trial or paid month (nothing while AutoPay is on), a failed
 * AutoPay payment, and once it has ended. Helpers and barbers see it once it has ended (they can remind the owner).
 */
export function SubscriptionBanner() {
  const shop = useShop()
  const sub = useSubscription()
  const s = sub.data
  if (!s || s.state === 'NONE' || s.state === 'AUTOPAY') return null
  const owner = shop.myRole === 'OWNER'
  const who = shop.ownerName || 'the owner'
  const link = (label: string) => (
    <Link to="/subscription" className="font-medium underline">
      {label}
    </Link>
  )
  if (s.state === 'HIDDEN' && s.enforced) {
    return (
      <Banner tone="bad" live={false}>
        {owner
          ? "Customers can't find your salon on Clozest until you pay. "
          : `Customers can't find ${shop.name} until ${who} pays the Clozest subscription. `}
        {link(owner ? 'Pay now' : 'Details')}
      </Banner>
    )
  }
  if (s.state === 'GRACE' || s.state === 'HIDDEN') {
    if (!owner) {
      return s.enforced ? (
        <Banner tone="warn" live={false}>
          Ask {who} to pay the Clozest subscription by {payByDay(s)}, or customers won't find the salon. {link('Details')}
        </Banner>
      ) : null
    }
    return (
      <Banner tone={s.enforced ? 'warn' : 'info'} live={false}>
        {s.enforced
          ? `${whatEnded(s)}: pay by ${payByDay(s)} to stay visible to customers. `
          : `${whatEnded(s)}. Pay ₹${s.pricePerMonth} to keep your salon on Clozest. `}
        {link(s.paymentsReady ? 'Pay now' : 'Details')}
      </Banner>
    )
  }
  // TRIAL or PAID: only the owner, a failed AutoPay at once, else in the last week
  if (!owner) return null
  if (s.autoPayFailed) {
    return (
      <Banner tone="warn" live={false}>
        Your AutoPay payment didn't go through. Check your bank or UPI app, or pay another way. {link('Details')}
      </Banner>
    )
  }
  if (daysLeft(s.accessUntil!) > 7) return null
  return (
    <Banner tone="info" live={false}>
      Your {s.state === 'TRIAL' ? 'free trial' : 'paid month'} ends on {dayIst(s.accessUntil!)}. Set up AutoPay
      (₹{s.pricePerMonth} a month, nothing taken before then) so customers can keep booking you.{' '}
      {link(s.paymentsReady ? 'Set up AutoPay' : 'Details')}
    </Banner>
  )
}
