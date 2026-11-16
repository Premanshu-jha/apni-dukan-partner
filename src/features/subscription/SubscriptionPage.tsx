import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { confirmPayment, type PaymentAnswer, startCheckout, subscriptionKeys, useSubscription } from '../../api/subscription'
import { isApiError, messageOf } from '../../api/errors'
import type { SubscriptionView } from '../../api/types'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, ErrorState, Loading, Page } from '../../components/ui'
import { CheckoutStopped, payWithRazorpay } from '../../lib/razorpay'
import { screensBehind } from '../../lib/nav'
import { dayIst, payByDay, whatEnded } from './text'

/** After a checkout, the page reads the subscription every 5 seconds for this long (Razorpay's word may lag). */
const WATCH_MS = 90_000

/**
 * The salon's subscription: what it costs, until when it is paid, and (the owner) the button that opens Razorpay's
 * checkout: approve AutoPay once with the UPI PIN (or pay by card or netbanking).
 */
export function SubscriptionPage() {
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
    <Page title="Subscription" back={screensBehind() > 0 ? true : '/more'} backReplace>
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
          setProblem(`${e.message} If money was taken anyway, it shows here within a few minutes.`)
        } else if (e.reason === 'LOAD') {
          setProblem("Couldn't open the payment screen. Check your internet and try again.")
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
            ? `AutoPay is on. Nothing is taken today; the first ₹${s.pricePerMonth} on ${dayIst(outcome.firstOn)}, then each month.`
            : `AutoPay is on: ₹${s.pricePerMonth} is being paid now, then each month. Customers can find your salon as soon as it's through (usually a minute).`}
        </Banner>
      )}
      {outcome?.kind === 'checking' && !autoPayNow && (
        <Banner tone="info">
          <p>You approved the payment. We're checking it with Razorpay: please don't pay again.</p>
          <Button variant="secondary" busy={busy} onClick={() => void checkAgain(outcome.answer)}>
            Check again
          </Button>
        </Banner>
      )}
      {suspended && (
        <Banner tone="warn" live={false}>
          Our team has suspended your salon; paying doesn't change that. <Link to="/help" className="underline">Ask us</Link>{' '}
          what to fix.
        </Banner>
      )}
      {s.state === 'HIDDEN' && s.enforced && (
        <Banner tone="bad" live={false}>
          Customers can't find your salon on Clozest and it takes no new online bookings until it's paid. Bookings
          already made stay.
        </Banner>
      )}
      {s.state === 'GRACE' && (
        <Banner tone={s.enforced ? 'warn' : 'info'} live={false}>
          {s.enforced
            ? `${whatEnded(s)}. Pay by ${payByDay(s)}, or customers won't find your salon from the next day.`
            : `${whatEnded(s)}. Please pay to keep your salon on Clozest.`}
        </Banner>
      )}
      {s.autoPayFailed && (s.state === 'TRIAL' || s.state === 'PAID') && (
        <Banner tone="warn" live={false}>
          Your AutoPay payment didn't go through. Check your bank or UPI app has money and AutoPay is on, or pay
          another way below.
        </Banner>
      )}

      <Card className="flex flex-col gap-2">
        <p className="text-sm text-muted">Clozest for your salon</p>
        <p className="text-2xl font-bold">₹{s.pricePerMonth} a month</p>
        {s.state === 'NONE' ? (
          <p className="text-sm text-muted">Free for 30 days once our field team approves your salon.</p>
        ) : (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Now</dt>
            <dd className="font-medium">{stateWords(s)}</dd>
            <dt className="text-muted">Free trial</dt>
            <dd>until {dayIst(s.trialEndsAt!)}</dd>
            {s.paidUntil && (
              <>
                <dt className="text-muted">Paid until</dt>
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
            Only the owner pays{ownerName ? ` (${ownerName})` : ''}. Helpers and barbers pay nothing.
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-1 text-sm">
        <p className="font-medium">Good to know</p>
        <ul className="ml-5 list-disc text-muted">
          <li>Customers book on Clozest for free and pay you at the salon.</li>
          <li>Your UPI app or bank tells you before each AutoPay payment.</li>
          <li>
            To stop AutoPay: in your UPI app (PhonePe, Google Pay, Paytm…) open AutoPay and cancel Clozest. Paid by card
            or netbanking? Ask us and we'll stop it. You keep the month already paid; nothing more is taken.
          </li>
          <li>Payments aren't refunded.</li>
        </ul>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <Link to="/refunds" className="text-link underline">Refund policy</Link>
          <Link to="/terms" className="text-link underline">Terms</Link>
          <Link to="/help" className="text-link underline">Ask us</Link>
        </div>
      </Card>
    </div>
  )
}

/** The state in words, for the card. */
function stateWords(s: SubscriptionView): string {
  switch (s.state) {
    case 'AUTOPAY':
      return 'AutoPay on'
    case 'TRIAL':
      return 'Free trial'
    case 'PAID':
      return 'Paid'
    case 'GRACE':
      return s.enforced ? `Not paid yet: pay by ${payByDay(s)}` : 'Not paid yet'
    case 'HIDDEN':
      return s.enforced ? "Not paid: customers can't find your salon" : 'Not paid yet'
    default:
      return ''
  }
}

function OwnerActions({ s, busy, problem, onPay }: { s: SubscriptionView; busy: boolean; problem: string | null; onPay: () => void }) {
  if (s.state === 'NONE') {
    return (
      <Card>
        <p className="text-sm text-muted">Nothing to pay yet: your free trial starts when our field team approves your salon.</p>
      </Card>
    )
  }
  if (s.state === 'AUTOPAY') {
    return (
      <Card>
        <p className="text-sm text-muted">
          AutoPay is on: nothing to do.{s.accessUntil ? ` The next ₹${s.pricePerMonth} is taken on ${dayIst(s.accessUntil)}.` : ''}
        </p>
      </Card>
    )
  }
  if (!s.paymentsReady) {
    return <Banner tone="info">Paying in the app isn't available yet. We'll tell you before anything is due.</Banner>
  }
  const later = (s.state === 'TRIAL' || s.state === 'PAID') && Date.parse(s.accessUntil!) > Date.now() + 15 * 60_000
  return (
    <div className="flex flex-col gap-2">
      {problem && <Banner tone="bad">{problem}</Banner>}
      <Button busy={busy} onClick={onPay}>
        {later ? 'Set up AutoPay' : `Pay ₹${s.pricePerMonth}`}
      </Button>
      <p className="text-center text-sm text-muted">
        {later
          ? `Approve once with your UPI PIN. Nothing is taken today: the first ₹${s.pricePerMonth} on ${dayIst(s.accessUntil!)}, then every month.`
          : `₹${s.pricePerMonth} now for the next month, then ₹${s.pricePerMonth} each month by AutoPay (stop any time). UPI, card or netbanking.`}
      </p>
      {s.testMode && <p className="text-center text-xs text-muted">Test mode: nothing real is charged.</p>}
    </div>
  )
}
