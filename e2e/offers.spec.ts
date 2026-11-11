import { addDays, todayIst } from './mockApi'
import { atSalon, expect, test } from './helpers'

test('the owner makes an offer for some services and hours, sees both prices and who is told, and publishes it', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, open: '10:00', close: weekday === 6 ? '18:00' : '21:00' }))
  await page.goto('/more')
  await page.getByRole('link', { name: 'Offers' }).click()
  await expect(page.getByText('No offers yet')).toBeVisible()
  await page.getByRole('link', { name: 'New offer' }).click()

  // 25% off the haircut and beard trim, the next three days, 12:00 to 16:00
  await page.getByRole('button', { name: '25%' }).click()
  await page.getByRole('switch', { name: 'All services' }).click()
  await page.getByRole('checkbox', { name: /Haircut/ }).check()
  await page.getByRole('checkbox', { name: /Beard trim/ }).check()
  await expect(page.getByRole('list', { name: 'Services in the offer' })).toContainText('₹150')   // ₹200 → ₹150
  const first = addDays(todayIst(), 1)
  await page.getByLabel('First day').fill(first)
  await page.getByLabel('Last day').fill(addDays(first, 2))
  await page.getByRole('switch', { name: 'Only some hours' }).click()
  await expect(page.getByText('Inside your opening hours:')).toContainText('Sat 10:00–18:00')
  await page.getByLabel('From', { exact: true }).fill('12:00')
  await page.getByLabel('Until', { exact: true }).fill('16:00')
  await page.getByRole('button', { name: 'See preview' }).click()

  const prices = page.getByRole('list', { name: 'Prices in the offer' })
  await expect(prices).toContainText('Haircut')
  await expect(prices).toContainText('₹200')
  await expect(prices).toContainText('₹150')
  await expect(prices).toContainText('₹75')   // beard ₹100 → ₹75
  await expect(page.getByRole('status')).toHaveText('The message goes now to 3 past customers.')
  // A change after the preview asks for a new one
  await page.getByRole('button', { name: '20%' }).click()
  await expect(page.getByRole('button', { name: 'Publish and send' })).toHaveCount(0)
  await page.getByRole('button', { name: '25%' }).click()
  await page.getByRole('button', { name: 'See preview' }).click()
  await page.getByRole('button', { name: 'Publish and send' }).click()

  await expect(page).toHaveURL(/\/salon\/offers$/)
  await expect(page.getByText('Published. 3 past customers were sent the offer.')).toBeVisible()
  const offers = page.getByRole('list', { name: 'Offers' })
  await expect(offers).toContainText('25% off')
  await expect(offers.getByText('25% off', { exact: true })).toHaveClass(/text-accent/)   // a coming-up deal is the logo's orange
  await expect(offers).toContainText('Haircut, Beard trim')
  await expect(offers).toContainText('12:00–16:00')
  await expect(offers).toContainText('Coming up')
  await expect(offers).toContainText('Sent to 3 customers · 0 bookings')
  const sent = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/salon/offers')!
  expect(sent.body).toEqual({ percentOff: 25, serviceIds: ['v1', 'v2'], startsOn: first, endsOn: addDays(first, 2), from: '12:00', until: '16:00' })
})

test("an offer's hours outside the opening hours are refused with the days named; an overlap with another offer too", async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, open: '10:00', close: '21:00' }))
  await page.goto('/salon/offers/new')
  await page.getByRole('switch', { name: 'Only some hours' }).click()
  await page.getByLabel('From', { exact: true }).fill('09:00')
  await page.getByLabel('Until', { exact: true }).fill('12:00')
  await page.getByLabel('First day').fill(addDays(todayIst(), 1))
  await page.getByLabel('Last day').fill(addDays(todayIst(), 1))
  await page.getByRole('button', { name: 'See preview' }).click()
  await expect(page.getByText(/The offer's hours must be inside your opening hours: \w+day 10:00–21:00\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Publish and send' })).toHaveCount(0)

  // Inside the hours: published; the same again overlaps
  await page.getByLabel('From', { exact: true }).fill('12:00')
  await page.getByLabel('Until', { exact: true }).fill('16:00')
  await page.getByRole('button', { name: 'See preview' }).click()
  await page.getByRole('button', { name: 'Publish and send' }).click()
  await expect(page).toHaveURL(/\/salon\/offers$/)
  await page.goto('/salon/offers/new')
  await page.getByRole('switch', { name: 'Only some hours' }).click()
  await page.getByLabel('From', { exact: true }).fill('11:00')
  await page.getByLabel('Until', { exact: true }).fill('13:00')
  await page.getByLabel('First day').fill(addDays(todayIst(), 1))
  await page.getByLabel('Last day').fill(addDays(todayIst(), 3))
  await page.getByRole('button', { name: 'See preview' }).click()
  await expect(page.getByText(/It overlaps your 20% offer \(\d+ \w{3}, 12:00–16:00\) on the same services\./)).toBeVisible()
})

test('the form checks itself before asking: a last day before the first, missing times, no service picked', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/salon/offers/new')
  const preview = page.getByRole('button', { name: 'See preview' })
  await page.getByLabel('Last day').fill(addDays(todayIst(), -1))
  await expect(page.getByText('The last day must be on or after the first day.')).toBeVisible()
  await expect(preview).toBeDisabled()
  await page.getByLabel('Last day').fill(todayIst())
  await page.getByRole('switch', { name: 'Only some hours' }).click()
  await expect(page.getByText('Pick both times, or turn off "Only some hours".')).toBeVisible()
  await page.getByRole('switch', { name: 'Only some hours' }).click()
  await page.getByRole('switch', { name: 'All services' }).click()
  await expect(page.getByText('Pick at least one service, or choose all services.')).toBeVisible()
  await expect(preview).toBeDisabled()
  expect(api.calls.some((c) => c.path.startsWith('/api/v1/salon/offers'))).toBe(false)
})

