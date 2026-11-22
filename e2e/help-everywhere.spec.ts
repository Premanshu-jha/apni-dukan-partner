import { addDays, minutesFromNow, todayIst } from './mockApi'
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
    // Today: beside the bell on the date's line (no row of its own taking the board's room), never over it, on screen
    await page.goto('/salon/day')
    await expect(page.getByRole('link', { name: /^Help/ })).toHaveCount(1)
    const help = (await page.getByRole('link', { name: /^Help/ }).boundingBox())!
    const bell = (await page.getByRole('button', { name: /^Messages/ }).or(page.getByRole('link', { name: /^Messages/ })).first().boundingBox())!
    const date = (await page.getByRole('heading', { level: 1 }).boundingBox())!
    expect(help.x + help.width).toBeLessThanOrEqual(bell.x + 1)
    expect(Math.abs(help.y + help.height / 2 - (bell.y + bell.height / 2))).toBeLessThan(8)
    expect(help.y).toBeLessThan(date.y + date.height)
    expect(bell.x + bell.width).toBeLessThanOrEqual(360)
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
  // Today opens its tips on ?tips=1, then takes it out of the address (a reload doesn't open them again)
  await expect(page.getByText(/^Tip 1 of \d$/)).toBeVisible()
  await expect(page).toHaveURL(/\/salon\/day$/)
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

/** Answers the next dialog (window.confirm) and returns its text. */
function nextDialog(page: import('@playwright/test').Page, accept: boolean): Promise<string> {
  return new Promise((resolve) => {
    page.once('dialog', (d) => {
      resolve(d.message())
      void (accept ? d.accept() : d.dismiss())
    })
  })
}
const LEAVE = 'Leave without saving? Your changes will be lost.'

test('changes not saved: Help and Back ask first on every screen with a form, and nothing is lost on "Cancel"', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const screens: Array<[string, string, (p: typeof page) => Promise<unknown>, string?]> = [
    ['/setup/hours', 'Opening hours', (p) => p.getByRole('switch', { name: 'Sun open' }).click()],
    ['/salon/walk-in', 'New walk-in', (p) => p.getByLabel(/Haircut/).check()],
    ['/setup/staff/st1', 'Ravi', (p) => p.getByLabel('Haircut').uncheck()],
    ['/salon/offers/new', 'New offer', (p) => p.getByRole('button', { name: '30%' }).click()],
    ['/salon/time-off', 'Add a break', (p) => p.getByLabel('From').fill('15:00')],
    ['/setup/rules', 'Booking rules', (p) => p.getByLabel('Notice needed (minutes)').fill('90')],
    ['/team', 'Team', (p) => p.getByLabel("Helper's mobile number").fill('98480 11111')],
    // Salon details kept its own words (it asked before this round)
    ['/setup/details', 'Salon details', (p) => p.getByLabel('Salon name').fill('Shine Salon New'), 'Your changes aren’t saved. Leave anyway?'],
  ]
  for (const [path, heading, change, words = LEAVE] of screens) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading }).first(), path).toBeVisible()
    await change(page)
    // Help: asked; "Cancel" keeps the screen and what was changed
    const help = nextDialog(page, false)
    await page.getByRole('link', { name: /^Help/ }).click()
    expect(await help, path).toBe(words)
    await expect(page, path).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`))
    // Back: the same question
    const back = nextDialog(page, false)
    await page.getByRole('button', { name: 'Back' }).click()
    expect(await back, path).toBe(words)
    await expect(page, path).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`))
    // "OK": the help page, about this screen
    const leave = nextDialog(page, true)
    await page.getByRole('link', { name: /^Help/ }).click()
    expect(await leave, path).toBe(words)
    await expect(page, path).toHaveURL(/\/help\?from=/)
    // The help page is drawn, so the form screen (and its own "leave this site?" guard) is really gone
    await expect(page.getByRole('heading', { name: 'Need help' }), path).toBeVisible()
  }
  // Nothing changed: no question
  let asked = false
  page.on('dialog', (d) => {
    asked = true
    void d.dismiss()
  })
  await page.goto('/setup/hours')
  await page.getByRole('link', { name: /^Help/ }).click()
  await expect(page).toHaveURL(/\/help\?from=%2Fsetup%2Fhours/)
  expect(asked).toBe(false)
})

