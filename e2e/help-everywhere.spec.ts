import { minutesFromNow } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

/** Reads of My requests (the Help button's dot and the help page share one cached list). */
const requestReads = (api: { calls: Array<{ method: string; path: string }> }) =>
  api.calls.filter((c) => c.method === 'GET' && c.path === '/api/v1/helpdesk/tickets').length

test.describe('on a small phone (360 px)', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('Help is at the top right of every tab and screen, beside what was there, never on top of it', async ({ page, context, api }) => {
    await atSalon(page, context, api)
    api.shop!.name = 'Sri Venkateswara Gents Beauty Parlour and Spa'
    for (const [path, heading] of [
      ['/salon/day', 'Today'],
      ['/salon/bookings', 'Bookings'],
      ['/setup', 'Salon'],
      ['/more', 'More'],
      ['/salon/walk-in', 'New walk-in'],
      ['/setup/services', 'Services and prices'],
      ['/subscription', 'Subscription'],
      ['/shop/handover', /Hand over/],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
      const help = page.getByRole('link', { name: /^Help/ })
      await expect(help, path).toBeVisible()
      const box = (await help.boundingBox())!
      expect(box.x + box.width, path).toBeLessThanOrEqual(360)
      expect(box.height, path).toBeGreaterThanOrEqual(44)
    }
    // Today: in its own row above the salon name and the bell, so the two never overlap
    await page.goto('/salon/day')
    const help = (await page.getByRole('link', { name: /^Help/ }).boundingBox())!
    const bell = (await page.getByRole('button', { name: /^Messages/ }).or(page.getByRole('link', { name: /^Messages/ })).first().boundingBox())!
    expect(help.y + help.height).toBeLessThanOrEqual(bell.y + 1)
  })

  test('the help page reads at 360 px: big Write to us, My requests, then the answers', async ({ page, context, api }) => {
    await atSalon(page, context, api)
    await page.getByRole('link', { name: /^Help/ }).click()
    await expect(page.getByRole('heading', { name: 'Need help' })).toBeVisible()
    const write = page.getByRole('button', { name: 'Write to us' })
    await expect(write).toBeInViewport()
    await expect(page.getByRole('link', { name: /My requests/ })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  })
})

test('signed out, Help on the sign-in screens opens Contact (the help page needs sign-in)', async ({ page }) => {
  await page.goto('/signin')
  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page).toHaveURL(/\/contact$/)
  await expect(page.getByRole('link', { name: /Help/ })).toHaveCount(0)   // not on Contact itself
})

test('from walk-in: the help page knows, Write to us has "Walk-in" as subject, and Done goes back to walk-in', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/salon/walk-in')
  await page.getByRole('link', { name: /^Help/ }).click()
  await expect(page.getByText(/About: Walk-in/)).toBeVisible()
  await page.getByRole('button', { name: 'Write to us' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('Walk-in')
  await page.getByLabel('Your message').fill('The total shows the wrong price for a beard trim.')
  await page.getByRole('button', { name: 'Send to support' }).click()
  await expect(page.getByRole('heading', { name: 'Sent: ticket CLZ-1001' })).toBeVisible()
  expect(api.tickets[0].subject).toBe('Walk-in')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/salon\/walk-in$/)
})

test('a booking: "Problem with this? Write to us" fills its number and time', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const b = api.addBooking({ startsAt: minutesFromNow(60) })
  await page.reload()
  await page.getByText('Riya Sharma').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Problem with this? Write to us' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue(`Booking ${b.bookingNo}`)
  await expect(page.getByLabel('Your message')).toHaveValue(new RegExp(`^${b.bookingNo} · .+ · Haircut`))
})

test('the typed draft is never replaced by a link: they choose', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/help?write=1')
  await page.getByLabel('Your message').fill('My payout for last week has not arrived yet.')
  await page.goto('/salon/walk-in')
  await page.getByRole('link', { name: /^Help/ }).click()
  await page.getByRole('button', { name: 'Continue your message' }).click()
  await expect(page.getByLabel('Your message')).toHaveValue('My payout for last week has not arrived yet.')
  // An error's "Write to us" elsewhere: theirs stays, with the choice
  api.failOnce.set('/salon/ratings', { status: 403, code: 'FORBIDDEN', message: "You can't see this." })
  await page.goto('/salon/ratings')
  await page.getByRole('link', { name: 'Write to us' }).click()
  await expect(page.getByText("You had started a message before: it's kept below.")).toBeVisible()
  await expect(page.getByLabel('Your message')).toHaveValue('My payout for last week has not arrived yet.')
  await page.getByRole('button', { name: /Start a new one about “Ratings”/ }).click()
  await expect(page.getByLabel('Your message')).toHaveValue(/^The app said: “You can't see this\.”/)
})

