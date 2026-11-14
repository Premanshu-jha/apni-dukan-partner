import { minutesFromNow } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

test('the owner starts a booking with the customer’s code (a wrong code first)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(5), serviceIds: ['v1', 'v2'] })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Haircut, Beard trim')).toBeVisible()
  await expect(sheet.getByText('₹300')).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Call 98111 22233' })).toHaveAttribute('href', 'tel:+919811122233')
  await sheet.getByRole('button', { name: 'Start' }).click()
  await sheet.getByLabel("The customer's 4-digit code").fill('1111')
  await sheet.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(sheet.getByText("That code doesn't match. 4 tries left.")).toBeVisible()
  await expect(sheet.getByLabel("The customer's 4-digit code")).toHaveValue('')
  await sheet.getByLabel("The customer's 4-digit code").fill('4821')
  await sheet.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(sheet.getByText('Started.')).toBeVisible()
  await expect(sheet.getByText('In chair')).toBeVisible()
  const starts = api.calls.filter((c) => c.path.endsWith('/start'))
  expect(starts.map((c) => c.body)).toEqual([{ code: '1111' }, { code: '4821' }])
})

test('a helper can start without the code; a barber can’t, and sees no phone, cancel or reassign', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('HELPER')
  api.addBooking({ startsAt: minutesFromNow(5) })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: "Customer can't show the code: start anyway" }).click()
  await expect(page.getByText('Started without a code.')).toBeVisible()
  expect(api.calls.find((c) => c.path.endsWith('/start'))!.body).toEqual({ withoutCode: true })
})

test('a barber works his own bookings only', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  api.addBooking({ startsAt: minutesFromNow(5), staffId: 'st2' })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('link', { name: /Call/ })).toBeHidden()
  await expect(sheet.getByRole('button', { name: /Cancel booking/ })).toBeHidden()
  await expect(sheet.getByRole('button', { name: 'Give to another barber' })).toBeHidden()
  await sheet.getByRole('button', { name: 'Start' }).click()
  await expect(sheet.getByRole('button', { name: /start anyway/ })).toBeHidden()
})

test('no-show opens 10 minutes after the start; it can be undone', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(-5) })
  api.addBooking({ startsAt: minutesFromNow(-20), customerName: 'Late Lata' })
  await page.goto('/salon/day')
  await expect(page.getByText('Not started')).toHaveCount(2)

  await page.getByText('Riya Sharma').click()
  await expect(page.getByRole('button', { name: /No-show from/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByText('Late Lata').click()
  await page.getByRole('button', { name: 'Mark no-show' }).click()
  await expect(page.getByText('missed-booking strike')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Mark no-show' }).click()
  await expect(page.getByText('Marked as no-show.')).toBeVisible()
  await page.getByRole('button', { name: 'Undo no-show' }).click()
  await expect(page.getByText('No-show undone.')).toBeVisible()
  // The backend closes it as cancelled by the salon (strike removed); it doesn't come back as booked
  await expect(page.getByRole('dialog').getByText('Cancelled by salon')).toBeVisible()
})

test('Start closes and no-show opens when the 10-minute hold ends', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(-8), customerName: 'Still held' })
  api.addBooking({ startsAt: minutesFromNow(-12), customerName: 'Held over' })
  await page.goto('/salon/day')

  await page.getByText('Still held').click()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /No-show from/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByText('Held over').click()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark no-show' })).toBeEnabled()
})

test('give a booking to another barber, and cancel one with a reason the customer sees', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(20), serviceIds: ['v1'] })
  api.addBooking({ startsAt: minutesFromNow(25), customerName: 'Arjun' })
  await page.goto('/salon/day')

  await page.getByText('Riya Sharma').click()
  await page.getByRole('button', { name: 'Give to another barber' }).click()
  api.failOnce.set('/reassign', { status: 409, code: 'BARBER_BUSY', message: 'Imran is busy at that time.' })
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Imran' }).click()
  await page.getByRole('button', { name: 'Give to Imran' }).click()
  await expect(page.getByText('Imran is busy at that time.')).toBeVisible()
  // Still on the choice, to try again
  await page.getByRole('button', { name: 'Give to Imran' }).click()
  await expect(page.getByText('Given to another barber.')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByText('Arjun').click()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  const cancel = page.getByRole('dialog').getByRole('button', { name: 'Cancel booking' })
  await expect(cancel).toBeDisabled()
  await page.getByLabel('Reason (sent to the customer)').fill('Barber is unwell today')
  await cancel.dblclick()
  await expect(page.getByText('Cancelled. The customer has been told.')).toBeVisible()
  const cancels = api.calls.filter((c) => c.path.endsWith('/cancel'))
  expect(cancels).toHaveLength(1)
  expect(cancels[0].body).toEqual({ reason: 'Barber is unwell today' })
})

