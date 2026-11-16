import { atSalon, expect, fakeRazorpay, signedIn, test } from './helpers'

const DAY = 86_400_000

test('in the trial’s last week the owner is reminded on Today, sets up AutoPay in Clozest’s checkout, and the reminder goes', async ({ page, context, api }) => {
  await fakeRazorpay(context)
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  api.subscription!.trialEndsAt = new Date(Date.now() + 5 * DAY).toISOString()
  await page.goto('/salon/day')
  await expect(page.getByText(/Your free trial ends on .* Set up AutoPay \(₹500 a month, nothing taken before then\)/)).toBeVisible()
  await page.getByRole('link', { name: 'Set up AutoPay' }).click()

  await expect(page.getByRole('heading', { name: 'Subscription' })).toBeVisible()
  await expect(page.getByText('₹500 a month', { exact: true })).toBeVisible()
  await expect(page.getByText(/Nothing is taken today: the first ₹500 on/)).toBeVisible()
  await expect(page.getByText('Test mode: nothing real is charged.')).toBeVisible()
  await page.getByRole('button', { name: 'Set up AutoPay' }).click()

  // Razorpay's checkout, opened in Clozest's name, logo and navy, the owner's details filled in
  const checkout = page.getByRole('dialog', { name: 'Razorpay checkout' })
  await expect(checkout).toContainText(/Clozest · Salon subscription: ₹500 a month, first payment on \d{1,2} [A-Z][a-z]{2} \d{4}/)
  await expect(checkout).toHaveAttribute('data-color', '#0B0F26')
  const opened = await page.evaluate(() => (window as unknown as { __rzpOpened: Array<Record<string, unknown>> }).__rzpOpened[0])
  expect(opened).toMatchObject({ key: 'rzp_test_e2e', subscription_id: 'sub_E2E1', image: 'https://partner.clozest.in/icon-512.png' })
  expect(opened.prefill).toMatchObject({ contact: api.user.phone })
  await checkout.getByRole('button', { name: 'Approve with UPI PIN' }).click()

  await expect(page.getByText(/^AutoPay is on\. Nothing is taken today; the first ₹500 on \d{1,2} [A-Z][a-z]{2} \d{4}, then each month\.$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set up AutoPay' })).toHaveCount(0)
  expect(api.calls.filter((c) => c.path === '/api/v1/shops/me/subscription/confirm').map((c) => c.body)).toEqual([
    { razorpayPaymentId: 'pay_e2e', razorpaySubscriptionId: 'sub_E2E1', razorpaySignature: 'sig:pay_e2e|sub_E2E1' },
  ])
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByText(/Your free trial ends on/)).toHaveCount(0)
})

test('after the trial: a failed payment says so, closing says nothing, and a tap again reuses the same checkout', async ({ page, context, api }) => {
  await fakeRazorpay(context)
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  api.subscription!.trialEndsAt = new Date(Date.now() - DAY).toISOString()
  await page.goto('/salon/day')
  await expect(page.getByText(/Your free trial has ended: pay by .* to stay visible to customers/)).toBeVisible()
  await page.goto('/subscription')
  await page.getByRole('button', { name: 'Pay ₹500' }).click()
  const checkout = page.getByRole('dialog', { name: 'Razorpay checkout' })
  await expect(checkout).toContainText('first payment today')
  await checkout.getByRole('button', { name: 'Make it fail' }).click()
  await checkout.getByRole('button', { name: 'Close checkout' }).click()
  await expect(page.getByRole('alert')).toHaveText('Your bank declined it. If money was taken anyway, it shows here within a few minutes.')

  await page.getByRole('button', { name: 'Pay ₹500' }).click()
  await checkout.getByRole('button', { name: 'Close checkout' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pay ₹500' })).toBeEnabled()
  // Razorpay was asked for one subscription, offered again each time
  expect(api.razorpaySubscriptionsMade).toBe(1)
})

test('a helper sees customers can’t find the salon until the owner pays, and has nothing to pay', async ({ page, context, api }) => {
  await fakeRazorpay(context)
  await atSalon(page, context, api, 'HELPER')
  api.subscription!.trialEndsAt = new Date(Date.now() - 4 * DAY).toISOString()
  await page.reload()
  await expect(page.getByText("Customers can't find Shine Unisex Salon until Ravi Kumar pays the Clozest subscription.", { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Details' }).click()
  await expect(page.getByText('Only the owner pays (Ravi Kumar). Helpers and barbers pay nothing.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Pay|AutoPay/ })).toHaveCount(0)
})

test('More shows the subscription in a line and opens it; before payments are set up the owner is told', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'OWNER')
  api.paymentsReady = false
  await page.goto('/more')
  await expect(page.getByText(/^Free trial until /)).toBeVisible()
  await page.getByRole('link', { name: 'Subscription' }).click()
  await expect(page.getByText(/Paying in the app isn't available yet/)).toBeVisible()
})

test('approved at Razorpay but the answer never reached us: no second payment offered, Check again confirms it', async ({ page, context, api }) => {
  await fakeRazorpay(context)
  await atSalon(page, context, api, 'OWNER')
  api.subscription!.trialEndsAt = new Date(Date.now() - DAY).toISOString()
  api.dropNextConfirm = true
  await page.goto('/subscription')
  await page.getByRole('button', { name: 'Pay ₹500' }).click()
  await page.getByRole('dialog', { name: 'Razorpay checkout' }).getByRole('button', { name: 'Approve with UPI PIN' }).click()
  await expect(page.getByText("You approved the payment. We're checking it with Razorpay: please don't pay again.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay ₹500' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText(/AutoPay is on: ₹500 is being paid now/)).toBeVisible()
  expect(api.razorpaySubscriptionsMade).toBe(1)
})

test('a failed AutoPay payment is shown on Today, and paying again cancels the old subscription first', async ({ page, context, api }) => {
  await fakeRazorpay(context)
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  api.subscription = { ...api.subscription!, status: 'PENDING', subscriptionId: 'sub_OLD', madeAt: Date.now() - 2 * DAY }
  await page.goto('/salon/day')
  await expect(page.getByText(/Your AutoPay payment didn't go through/)).toBeVisible()
  await page.getByRole('link', { name: 'Details' }).click()
  await expect(page.getByText(/Check your bank or UPI app has money and AutoPay is on/)).toBeVisible()
  await page.getByRole('button', { name: 'Set up AutoPay' }).click()
  await page.getByRole('dialog', { name: 'Razorpay checkout' }).getByRole('button', { name: 'Approve with UPI PIN' }).click()
  await expect(page.getByText(/^AutoPay is on\./)).toBeVisible()
  expect(api.razorpayCancelled).toEqual(['sub_OLD'])
})

test('helpers are asked to remind the owner during the 3 days, before customers lose the salon', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  api.subscription!.trialEndsAt = new Date(Date.now() - DAY).toISOString()
  await page.reload()
  await expect(page.getByText(/Ask Ravi Kumar to pay the Clozest subscription by \d{1,2} [A-Z][a-z]{2} \d{4}, or customers won't find the salon/)).toBeVisible()
})

