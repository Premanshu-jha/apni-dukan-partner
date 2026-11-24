import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { SubscriptionView } from '../../api/types'
import { ApiError } from '../../api/errors'
import { SubscriptionBanner } from './SubscriptionBanner'
import { SubscriptionPage } from './SubscriptionPage'
import { daysLeft, payByDay, summary } from './text'

const state = vi.hoisted(() => ({
  sub: null as SubscriptionView | null,
  role: 'OWNER' as 'OWNER' | 'HELPER' | 'BARBER',
  checkout: vi.fn(),
  confirm: vi.fn(),
  pay: vi.fn(),
  app: false,
  choose: vi.fn(),
  googlePlay: vi.fn(),
  unconfirmed: vi.fn(),
}))

vi.mock('../../lib/playBilling', async (orig) => ({
  ...(await orig<typeof import('../../lib/playBilling')>()),
  chooseInApp: (...a: unknown[]) => state.choose(...a),
  unconfirmedPurchases: (...a: unknown[]) => state.unconfirmed(...a),
  onLatePurchase: () => () => {},
}))

vi.mock('../../lib/platform', () => ({ isApp: () => state.app }))

vi.mock('../../api/shop', async (orig) => ({
  ...(await orig<typeof import('../../api/shop')>()),
  useShop: () => ({
    id: 'shop1',
    name: 'Style Studio',
    ownerName: 'Ramesh',
    myRole: state.role,
    status: 'APPROVED',
  }),
}))
vi.mock('../../api/subscription', async (orig) => {
  const { useQuery } = await import('@tanstack/react-query')
  return {
    ...(await orig<typeof import('../../api/subscription')>()),
    // A real query over state.sub, so the page's cache updates (setQueryData) show as in the app
    useSubscription: () =>
      useQuery({
        queryKey: ['shop', 'subscription'],
        queryFn: async () => state.sub,
        initialData: state.sub ?? undefined,
      }),
    startCheckout: (token?: string) => state.checkout(token),
    confirmGooglePlay: (token: string) => state.googlePlay(token),
    confirmPayment: (a: unknown) => state.confirm(a),
  }
})
vi.mock('../../lib/razorpay', async (orig) => ({
  ...(await orig<typeof import('../../lib/razorpay')>()),
  payWithRazorpay: (c: unknown, stillWanted?: () => boolean) => state.pay(c, stillWanted),
}))

const DAY = 86_400_000
const iso = (ms: number) => new Date(Date.now() + ms).toISOString()

function sub(over: Partial<SubscriptionView>): SubscriptionView {
  return {
    state: 'TRIAL',
    trialEndsAt: iso(20 * DAY),
    paidUntil: null,
    accessUntil: iso(20 * DAY),
    hiddenFrom: iso(23 * DAY),
    razorpayStatus: null,
    pricePerMonth: 500,
    enforced: true,
    canPay: true,
    paymentsReady: true,
    testMode: false,
    ...over,
  }
}

function show(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.app = false
  state.choose.mockReset()
  state.googlePlay.mockReset()
  state.unconfirmed.mockReset()
  state.unconfirmed.mockResolvedValue([])
  state.role = 'OWNER'
  state.checkout.mockReset()
  state.confirm.mockReset()
  state.pay.mockReset()
})