test('the customer cancelled while the sheet was open: the refusal is shown and the day reloads', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const b = api.addBooking({ startsAt: minutesFromNow(5) })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  b.status = 'CANCELLED_BY_CUSTOMER'
  await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
  await page.getByLabel("The customer's 4-digit code").fill('4821')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('Someone changed it meanwhile: it is now "Cancelled by customer".')).toBeVisible()
  await expect(page.getByRole('dialog').getByText(/· Cancelled by customer/)).toBeVisible()
})

test('a walk-in: services, a free barber, one request even on a double tap', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Haircut/).check()
  await page.getByLabel(/Beard trim/).check()
  await expect(page.getByLabel('Total')).toContainText('Total: 2 services · ₹300')
  await expect(page.getByLabel('Total')).toContainText('About 45 min')
  await expect(page.getByRole('button', { name: /Imran.*free at 4:30 PM/ })).toBeDisabled()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByLabel("Customer's name (optional)").fill('Sunil')
  await page.getByRole('button', { name: 'Start now with Ravi' }).dblclick()
  await expect(page).toHaveURL(/\/salon\/day$/)
  const adds = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/salon/walk-ins')
  expect(adds).toHaveLength(1)
  expect(adds[0].body).toEqual({ serviceIds: ['v1', 'v2'], staffId: 'st1', name: 'Sunil', expectedPricePaise: 30000 })   // the total shown
  expect(adds[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  await expect(page.getByText('Sunil')).toBeVisible()
})

test('a walk-in shows each price now and the total as services are ticked, with the salon’s offer while it runs', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.offerNow = { percentOff: 20, serviceIds: ['v1'], until: '14:00' }   // 20% off the haircut right now, till 2 pm
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  const total = page.getByLabel('Total')
  await expect(total).toContainText('Tick what they want: the total shows here.')
  // Each service: its picture, its time, and its price now (the haircut's own price crossed out, read as "was")
  const haircut = page.locator('label', { hasText: 'Haircut' })
  await expect(haircut.locator('svg[data-icon="HAIRCUT"]')).toBeVisible()
  await expect(haircut.locator('s')).toHaveText('was ₹200')
  await expect(haircut).toContainText('now ₹160')
  await expect(haircut).toContainText('offer till 2:00 PM')
  await expect(page.locator('label', { hasText: 'Beard trim' }).locator('svg[data-icon="BEARD"]')).toBeVisible()
  await expect(page.locator('label', { hasText: 'Beard trim' }).locator('s')).toHaveCount(0)

  await page.getByLabel(/Haircut/).check()
  await expect(total).toContainText('Total: 1 service · was ₹200 now ₹160')
  await page.getByLabel(/Beard trim/).check()
  await expect(total).toContainText('Total: 2 services · was ₹300 now ₹260')
  await expect(total).toContainText("About 45 min · the salon's offer price till 2:00 PM")
  // The Start button sits under the total, so a long list needn't be scrolled to the end
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await expect(total.locator('..').getByRole('button', { name: 'Start now with Ravi' })).toBeVisible()
  await page.getByLabel(/Haircut/).uncheck()
  await expect(total).toContainText('Total: 1 service · ₹100')
  await expect(total).not.toContainText('offer')
  await page.getByLabel(/Hair colour/).check()
  await expect(total).toContainText('Total: 2 services · from ₹900')   // a "from" price says so
})

test('walk-in prices that can’t be read: the usual prices with a note, and the backend says if the price differs', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.offerNow = { percentOff: 20, serviceIds: ['v1'] }
  api.failOnce.set('/walk-ins/prices', { status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' })
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Haircut/).check()
  const total = page.getByLabel('Total')
  await expect(total).toContainText('Total: 1 service · ₹200')
  await expect(total).toContainText("Couldn't check the salon's offer, so these are the usual prices.")
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  // The offer applies now: nothing was added, the new total is said and shown
  await expect(page.getByText("The price changed just now (an offer started or ended): it's ₹160 now.")).toBeVisible()
  await expect(total).toContainText('Total: 1 service · was ₹200 now ₹160')
  await expect(total).not.toContainText("Couldn't check")
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  const adds = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/salon/walk-ins')
  expect(adds.map((a) => (a.body as { expectedPricePaise: number }).expectedPricePaise)).toEqual([20000, 16000])
  expect(adds[0].idempotencyKey).not.toBe(adds[1].idempotencyKey)
})