test('the owner ends a running offer early, after a second tap; a helper sees offers but cannot make or end them', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  api.offers = [
    {
      offer: { id: 'of1', percentOff: 20, allServices: true, serviceIds: [], startsOn: todayIst(), endsOn: addDays(todayIst(), 2), from: null, until: null },
      createdAt: new Date().toISOString(),
      endedAt: null,
      notified: 12,
      bookings: 4,
    },
  ]
  // A helper: the running offer, nothing to change
  await page.goto('/salon/offers')
  const offers = page.getByRole('list', { name: 'Offers' })
  await expect(offers).toContainText('Running')
  await expect(page.getByRole('link', { name: 'New offer' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'End offer now' })).toHaveCount(0)

  // The owner
  api.role = 'OWNER'
  api.shop = { ...api.shop!, myRole: 'OWNER' }
  await page.goto('/salon/offers')
  await expect(offers).toContainText('Running')
  await expect(offers).toContainText('All services')
  await expect(offers).toContainText('Sent to 12 customers · 4 bookings')
  await page.getByRole('button', { name: 'End offer now' }).click()
  // The focus follows each step (never lost to the page top)
  await expect(page.getByRole('group', { name: 'End this offer?' })).toBeFocused()
  await expect(page.getByText('Bookings already made keep the offer price.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByRole('button', { name: 'End offer now' })).toBeFocused()
  expect(api.offers[0].endedAt).toBeNull()
  await page.getByRole('button', { name: 'End offer now' }).click()
  await page.getByRole('button', { name: 'Yes, end it' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Offer ended.' })).toBeFocused()
  await expect(offers).toContainText('Ended early')
  await expect(page.getByRole('button', { name: 'End offer now' })).toHaveCount(0)
})

test('a publish whose answer was lost: tapping again goes to the list as published, not an overlap error', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/salon/offers/new')
  await page.getByLabel('First day').fill(addDays(todayIst(), 1))
  await page.getByLabel('Last day').fill(addDays(todayIst(), 1))
  await page.getByRole('button', { name: 'See preview' }).click()
  // The first tap reached the backend, but its answer never came back
  api.offers.push({ offer: { id: 'of9', percentOff: 20, allServices: true, serviceIds: [], startsOn: addDays(todayIst(), 1), endsOn: addDays(todayIst(), 1), from: null, until: null }, createdAt: new Date().toISOString(), endedAt: null, notified: 3, bookings: 0 })
  await page.getByRole('button', { name: 'Publish and send' }).click()
  await expect(page).toHaveURL(/\/salon\/offers$/)
  await expect(page.getByText('Published. 3 past customers were sent the offer.')).toBeVisible()

  // The same offer published yesterday and forgotten: not "published" again, the overlap is said
  api.offers[0].createdAt = new Date(Date.now() - 86400_000).toISOString()
  await page.goto('/salon/offers/new')
  await page.getByLabel('First day').fill(addDays(todayIst(), 1))
  await page.getByLabel('Last day').fill(addDays(todayIst(), 1))
  await page.getByRole('button', { name: 'See preview' }).click()
  await expect(page.getByText(/It overlaps your 20% offer/)).toBeVisible()
  await expect(page).toHaveURL(/\/salon\/offers\/new$/)
})

test('the booking window, the 90 days, midnight, and a salon without opening hours', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.settings = { ...api.settings, maxDaysAhead: 7 }
  await page.goto('/salon/offers/new')
  const preview = page.getByRole('button', { name: 'See preview' })
  await page.getByLabel('First day').fill(addDays(todayIst(), 8))
  await page.getByLabel('Last day').fill(addDays(todayIst(), 8))
  await expect(page.getByText(/Customers can book only so far ahead: start the offer by \d+ \w{3}\./)).toBeVisible()
  await expect(preview).toBeDisabled()
  await page.getByLabel('First day').fill(todayIst())
  await page.getByLabel('Last day').fill(addDays(todayIst(), 91))
  await expect(page.getByText('The last day can be at most 90 days from today.')).toBeVisible()
  // Until midnight: 00:00 is sent as 24:00
  await page.getByLabel('Last day').fill(addDays(todayIst(), 1))
  await page.getByRole('switch', { name: 'Only some hours' }).click()
  await page.getByLabel('From', { exact: true }).fill('20:00')
  await page.getByLabel('Until', { exact: true }).fill('00:00')
  await preview.click()
  await expect(page.getByText(/20:00–24:00/)).toBeVisible()
  const sent = api.calls.find((c) => c.path === '/api/v1/salon/offers/preview')!
  expect((sent.body as { until: string }).until).toBe('24:00')
  // A salon without its own opening hours: told, with the way there
  api.hours = []
  await page.getByLabel('From', { exact: true }).fill('19:00')
  await preview.click()
  await expect(page.getByText('Set your opening hours first.')).toBeVisible()
  await page.getByRole('link', { name: 'Set opening hours' }).click()
  await expect(page).toHaveURL(/\/setup\/hours$/)
})