describe('the subscription line', () => {
  it('says where the salon stands in every state', () => {
    expect(summary(sub({ state: 'NONE' }))).toMatch(
      /Free for 30 days once our field team approves your salon, then ₹500 a month/,
    )
    expect(summary(sub({ state: 'TRIAL' }))).toMatch(/^Free trial until /)
    expect(summary(sub({ state: 'AUTOPAY' }))).toMatch(/^AutoPay on: ₹500 a month, next on /)
    expect(summary(sub({ state: 'PAID' }))).toMatch(/^Paid until /)
    expect(summary(sub({ state: 'GRACE' }))).toMatch(/^Free trial ended: pay by .* to stay visible$/)
    expect(summary(sub({ state: 'GRACE', autoPayFailed: true }))).toMatch(/^Payment failed: pay by /)
    expect(summary(sub({ state: 'HIDDEN' }))).toBe("Not paid: customers can't find your salon")
    // Before live payments nothing is hidden: it doesn't say so
    expect(summary(sub({ state: 'HIDDEN', enforced: false }))).toBe('Not paid: pay ₹500 to keep your salon on Clozest')
  })

  it('"pay by" is the grace’s last day: hidden from the midnight after it, India time', () => {
    // Hidden from 14 Dec 00:00 IST (13 Dec 18:30 UTC): pay by 13 Dec
    expect(payByDay(sub({ hiddenFrom: '2026-12-13T18:30:00Z' }))).toBe('13 Dec 2026')
  })

  it('counts the days left', () => {
    const now = new Date('2026-11-10T04:30:00Z')
    expect(daysLeft('2026-11-17T04:30:00Z', now)).toBe(7)
    expect(daysLeft('2026-11-10T04:29:00Z', now)).toBe(0)
  })
})

