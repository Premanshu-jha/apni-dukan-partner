import type { BrowserContext, Page } from '@playwright/test'
import { istInstant, todayIst, type MockApi } from './mockApi'
import { atSalon, expect, languageKept, test } from './helpers'

/** 11 am today on the page and in the fake backend, whatever the hour the test runs at. */
async function at11(page: Page, api: MockApi) {
  const t = new Date(istInstant(todayIst(), '11:00'))
  await page.clock.setFixedTime(t)
  api.nowMs = t.getTime()
}

/** The language chosen and every good-to-do setup step skipped on this phone: Today has room for one growth card. */
async function setupDone(page: Page, context: BrowserContext, api: MockApi) {
  await languageKept(context)
  const key = `adp.guide.skips.${api.user.id}.${(api.shop as { id: string }).id}`
  const tips = `adp.guide.tips.OWNER.${api.user.id}`   // the first-time tips seen
  await context.addInitScript(([k, seen]) => {
    localStorage.setItem(k, JSON.stringify(['allBarbers', 'notifications', 'team', 'share', 'offer']))
    localStorage.setItem(seen, '1')
  }, [key, tips])
  await page.reload()
}

test('everyone busy: a barber’s next free time is kept for the walk-in customer, with an SMS to their mobile', async ({ page, context, api }) => {
  await at11(page, api)
  await atSalon(page, context, api)
  await page.getByRole('button', { name: '+ Walk-in, Customer at the door' }).click()
  // What it is, said at the top
  await expect(page.getByText('For a customer at your door without a booking.')).toBeVisible()
  await page.getByLabel(/Haircut/).check()
  // Imran is busy now: his free time can be kept
  await page.getByRole('button', { name: /Imran.*free at 4:30 PM.*Keep this time/ }).click()
  await expect(page.getByText('Imran is free at 4:30 PM. Tell the customer to come back then: the time is kept for them, so nobody can book it online.')).toBeVisible()
  await page.getByLabel("Customer's name (optional)").fill('Amit')
  const phone = page.getByLabel("Customer's mobile (optional)")
  await expect(page.getByText('They get an SMS with the time: 4:30 PM.')).toBeVisible()
  // A wrong number is caught on the spot, with what to do
  await phone.fill('12345')
  await page.getByRole('button', { name: 'Keep 4:30 PM with Imran' }).click()
  await expect(page.getByText('Check the mobile number: 10 digits, starting with 6, 7, 8 or 9. Or leave it empty.')).toBeVisible()
  await phone.fill('+91 98480 12345')
  await page.getByRole('button', { name: 'Keep 4:30 PM with Imran' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  const add = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/salon/walk-ins').at(-1)!
  expect(add.body).toMatchObject({ serviceIds: ['v1'], staffId: 'st2', name: 'Amit', phone: '9848012345' })
  expect(typeof (add.body as { startAt: string }).startAt).toBe('string')
  expect(api.walkInTexts).toHaveLength(1)
  // Today says what to tell the customer; on the board at its time, waiting for them
  await expect(page.getByText('Kept 4:30 PM with Imran. Tell the customer to come at 4:30 PM.')).toBeVisible()
  await expect(page.getByText('Amit')).toBeVisible()
  // Said once: not again after a reload
  await page.reload()
  await expect(page.getByText('Amit')).toBeVisible()
  await expect(page.getByText(/^Kept 4:30 PM with Imran/)).toHaveCount(0)
})

test('no SMS set up: the walk-in screen doesn’t ask for a mobile number; nobody free at all says what to do', async ({ page, context, api }) => {
  api.walkInSms = false
  await atSalon(page, context, api)
  await page.goto('/salon/walk-in')
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: /Imran.*Keep this time/ }).click()
  await expect(page.getByRole('button', { name: 'Keep 4:30 PM with Imran' })).toBeVisible()
  await expect(page.getByLabel("Customer's mobile (optional)")).toHaveCount(0)
})

test('Today says the day at a glance, whether bookings ring this phone, and on a slow day one tap to share the salon', async ({ page, context, api }) => {
  // 11 am, whatever the hour the test runs at: the share card is put away after 6 pm
  await at11(page, api)
  await atSalon(page, context, api)
  await setupDone(page, context, api)
  // Nothing more booked today: the share card, put away for the day with "Not today"
  await expect(page.getByRole('status').filter({ hasText: 'No more bookings today' })).toBeVisible()
  const share = page.getByText('Few bookings today?')
  await expect(share).toBeVisible()
  await expect(page.getByRole('link', { name: 'Share my salon' })).toHaveAttribute('href', '/salon/share')
  await page.getByRole('button', { name: 'Not today' }).click()
  await expect(share).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(share).toHaveCount(0)

  // Bookings later today: how many are left and the next one
  api.addBooking({ startsAt: istInstant(todayIst(), '12:00'), serviceIds: ['v1'] })
  api.addBooking({ startsAt: istInstant(todayIst(), '13:00'), serviceIds: ['v1'] })
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: /2 bookings still to come today · next at 12:00 PM with / })).toBeVisible()
})

test('the owner’s “Get found on Google Maps too” card: Google’s page one tap away, and put away for good', async ({ page, context, api }) => {
  api.googleMissing = true
  await atSalon(page, context, api)
  await setupDone(page, context, api)
  await expect(page.getByText('Get found on Google Maps too')).toBeVisible()
  await expect(page.getByText(/can't see your salon yet/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add my salon to Google' })).toHaveAttribute('href', 'https://business.google.com/create')
  // Not with the share card at once: one growth card at a time
  await expect(page.getByText('Few bookings today?')).toHaveCount(0)
  await page.getByRole('button', { name: "I've added it" }).click()
  await expect(page.getByText('Get found on Google Maps too')).toHaveCount(0)
  expect(api.googleAnswer).toBe('ADDED')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByText('Get found on Google Maps too')).toHaveCount(0)
})

test('a barber never sees the Google card (it is the owner’s to add)', async ({ page, context, api }) => {
  api.googleMissing = true
  await atSalon(page, context, api, 'BARBER')
  await expect(page.getByText('Get found on Google Maps too')).toHaveCount(0)
})

test('the You tab keeps only what is rare; the morning and evening messages switch off there', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'You', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'You', exact: true })).toBeVisible()
  // The salon's pages are in the Salon tab, not here too
  for (const name of ['Services and prices', 'Opening hours', 'Barbers', 'Offers', 'Ratings']) {
    await expect(page.getByRole('main').getByRole('link', { name, exact: true })).toHaveCount(0)
  }
  const morning = page.getByRole('switch', { name: "Morning (8 am): today's bookings" })
  await expect(morning).toBeChecked()
  await morning.click()
  await expect(morning).not.toBeChecked()
  expect(api.summaries).toEqual({ morning: false, evening: true })
})