test('prices that stay unreadable: after the backend says the real total, the next Start adds at it', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.offerNow = { percentOff: 20, serviceIds: ['v1'] }
  api.walkInPricesDown = true
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page.getByText("it's ₹160 now.")).toBeVisible()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  const adds = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/salon/walk-ins')
  expect(adds.map((x) => (x.body as { expectedPricePaise: number }).expectedPricePaise)).toEqual([20000, 16000])
})

test('an offer that ends while the walk-in screen is open: the owner is told before anything is added', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.offerNow = { percentOff: 20, serviceIds: ['v1'], until: '14:00' }
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Haircut/).check()
  await expect(page.getByLabel('Total')).toContainText('now ₹160')
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  api.offerNow = null   // 2 pm came
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page.getByText("it's ₹200 now. Check it with the customer, then tap Start again.")).toBeVisible()
  await expect(page.getByLabel('Total')).toContainText('Total: 1 service · ₹200')
  expect(api.appointments.filter((a) => a.kind === 'WALK_IN')).toHaveLength(0)
})

test('a walk-in has at most 10 services: the rest wait, and the screen says why', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const base = api.services[0]
  for (let i = 1; i <= 10; i++) api.services.push({ ...base, id: `x${i}`, name: `Extra ${i}`, sortOrder: 50 + i })
  for (const st of api.staff) (st.serviceIds as string[]).push(...api.services.map((v) => v.id as string))
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.reload()
  for (let i = 1; i <= 10; i++) await page.getByRole('checkbox', { name: new RegExp(`^Extra ${i} `) }).check()
  await expect(page.getByText('At most 10 services in one walk-in: untick one to choose another.')).toBeVisible()
  await expect(page.getByLabel(/Haircut/)).toBeDisabled()
  await page.getByRole('checkbox', { name: /^Extra 1 / }).uncheck()
  await expect(page.getByLabel(/Haircut/)).toBeEnabled()
})

test('a walk-in for a barber who just got busy, and someone without walk-in access', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  api.failOnce.set('/walk-ins', { status: 409, code: 'BARBER_BUSY', message: "Ravi isn't free right now. Pick a barber who is free now." })
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page.getByText("Ravi isn't free right now")).toBeVisible()
  await expect(page.getByRole('button', { name: /Start now/ })).toBeHidden()

  api.walkIns = false
  await page.getByLabel(/Beard trim/).check()
  await expect(page.getByText("Walk-ins need the owner's OK")).toBeVisible()
})

test('the board is per day, refreshes, and recovers from a short outage', async ({ page, context, api }) => {
  test.setTimeout(120_000)
  await signedIn(context, api)
  api.approvedSalon()
  api.dayDown = 100
  await page.goto('/salon/day')
  // The app waits and tries again by itself a few times before showing the problem
  await expect(page.getByText("We're having a short problem")).toBeVisible({ timeout: 30_000 })
  api.dayDown = 0
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Nothing booked today yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page).toHaveURL(/\?date=\d{4}-\d{2}-\d{2}$/)
  await expect(page.getByRole('heading', { name: 'Tomorrow' })).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Walk-in' })).toBeHidden()
  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)

  // A booking made by a customer shows up on its own
  api.addBooking({ startsAt: minutesFromNow(30), customerName: 'New Customer' })
  await expect(page.getByText('New Customer')).toBeVisible({ timeout: 40_000 })
})

test('a refresh with nothing changed keeps the day on screen (an empty delta)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(30) })
  await page.goto('/salon/day')
  await expect(page.getByText('Riya Sharma')).toBeVisible()
  // Coming back to the app re-reads the day: only what changed since the last answer (nothing); the whole-day read's
  // ETag and 304 are in day-delta.spec
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.deltas.length).toBe(1)
  expect(api.deltas[0]).toMatchObject({ changed: [], removed: [] })
  await expect(page.getByText('Riya Sharma')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