describe('the banner on Today', () => {
  it('stays quiet in the trial until its last week, and while AutoPay is on', () => {
    state.sub = sub({})
    const { container, rerender } = show(<SubscriptionBanner />)
    expect(container).toBeEmptyDOMElement()
    state.sub = sub({ state: 'AUTOPAY', accessUntil: iso(2 * DAY) })
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SubscriptionBanner />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('reminds the owner in the last week, with a link to pay', () => {
    state.sub = sub({ accessUntil: iso(5 * DAY) })
    show(<SubscriptionBanner />)
    expect(screen.getByText(/Your free trial ends on .* nothing taken before then/)).toBeInTheDocument()
    // Setting up AutoPay, not paying: the link says so
    expect(screen.getByRole('link', { name: 'Set up AutoPay' })).toHaveAttribute('href', '/subscription')
  })

  it('tells the owner at once when an AutoPay payment failed', () => {
    state.sub = sub({ autoPayFailed: true })
    show(<SubscriptionBanner />)
    expect(screen.getByText(/Your AutoPay payment didn't go through/)).toBeInTheDocument()
  })

  it('helpers are asked to remind the owner once it has ended, and told when customers can’t find the salon', () => {
    state.role = 'HELPER'
    state.sub = sub({ state: 'TRIAL', accessUntil: iso(3 * DAY) })
    const { container, unmount } = show(<SubscriptionBanner />)
    expect(container).toBeEmptyDOMElement()
    unmount()
    state.sub = sub({
      state: 'GRACE',
      accessUntil: iso(-DAY),
      hiddenFrom: iso(2 * DAY),
    })
    const grace = show(<SubscriptionBanner />)
    expect(
      screen.getByText(/Ask Ramesh to pay the Clozest subscription by .*, or customers won't find the salon/),
    ).toBeInTheDocument()
    grace.unmount()
    state.sub = sub({
      state: 'HIDDEN',
      accessUntil: iso(-4 * DAY),
      hiddenFrom: iso(-DAY),
    })
    show(<SubscriptionBanner />)
    // A standing state: shown, not announced as an alert each time Today opens
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByText(/Customers can't find Style Studio until Ramesh pays the Clozest subscription/),
    ).toBeInTheDocument()
  })
})

describe('the subscription page', () => {
  it('lets the owner set up AutoPay during the trial and shows it on once Razorpay answers', async () => {
    state.sub = sub({})
    state.checkout.mockResolvedValue({
      keyId: 'rzp_test_1',
      subscriptionId: 'sub_1',
      firstChargeAt: '2026-12-10T04:30:00Z',
    })
    state.pay.mockResolvedValue({
      razorpay_payment_id: 'pay_1',
      razorpay_subscription_id: 'sub_1',
      razorpay_signature: 'sig',
    })
    state.confirm.mockImplementation(async () => {
      state.sub = sub({ state: 'AUTOPAY', canPay: false })
      return state.sub
    })
    show(<SubscriptionPage />)
    expect(screen.getByText('₹500 a month')).toBeInTheDocument()
    expect(screen.getByText(/Nothing is taken today: the first ₹500 on/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set up AutoPay' }))
    await waitFor(() =>
      expect(
        screen.getByText(/AutoPay is on\. Nothing is taken today; the first ₹500 on 10 Dec 2026/),
      ).toBeInTheDocument(),
    )
    expect(state.confirm).toHaveBeenCalledWith({
      razorpayPaymentId: 'pay_1',
      razorpaySubscriptionId: 'sub_1',
      razorpaySignature: 'sig',
    })
  })

  it('after the trial asks to pay ₹500 now, and says so when the payment fails', async () => {
    const { CheckoutStopped } = await import('../../lib/razorpay')
    state.sub = sub({
      state: 'GRACE',
      accessUntil: iso(-DAY),
      hiddenFrom: iso(2 * DAY),
    })
    state.checkout.mockResolvedValue({ keyId: 'k', subscriptionId: 'sub_1' })
    state.pay.mockRejectedValue(new CheckoutStopped('FAILED', 'Your bank declined it.'))
    show(<SubscriptionPage />)
    expect(
      screen.getByText(/Your free trial has ended\. Pay by .*, or customers won't find your salon from the next day/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Your bank declined it. If money was taken anyway, it shows here within a few minutes.',
      ),
    )
    expect(state.confirm).not.toHaveBeenCalled()
  })

  it('approved at Razorpay but not confirmed here (network): no Pay button, and Check again sends the same answer', async () => {
    state.sub = sub({
      state: 'GRACE',
      accessUntil: iso(-DAY),
      hiddenFrom: iso(2 * DAY),
    })
    state.checkout.mockResolvedValue({
      keyId: 'k',
      subscriptionId: 'sub_1',
      firstChargeAt: null,
    })
    state.pay.mockResolvedValue({
      razorpay_payment_id: 'pay_1',
      razorpay_subscription_id: 'sub_1',
      razorpay_signature: 'sig',
    })
    state.confirm.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() =>
      expect(screen.getByText(/We're checking it with Razorpay: please don't pay again/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Pay ₹500' })).toBeNull()
    state.confirm.mockImplementation(async () => {
      state.sub = sub({ state: 'AUTOPAY', canPay: false })
      return state.sub
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.getByText(/AutoPay is on: ₹500 is being paid now/)).toBeInTheDocument())
    expect(state.confirm).toHaveBeenLastCalledWith({
      razorpayPaymentId: 'pay_1',
      razorpaySubscriptionId: 'sub_1',
      razorpaySignature: 'sig',
    })
  })

  it('leaving the page while the payment screen loads: it never opens over another screen', async () => {
    const { CheckoutStopped } = await import('../../lib/razorpay')
    const opened = vi.fn()
    let loaded: () => void = () => {}
    state.sub = sub({ state: 'GRACE', accessUntil: iso(-DAY), hiddenFrom: iso(2 * DAY) })
    state.checkout.mockResolvedValue({ keyId: 'k', subscriptionId: 'sub_1', firstChargeAt: null })
    state.pay.mockImplementation(async (c: unknown, stillWanted: () => boolean) => {
      await new Promise<void>((r) => (loaded = r)) // the script still loading
      if (!stillWanted()) throw new CheckoutStopped('CLOSED', 'Left the page')
      opened(c)
      return new Promise(() => {})
    })
    const { unmount } = show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(state.pay).toHaveBeenCalled())
    unmount()
    loaded()
    await new Promise((r) => setTimeout(r, 0))
    expect(opened).not.toHaveBeenCalled()
  })

  it('closing the checkout says nothing; the owner can tap again', async () => {
    const { CheckoutStopped } = await import('../../lib/razorpay')
    state.sub = sub({
      state: 'GRACE',
      accessUntil: iso(-DAY),
      hiddenFrom: iso(2 * DAY),
    })
    state.checkout.mockResolvedValue({ keyId: 'k', subscriptionId: 'sub_1' })
    state.pay.mockRejectedValue(new CheckoutStopped('CLOSED', 'Closed'))
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay ₹500' })).toBeEnabled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a helper sees it but nothing to pay; before payments are set up the owner is told', () => {
    state.role = 'HELPER'
    state.sub = sub({ canPay: false })
    const { unmount } = show(<SubscriptionPage />)
    expect(screen.getByText('Only the owner pays (Ramesh). Helpers and barbers pay nothing.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /AutoPay|Pay/ })).toBeNull()
    unmount()
    state.role = 'OWNER'
    state.sub = sub({ paymentsReady: false, canPay: false })
    show(<SubscriptionPage />)
    expect(screen.getByText(/Paying in the app isn't available yet/)).toBeInTheDocument()
  })
})

describe('in the Play Store app before in-app paying is set up (status only)', () => {
  it('the owner sees the plan and until when it is paid, but no Pay or AutoPay button and nothing about Razorpay', () => {
    state.app = true
    for (const s of [sub({}), sub({ state: 'GRACE' }), sub({ state: 'HIDDEN' }), sub({ state: 'PAID', paidUntil: iso(10 * DAY) })]) {
      state.sub = s
      const { unmount } = show(<SubscriptionPage />)
      expect(screen.getByText('₹500 a month')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /AutoPay|Pay/ })).toBeNull()
      expect(screen.queryByText(/Razorpay|isn't available yet|English/)).toBeNull()
      unmount()
    }
    expect(state.checkout).not.toHaveBeenCalled()
  })

  it('still says AutoPay is on, and that nothing is due before approval', () => {
    state.app = true
    state.sub = sub({ state: 'AUTOPAY', accessUntil: iso(9 * DAY) })
    const { unmount } = show(<SubscriptionPage />)
    expect(screen.getByText(/AutoPay is on/)).toBeInTheDocument()
    unmount()
    state.sub = sub({ state: 'NONE' })
    show(<SubscriptionPage />)
    expect(screen.queryByRole('button', { name: /AutoPay|Pay/ })).toBeNull()
  })

  it('the banner on Today links to the details, never to pay', () => {
    state.app = true
    state.sub = sub({ accessUntil: iso(5 * DAY) })
    const { unmount } = show(<SubscriptionBanner />)
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/subscription')
    expect(screen.queryByRole('link', { name: /AutoPay|Pay/ })).toBeNull()
    unmount()
    state.sub = sub({ state: 'GRACE' })
    show(<SubscriptionBanner />)
    expect(screen.queryByRole('link', { name: /Pay now/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Details' })).toBeInTheDocument()
  })
})

describe('paying in the Play Store app (user choice billing)', () => {
  const inApp = (over: Partial<SubscriptionView> = {}) => sub({ inAppProductId: 'clozest_salon_monthly', ...over })
  /** The trial ended yesterday: the app offers paying (Google Play and Razorpay from the app charge at once). */
  const due = (over: Partial<SubscriptionView> = {}) =>
    inApp({ state: 'GRACE', accessUntil: iso(-DAY), hiddenFrom: iso(2 * DAY), inAppPayFrom: iso(-DAY), ...over })

  it('during the free trial: nothing to pay, and from which day the app offers it; no button', () => {
    state.app = true
    state.sub = inApp({ inAppPayFrom: iso(20 * DAY) })
    const { unmount } = show(<SubscriptionPage />)
    expect(screen.getByText(/Nothing to pay now\. You can pay here from/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /AutoPay|Pay/ })).toBeNull()
    unmount()
    // Today's banner in the last week: from when, and the details (no "set up now")
    state.sub = inApp({ accessUntil: iso(5 * DAY), inAppPayFrom: iso(5 * DAY) })
    show(<SubscriptionBanner />)
    expect(screen.getByText(/From then, pay ₹500 a month here/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/subscription')
  })

  it('Razorpay picked on Google’s choice screen: said before it opens, then Razorpay’s checkout with Google’s token', async () => {
    state.app = true
    state.sub = due()
    state.choose.mockResolvedValue({ choice: 'RAZORPAY', externalTransactionToken: 'ext-1' })
    state.checkout.mockResolvedValue({ keyId: 'k', subscriptionId: 'sub_1', firstChargeAt: null })
    state.pay.mockResolvedValue({ razorpay_payment_id: 'pay_1', razorpay_subscription_id: 'sub_1', razorpay_signature: 'sig' })
    state.confirm.mockImplementation(async () => {
      state.sub = due({ state: 'AUTOPAY', canPay: false })
      return state.sub
    })
    show(<SubscriptionPage />)
    expect(screen.getByText(/Google asks how you want to pay: Razorpay \(UPI AutoPay\) or Google Play/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByText(/AutoPay is on: ₹500 is being paid now/)).toBeInTheDocument())
    expect(state.choose).toHaveBeenCalledWith('clozest_salon_monthly', 'shop1')
    expect(state.checkout).toHaveBeenCalledWith('ext-1')
  })

  it('Google Play picked: the purchase goes to the backend and the page says it is done; Razorpay never opens', async () => {
    state.app = true
    state.sub = due()
    state.choose.mockResolvedValue({ choice: 'GOOGLE_PLAY', purchaseToken: 'gp-1' })
    state.googlePlay.mockResolvedValue(due({ state: 'AUTOPAY', canPay: false, googlePlay: true }))
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByText(/your subscription is with Google Play/)).toBeInTheDocument())
    expect(state.googlePlay).toHaveBeenCalledWith('gp-1')
    expect(state.checkout).not.toHaveBeenCalled()
    expect(state.pay).not.toHaveBeenCalled()
    // Changed or stopped in the Play Store: one tap there, and Good to know says so
    expect(screen.getByRole('link', { name: 'Manage in Play Store' })).toHaveAttribute(
      'href',
      'https://play.google.com/store/account/subscriptions?sku=clozest_salon_monthly&package=com.clozest.partner',
    )
    expect(screen.getByText(/To stop AutoPay: tap Manage in Play Store/)).toBeInTheDocument()
  })

  it('a slow Google Play payment (pending) is never called done, and Pay is gone meanwhile', async () => {
    state.app = true
    state.sub = due()
    state.choose.mockResolvedValue({ choice: 'GOOGLE_PLAY', purchaseToken: 'gp-2', pending: true })
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByText(/Google Play is still confirming your payment/)).toBeInTheDocument())
    expect(screen.queryByText(/your subscription is with Google Play/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pay ₹500' })).toBeNull()
    expect(state.googlePlay).not.toHaveBeenCalled()
  })

  it('Google charged but our confirm failed (network): "checking", never pay again; Check again sends the same purchase', async () => {
    state.app = true
    state.sub = due()
    state.choose.mockResolvedValue({ choice: 'GOOGLE_PLAY', purchaseToken: 'gp-3' })
    state.googlePlay.mockRejectedValueOnce(new Error('offline'))
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByText(/Google Play has your payment\. We're confirming it/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Pay ₹500' })).toBeNull()
    state.googlePlay.mockResolvedValueOnce(due({ state: 'AUTOPAY', canPay: false, googlePlay: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.getByText(/your subscription is with Google Play/)).toBeInTheDocument())
    expect(state.googlePlay).toHaveBeenLastCalledWith('gp-3')
  })

  it('a purchase on the phone the backend never got is confirmed when the page opens, and "already owned" finds it too', async () => {
    state.app = true
    state.sub = due()
    state.unconfirmed.mockResolvedValue([{ purchaseToken: 'gp-lost' }])
    state.googlePlay.mockResolvedValue(due({ state: 'AUTOPAY', canPay: false, googlePlay: true }))
    const { unmount } = show(<SubscriptionPage />)
    await waitFor(() => expect(state.googlePlay).toHaveBeenCalledWith('gp-lost'))
    unmount()
    // Pay tapped, Google says it is owned already: that purchase is confirmed, no second payment
    state.unconfirmed.mockResolvedValueOnce([]).mockResolvedValueOnce([{ purchaseToken: 'gp-owned' }])
    state.choose.mockRejectedValueOnce(Object.assign(new Error('owned'), { code: 'ALREADY_OWNED' }))
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(state.googlePlay).toHaveBeenCalledWith('gp-owned'))
    expect(screen.queryByText(/Couldn't open the payment screen/)).toBeNull()
  })

  it('"already owned" with nothing to confirm on this phone (another salon, or one replaced) says where to look', async () => {
    state.app = true
    state.sub = due()
    state.choose.mockRejectedValueOnce(Object.assign(new Error('owned'), { code: 'ALREADY_OWNED' }))
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already pays for a Clozest subscription/))
  })

  it('a purchase found on the phone that the salon no longer has (replaced) says nothing when the page opens', async () => {
    state.app = true
    state.sub = due()
    state.unconfirmed.mockResolvedValue([{ purchaseToken: 'gp-old' }])
    state.googlePlay.mockRejectedValue(new ApiError(409, { code: 'PLAY_PURCHASE_TAKEN', message: 'Taken' }))
    show(<SubscriptionPage />)
    await waitFor(() => expect(state.googlePlay).toHaveBeenCalledWith('gp-old'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pay ₹500' })).toBeInTheDocument()
  })

  it('closing Google’s choice screen says nothing; a failed Google Play payment and no Google Play each say what happened', async () => {
    state.app = true
    state.sub = due()
    state.choose.mockResolvedValueOnce({ choice: 'CANCELLED' })
    show(<SubscriptionPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(state.choose).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(state.checkout).not.toHaveBeenCalled()
    state.choose.mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'ERROR_6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/didn't go through, so nothing was taken/))
    state.choose.mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'BILLING_UNAVAILABLE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pay ₹500' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/isn't available on this phone/))
  })

  it('Google Play couldn’t take a renewal: the page and Today send the owner to the Play Store, not the UPI app', () => {
    state.app = true
    state.sub = due({ state: 'AUTOPAY', googlePlay: true, autoPayFailed: true, accessUntil: iso(DAY) })
    const { unmount } = show(<SubscriptionPage />)
    expect(screen.getByText(/Google Play couldn't take this month's payment/)).toBeInTheDocument()
    expect(screen.queryByText(/Check your bank or UPI app/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Manage in Play Store' })).toBeInTheDocument()
    unmount()
    show(<SubscriptionBanner />)
    expect(screen.getByText(/Google Play couldn't take this month's payment/)).toBeInTheDocument()
  })

  it('the banner on Today links to paying once the trial is over', () => {
    state.app = true
    state.sub = due()
    show(<SubscriptionBanner />)
    expect(screen.getByRole('link', { name: /Pay/ })).toHaveAttribute('href', '/subscription')
  })

  it('before in-app paying is set up, the owner is told and can write to us (not a page with nothing to do)', () => {
    state.app = true
    state.sub = sub({ state: 'GRACE', accessUntil: iso(-DAY), hiddenFrom: iso(2 * DAY) })
    show(<SubscriptionPage />)
    expect(screen.getByText(/Paying from this app isn't open yet/)).toBeInTheDocument()
    // Right under that line, not only in Good to know further down
    expect(screen.getAllByRole('link', { name: 'Ask us' })).toHaveLength(2)
  })
})