test('the New service and New barber sheets have their own Help; with something typed it asks first', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/services')
  await page.getByRole('button', { name: '+ Add a service' }).click()
  const sheet = page.getByRole('dialog')
  // Minutes says what it is for
  await expect(sheet.getByText('How long one customer takes. The barber is kept free for them that long.')).toBeVisible()
  await sheet.getByLabel('Name').fill('Head massage')
  const asked = nextDialog(page, false)
  await sheet.getByRole('link', { name: 'Help' }).click()
  expect(await asked).toBe(LEAVE)
  await expect(sheet.getByLabel('Name')).toHaveValue('Head massage')
  const ok = nextDialog(page, true)
  await sheet.getByRole('link', { name: 'Help' }).click()
  await ok
  await expect(page).toHaveURL(/\/help\?from=%2Fsetup%2Fservices&topic=Services/)

  // Nothing typed: straight there
  await page.goto('/setup/staff')
  await page.getByRole('button', { name: '+ Add a barber' }).click()
  let dialogs = 0
  page.on('dialog', (d) => {
    dialogs++
    void d.dismiss()
  })
  await page.getByRole('dialog').getByRole('link', { name: 'Help' }).click()
  await expect(page).toHaveURL(/\/help\?from=%2Fsetup%2Fstaff/)
  expect(dialogs).toBe(0)
})

test('"Ask us instead" opens the form with the search as the subject, nothing red until they write', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/help')
  await page.getByLabel('Search the answers').fill('gst bill')
  await page.getByRole('button', { name: 'Ask us instead' }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('gst bill')
  await expect(page.getByLabel('Your message')).toHaveValue('')
  await expect(page.getByLabel('Your message')).not.toHaveAttribute('aria-invalid', 'true')
})

test('a booking on another day: after writing about it, Done goes back to that day', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const day = addDays(todayIst(), 2)
  api.addBooking({ startsAt: `${day}T06:30:00.000Z` })
  await page.goto(`/salon/day?date=${day}`)
  await page.getByText('Riya Sharma').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Problem with this? Write to us' }).click()
  await page.getByLabel('Your message').fill('The customer wants to come an hour later.')
  await page.getByRole('button', { name: 'Send to support' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(new RegExp(`/salon/day\\?date=${day}$`))
})

test('a reply that also resolves the request lights the dot, "New reply" and the count', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const t = api.newTicket('PARTNER', 'Payout', 'My payout for last week has not arrived yet.')
  api.supportRepliesAndResolves(t, 'Sent today. Closing this one.')
  await page.goto('/salon/day')
  await expect(page.getByRole('link', { name: 'Help (Support replied)' })).toBeVisible()
  await page.getByRole('link', { name: 'Help (Support replied)' }).click()
  await expect(page.getByText('1 new reply from us')).toBeVisible()
  await page.getByRole('link', { name: /My requests/ }).click()
  await expect(page.getByText('New reply')).toBeVisible()
  await expect(page.getByText('Resolved')).toBeVisible()
  await page.getByText('Payout').click()
  await expect(page.getByText('Sent today. Closing this one.')).toBeVisible()
  await page.goto('/salon/day')
  await expect(page.getByRole('link', { name: 'Help', exact: true })).toBeVisible()
  await expect(page.getByTestId('help-replied-dot')).toHaveCount(0)
})

test('the counter phone open all day: a reply\'s push brings the dot without leaving Today; opening it from the message clears it', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const t = api.newTicket('PARTNER', 'Payout', 'My payout for last week has not arrived yet.')
  await expect(page.getByRole('link', { name: 'Help', exact: true })).toBeVisible()
  const reads = requestReads(api)
  // Support replies; its notification reaches the open app (the service worker passes the push on)
  api.supportReplies(t, 'It goes out on Monday.')
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { kind: 'push', type: 'PARTNERHELP_REPLIED' } })),
  )
  await expect(page.getByRole('link', { name: 'Help (Support replied)' })).toBeVisible()
  expect(requestReads(api)).toBe(reads + 1)
  // A second reply comes while the list in the app still has the first one; opened from its message in the inbox
  api.supportReplies(t, 'Sorry, Tuesday: Monday is a holiday.')
  await page.getByRole('link', { name: /^Messages/ }).or(page.getByRole('button', { name: /^Messages/ })).first().click()
  await page.getByText(`Support replied on ${t.number}`).first().click()
  await expect(page.getByText('Sorry, Tuesday: Monday is a holiday.')).toBeVisible()
  await page.goBack()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  // Read: no dot, though the list Help holds may still be the older one (times are compared, not matched)
  await expect(page.getByRole('link', { name: 'Help', exact: true })).toBeVisible()
  await expect(page.getByTestId('help-replied-dot')).toHaveCount(0)
})
