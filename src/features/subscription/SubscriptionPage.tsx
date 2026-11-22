import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { confirmPayment, type PaymentAnswer, startCheckout, subscriptionKeys, useSubscription } from '../../api/subscription'
import { isApiError, messageOf } from '../../api/errors'
import type { SubscriptionView } from '../../api/types'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, ErrorState, Loading, Page } from '../../components/ui'
import { spaceBefore, t, useLanguage, useT } from '../../i18n'
import { CheckoutStopped, payWithRazorpay } from '../../lib/razorpay'
import { screensBehind } from '../../lib/nav'
import { dayIst, payByDay, whatEnded } from './text'
import { useWriteToUsHref } from '../help/HelpButton'

/** After a checkout, the page reads the subscription every 5 seconds for this long (Razorpay's word may lag). */
const WATCH_MS = 90_000

/**
 * The salon's subscription: what it costs, until when it is paid, and (the owner) the button that opens Razorpay's
 * checkout: approve AutoPay once with the UPI PIN (or pay by card or netbanking).
 */
export function SubscriptionPage() {
  const t = useT()
  const shop = useShop()
  const [watchUntil, setWatchUntil] = useState(0)
  const watching = watchUntil > 0
  const sub = useSubscription(watching)
  // Stop watching once the time is up (or AutoPay showed up)
  useEffect(() => {
    if (!watching) return
    if (sub.data?.state === 'AUTOPAY') {
      setWatchUntil(0)
      return
    }
    const t = setTimeout(() => setWatchUntil(0), Math.max(0, watchUntil - Date.now()))
    return () => clearTimeout(t)
  }, [watching, watchUntil, sub.data?.state])
  return (
    <Page title={t('subscription.title')} back={screensBehind() > 0 ? true : '/more'} backReplace>
      {sub.isPending ? (
        <Loading />
      ) : sub.isError ? (
        <ErrorState message={messageOf(sub.error)} onRetry={() => void sub.refetch()} />
      ) : (
        <Details
          s={sub.data}
          owner={shop.myRole === 'OWNER'}
          ownerName={shop.ownerName}
          suspended={shop.status === 'SUSPENDED'}
          onWatch={() => setWatchUntil(Date.now() + WATCH_MS)}
        />
      )}
    </Page>
  )
}

/** What the owner just did, for the line at the top. */
type Outcome = { kind: 'autopay'; firstOn: string | null } | { kind: 'checking'; answer: PaymentAnswer }

