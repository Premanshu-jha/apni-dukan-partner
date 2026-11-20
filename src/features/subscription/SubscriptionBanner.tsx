import { Link } from 'react-router'
import { useSubscription } from '../../api/subscription'
import { useShop } from '../../api/shop'
import { Banner } from '../../components/ui'
import { useT } from '../../i18n'
import { dayIst, daysLeft, payByDay, whatEnded } from './text'

/**
 * On Today: the owner's reminder in the last week of the trial or paid month (nothing while AutoPay is on), a failed
 * AutoPay payment, and once it has ended. Helpers and barbers see it once it has ended (they can remind the owner).
 */
export function SubscriptionBanner() {
  const t = useT()
  const shop = useShop()
  const sub = useSubscription()
  const s = sub.data
  if (!s || s.state === 'NONE' || s.state === 'AUTOPAY') return null
  const owner = shop.myRole === 'OWNER'
  const who = shop.ownerName
  // Printed as it is ("₹1500"), not grouped
  const price = String(s.pricePerMonth)
  const link = (label: string) => (
    <Link to="/subscription" className="font-medium underline">
      {label}
    </Link>
  )
  if (s.state === 'HIDDEN' && s.enforced) {
    return (
      <Banner tone="bad" live={false}>
        {owner
          ? t('subscription.bannerHiddenOwner')
          : who
            ? t('subscription.bannerHiddenStaffNamed', { shop: shop.name, name: who })
            : t('subscription.bannerHiddenStaff', { shop: shop.name })}{' '}
        {link(owner ? t('subscription.payNow') : t('subscription.details'))}
      </Banner>
    )
  }
  if (s.state === 'GRACE' || s.state === 'HIDDEN') {
    if (!owner) {
      return s.enforced ? (
        <Banner tone="warn" live={false}>
          {who ? t('subscription.bannerAskNamed', { name: who, day: payByDay(s) }) : t('subscription.bannerAskOwner', { day: payByDay(s) })} {link(t('subscription.details'))}
        </Banner>
      ) : null
    }
    return (
      <Banner tone={s.enforced ? 'warn' : 'info'} live={false}>
        {s.enforced
          ? t('subscription.bannerEndedPayBy', { what: whatEnded(s), day: payByDay(s) })
          : t('subscription.bannerEndedPay', { what: whatEnded(s), price })}{' '}
        {link(s.paymentsReady ? t('subscription.payNow') : t('subscription.details'))}
      </Banner>
    )
  }
  // TRIAL or PAID: only the owner, a failed AutoPay at once, else in the last week
  if (!owner) return null
  if (s.autoPayFailed) {
    return (
      <Banner tone="warn" live={false}>
        {t('subscription.bannerAutoPayFailed')} {link(t('subscription.details'))}
      </Banner>
    )
  }
  if (daysLeft(s.accessUntil!) > 7) return null
  return (
    <Banner tone="info" live={false}>
      {t(s.state === 'TRIAL' ? 'subscription.bannerTrialEnds' : 'subscription.bannerPaidEnds', { day: dayIst(s.accessUntil!), price })}{' '}
      {link(s.paymentsReady ? t('subscription.setUpAutoPay') : t('subscription.details'))}
    </Banner>
  )
}
