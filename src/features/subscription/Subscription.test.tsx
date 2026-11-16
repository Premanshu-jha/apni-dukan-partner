import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { SubscriptionView } from '../../api/types'
import { SubscriptionBanner } from './SubscriptionBanner'
import { SubscriptionPage } from './SubscriptionPage'
import { daysLeft, payByDay, summary } from './text'

const state = vi.hoisted(() => ({
  sub: null as SubscriptionView | null,
  role: 'OWNER' as 'OWNER' | 'HELPER' | 'BARBER',
  checkout: vi.fn(),
  confirm: vi.fn(),
  pay: vi.fn(),
}))

vi.mock('../../api/shop', async (orig) => ({
  ...(await orig<typeof import('../../api/shop')>()),
  useShop: () => ({
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
    startCheckout: () => state.checkout(),
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