test('an error offers support with the error already written', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.failOnce.set('/salon/ratings', { status: 403, code: 'FORBIDDEN', message: "You can't see this." })
  await page.goto('/salon/ratings')
  await expect(page.getByText('Still not working?')).toBeVisible()
  await page.getByRole('link', { name: 'Write to us' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('Ratings')
  await expect(page.getByLabel('Your message')).toHaveValue("The app said: “You can't see this.”\nWhat I was doing: ")
})

test('"Support replied" dot: on every screen until the request is opened; one read of the list while moving around', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const t = api.newTicket('PARTNER', 'Payout', 'My payout for last week has not arrived yet.')
  api.supportReplies(t, 'It goes out on Monday.')
  await page.goto('/salon/day')
  await expect(page.getByRole('link', { name: 'Help (Support replied)' })).toBeVisible()
  for (const tab of ['Bookings', 'Salon', 'More', 'Today']) {
    await page.getByRole('link', { name: tab, exact: true }).click()
    await expect(page.getByRole('link', { name: 'Help (Support replied)' })).toBeVisible()
  }
  expect(requestReads(api)).toBe(1)
  await page.getByRole('link', { name: 'Help (Support replied)' }).click()
  await expect(page.getByText('1 new reply from us')).toBeVisible()
  await page.getByRole('link', { name: /My requests/ }).click()
  await expect(page.getByText('New reply')).toBeVisible()
  await page.getByText('Payout').click()
  await expect(page.getByText('It goes out on Monday.')).toBeVisible()
  await page.goto('/salon/day')
  await expect(page.getByRole('link', { name: 'Help', exact: true })).toBeVisible()
  await expect(page.getByTestId('help-replied-dot')).toHaveCount(0)
})

test('answers: search as you type, the screen\'s own button words, and Take me there opens that screen', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/help')
  await page.getByLabel('Search the answers').fill('holiday')
  await expect(page.getByText('1 answer')).toBeVisible()
  await expect(page.getByText(/“Close the salon on”/)).toBeVisible()
  await page.getByRole('link', { name: /^Take me there: How do I close the salon/ }).click()
  await expect(page).toHaveURL(/\/salon\/closures$/)
  await expect(page.getByRole('heading', { name: 'Closed days', exact: true })).toBeVisible()
  // Today's tips again (Today opens them on ?tips=1)
  await page.goto('/help')
  await page.getByRole('link', { name: 'Show the app tips again' }).click()
  await expect(page).toHaveURL(/\/salon\/day\?tips=1$/)
})

test('a barber sees only answers for his screens; Today\'s come first from Today', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  await page.getByRole('link', { name: /^Help/ }).click()
  await expect(page.getByRole('heading', { name: 'About this screen' })).toBeVisible()
  await expect(page.getByText("What is the customer's 4-digit code?")).toBeVisible()
  await expect(page.getByText('How do I add or change a service, its price or picture?')).toHaveCount(0)
  await expect(page.getByText('How do I close the salon for good?')).toHaveCount(0)
  await expect(page.getByText('How do I leave this salon?')).toBeVisible()
})

test('in Hindi the answers and the Help button are in Hindi, with the buttons\' Hindi names', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More', exact: true }).click()
  await page.getByRole('button', { name: 'हिन्दी' }).first().click()
  await expect(page.getByRole('link', { name: /^मदद/ })).toBeVisible()
  await page.getByRole('link', { name: /^मदद/ }).click()
  await page.getByLabel('जवाब खोजें').fill('छुट्टी')
  await expect(page.getByText('त्योहार या छुट्टी पर सैलून बंद कैसे रखें?')).toBeVisible()
})

test('More: help right under the salon card, and the setup screens owners look for there', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More', exact: true }).click()
  await expect(page.getByText('Need help?')).toBeInViewport()
  for (const [name, url] of [['Services and prices', /\/setup\/services$/], ['Opening hours', /\/setup\/hours$/], ['Barbers', /\/setup\/staff$/]] as const) {
    await page.getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(url)
    await page.goBack()
  }
  await page.getByRole('link', { name: 'How do I…? Answers' }).click()
  await expect(page.getByLabel('Search the answers')).toBeVisible()
})

test('More for a barber: no setup links (he can\'t open them)', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  await page.getByRole('link', { name: 'More', exact: true }).click()
  await expect(page.getByText('Need help?')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Services and prices', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Barbers', exact: true })).toHaveCount(0)
})

test('offline: the error says so and still offers support', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  // No connection for the ratings (the page's own route comes before the fake backend's)
  await page.route('**/api/v1/salon/ratings*', (route) => route.abort('internetdisconnected'))
  await page.getByRole('link', { name: 'More', exact: true }).click()
  await page.getByRole('link', { name: 'Ratings', exact: true }).click()
  await expect(page.getByText('Still not working?')).toBeVisible({ timeout: 15_000 })
  await page.unroute('**/api/v1/salon/ratings*')
  await page.getByRole('link', { name: 'Write to us' }).click()
  await expect(page.getByLabel('Your message')).toHaveValue(/^The app said: /)
})