function Details({
  s,
  owner,
  ownerName,
  suspended,
  onWatch,
}: {
  s: SubscriptionView
  owner: boolean
  ownerName: string
  suspended: boolean
  onWatch: () => void
}) {
  const t = useT()
  const writeToUs = useWriteToUsHref()
  // Printed as it is ("₹1500"), not grouped
  const price = String(s.pricePerMonth)
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // Left the page meanwhile: don't open Razorpay's sheet over another screen
  const here = useRef(true)
  useEffect(() => {
    here.current = true
    return () => {
      here.current = false
    }
  }, [])

  function afterwards() {
    void qc.invalidateQueries({ queryKey: subscriptionKeys.mine })
    onWatch()
  }

  async function confirm(answer: PaymentAnswer, firstOn: string | null) {
    try {
      const view = await confirmPayment(answer)
      qc.setQueryData(subscriptionKeys.mine, view)
      setOutcome({ kind: 'autopay', firstOn })
      setProblem(null)
    } catch (e) {
      if (isApiError(e, 'PAYMENT_NOT_CONFIRMED')) {
        setOutcome(null)
        setProblem(messageOf(e))
      } else {
        // Approved at Razorpay but not confirmed here (network): never ask to pay again; check this same answer
        setOutcome({ kind: 'checking', answer })
      }
      afterwards()
    }
  }

  async function pay() {
    setBusy(true)
    setProblem(null)
    setOutcome(null)
    try {
      const checkout = await startCheckout()
      if (!here.current) return
      const answer = await payWithRazorpay(checkout, () => here.current)
      await confirm(
        {
          razorpayPaymentId: answer.razorpay_payment_id,
          razorpaySubscriptionId: answer.razorpay_subscription_id,
          razorpaySignature: answer.razorpay_signature,
        },
        checkout.firstChargeAt,
      )
    } catch (e) {
      if (e instanceof CheckoutStopped) {
        if (e.reason === 'FAILED') {
          setProblem(t('subscription.failedMoneyTaken', { reason: e.message }))
        } else if (e.reason === 'LOAD') {
          setProblem(t('subscription.couldntOpenPayment'))
        }
        // CLOSED: the owner closed it; nothing to say (a payment approved in the UPI app still shows up)
      } else if (!isApiError(e, 'ALREADY_SUBSCRIBED')) {
        setProblem(messageOf(e))
      }
      afterwards()
    } finally {
      setBusy(false)
    }
  }

  async function checkAgain(answer: PaymentAnswer) {
    setBusy(true)
    try {
      await confirm(answer, null)
    } finally {
      setBusy(false)
    }
  }

  const autoPayNow = s.state === 'AUTOPAY'
  return (
    <div className="flex flex-col gap-4">
      {outcome?.kind === 'autopay' && autoPayNow && (
        <Banner tone="good">
          {outcome.firstOn
            ? t('subscription.autoPayOnFirst', { price, day: dayIst(outcome.firstOn) })
            : t('subscription.autoPayOnNow', { price })}
        </Banner>
      )}
      {outcome?.kind === 'checking' && !autoPayNow && (
        <Banner tone="info">
          <p>{t('subscription.checking')}</p>
          <Button variant="secondary" busy={busy} onClick={() => void checkAgain(outcome.answer)}>
            {t('subscription.checkAgain')}
          </Button>
        </Banner>
      )}
      {suspended && (
        <Banner tone="warn" live={false}>
          {t('subscription.suspendedBefore')} <Link to={writeToUs} className="underline">{t('subscription.suspendedLink')}</Link>
          {spaceBefore(t('subscription.suspendedAfter'))}{t('subscription.suspendedAfter')}
        </Banner>
      )}
      {s.state === 'HIDDEN' && s.enforced && (
        <Banner tone="bad" live={false}>
          {t('subscription.hiddenUntilPaid')}
        </Banner>
      )}
      {s.state === 'GRACE' && (
        <Banner tone={s.enforced ? 'warn' : 'info'} live={false}>
          {s.enforced
            ? t('subscription.gracePayBy', { what: whatEnded(s), day: payByDay(s) })
            : t('subscription.gracePlease', { what: whatEnded(s) })}
        </Banner>
      )}
      {s.autoPayFailed && (s.state === 'TRIAL' || s.state === 'PAID') && (
        <Banner tone="warn" live={false}>
          {t('subscription.autoPayFailedLong')}
        </Banner>
      )}

      <Card className="flex flex-col gap-2">
        <p className="text-sm text-muted">{t('subscription.forYourSalon')}</p>
        <p className="text-2xl font-bold">{t('subscription.priceAMonth', { price })}</p>
        {s.state === 'NONE' ? (
          <p className="text-sm text-muted">{t('subscription.freeOnceApproved')}</p>
        ) : (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t('subscription.now')}</dt>
            <dd className="font-medium">{stateWords(s)}</dd>
            <dt className="text-muted">{t('subscription.freeTrialLabel')}</dt>
            <dd>{t('subscription.untilDay', { day: dayIst(s.trialEndsAt!) })}</dd>
            {s.paidUntil && (
              <>
                <dt className="text-muted">{t('subscription.paidUntilLabel')}</dt>
                <dd>{dayIst(s.paidUntil)}</dd>
              </>
            )}
          </dl>
        )}
      </Card>

      {suspended ? null : owner ? (
        outcome?.kind === 'checking' && !autoPayNow ? null : (
          <OwnerActions s={s} busy={busy} problem={problem} onPay={() => void pay()} />
        )
      ) : (
        <Card>
          <p className="text-sm text-muted">
            {ownerName ? t('subscription.onlyOwnerPaysNamed', { name: ownerName }) : t('subscription.onlyOwnerPays')}
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-1 text-sm">
        <p className="font-medium">{t('subscription.goodToKnow')}</p>
        <ul className="ml-5 list-disc text-muted">
          <li>{t('subscription.goodFree')}</li>
          <li>{t('subscription.goodTold')}</li>
          <li>{t('subscription.goodStop')}</li>
          <li>{t('subscription.goodNoRefund')}</li>
        </ul>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <Link to="/refunds" className="text-link underline">{t('subscription.refundPolicy')}</Link>
          <Link to="/terms" className="text-link underline">{t('subscription.terms')}</Link>
          <Link to={writeToUs} className="text-link underline">{t('subscription.askUs')}</Link>
        </div>
      </Card>
    </div>
  )
}

/** The state in words, for the card. */
function stateWords(s: SubscriptionView): string {
  switch (s.state) {
    case 'AUTOPAY':
      return t('subscription.stateAutoPay')
    case 'TRIAL':
      return t('subscription.stateTrial')
    case 'PAID':
      return t('subscription.statePaid')
    case 'GRACE':
      return s.enforced ? t('subscription.stateNotPaidPayBy', { day: payByDay(s) }) : t('subscription.stateNotPaid')
    case 'HIDDEN':
      return s.enforced ? t('subscription.stateHidden') : t('subscription.stateNotPaid')
    default:
      return ''
  }
}

function OwnerActions({ s, busy, problem, onPay }: { s: SubscriptionView; busy: boolean; problem: string | null; onPay: () => void }) {
  const t = useT()
  const lang = useLanguage()
  // Printed as it is ("₹1500"), not grouped
  const price = String(s.pricePerMonth)
  if (s.state === 'NONE') {
    return (
      <Card>
        <p className="text-sm text-muted">{t('subscription.nothingToPayYet')}</p>
      </Card>
    )
  }
  if (s.state === 'AUTOPAY') {
    return (
      <Card>
        <p className="text-sm text-muted">
          {s.accessUntil ? t('subscription.autoPayNothingToDoNext', { price, day: dayIst(s.accessUntil) }) : t('subscription.autoPayNothingToDo')}
        </p>
      </Card>
    )
  }
  if (!s.paymentsReady) {
    return <Banner tone="info">{t('subscription.payingNotReady')}</Banner>
  }
  const later = (s.state === 'TRIAL' || s.state === 'PAID') && Date.parse(s.accessUntil!) > Date.now() + 15 * 60_000
  return (
    <div className="flex flex-col gap-2">
      {problem && <Banner tone="bad">{problem}</Banner>}
      {/* Razorpay's screen has no Indian languages: say what to tap there before it opens */}
      {lang !== 'en' && <p className="text-sm">{t('subscription.nextScreenEnglish')}</p>}
      <Button busy={busy} onClick={onPay}>
        {later ? t('subscription.setUpAutoPay') : t('subscription.payPrice', { price })}
      </Button>
      <p className="text-center text-sm text-muted">
        {later
          ? t('subscription.approveOnce', { price, day: dayIst(s.accessUntil!) })
          : t('subscription.payNowThenMonthly', { price })}
      </p>
      {s.testMode && <p className="text-center text-xs text-muted">{t('subscription.testMode')}</p>}
    </div>
  )
}
