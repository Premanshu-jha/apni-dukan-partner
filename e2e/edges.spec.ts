import { addDays, MockApi, minutesFromNow, todayIst } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

test('five wrong start codes lock the code; the owner starts it anyway once the customer is there', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(5) })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Start' }).click()
  for (const left of [4, 3, 2, 1]) {
    await sheet.getByLabel("The customer's 4-digit code").fill('1111')
    await sheet.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(sheet.getByText(`That code doesn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.`)).toBeVisible()
    await expect(sheet.getByLabel("The customer's 4-digit code")).toHaveValue('')
  }
  // The fifth wrong code locks it (as StartCodes does), and then even the right one is refused
  await sheet.getByLabel("The customer's 4-digit code").fill('1111')
  await sheet.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(sheet.getByText('Too many wrong codes')).toBeVisible()
  await sheet.getByLabel("The customer's 4-digit code").fill('4821')
  await sheet.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(sheet.getByText('Too many wrong codes')).toBeVisible()
  await sheet.getByRole('button', { name: /start anyway/ }).click()
  await expect(sheet.getByText('Started without a code.')).toBeVisible()
})

test('starting after the 15-minute hold says it is a no-show now', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(-16) })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
  await page.getByLabel("The customer's 4-digit code").fill('4821')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('is a no-show now. Add the customer as a walk-in.')).toBeVisible()
})

test('a reassign the backend refuses for a field says why, not just "not valid"', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(20), serviceIds: ['v3'] }) // Imran doesn't do Hair colour
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  await page.getByRole('button', { name: 'Give to another barber' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Imran' }).click()
  await page.getByRole('button', { name: 'Give to Imran' }).click()
  await expect(page.getByText("The barber: this barber doesn't do all of its services.")).toBeVisible()
})

test('walk-in: services no barber does together, a service switched off meanwhile, a one-letter name', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Hair colour/).check()
  await page.getByLabel(/Beard trim/).check()
  api.staff[0].serviceIds = ['v1', 'v3']
  await page.getByLabel(/Haircut/).check()
  await expect(page.getByText('No barber does all of these together.')).toBeVisible()

  // The owner switches Hair colour off on another phone; when the app comes back to the front the services reload,
  // the choice drops it (Haircut and Beard trim stay ticked) and the barbers come back
  api.services[2].active = false
  api.staff[0].serviceIds = ['v1', 'v2', 'v3']
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByLabel(/Hair colour/)).toHaveCount(0)
  await expect(page.getByLabel(/Haircut/)).toBeChecked()
  await expect(page.getByText('Who? (45 min, ₹300)')).toBeVisible()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByLabel("Customer's name (optional)").fill('S')
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page.getByText('Write at least 2 letters of the name')).toBeVisible()
  expect(api.calls.some((c) => c.path === '/api/v1/salon/walk-ins')).toBe(false)
})

test('a failed shop re-check keeps the screen and what was typed', async ({ page, context, api }) => {
  test.setTimeout(120_000)
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(20) })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await page.getByLabel('Reason (sent to the customer)').fill('Power cut')
  api.shopDown = 100
  api.dayDown = 100
  // Past the shop's 30 s freshness, the app comes back to the front: the shop is checked again and fails, and the
  // day's 30 s refresh fails too
  await page.waitForTimeout(31_000)
  const shopCalls = api.calls.filter((c) => c.path === '/api/v1/shops/me').length
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.calls.filter((c) => c.path === '/api/v1/shops/me').length, { timeout: 20_000 }).toBeGreaterThan(shopCalls + 2)
  await expect(page.getByText("Couldn't refresh")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('Reason (sent to the customer)')).toHaveValue('Power cut')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('removed from the salon while signed in: the next salon call sends them to the start', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  api.shop = null // the owner removed this helper
  await page.getByRole('link', { name: 'Bookings' }).click()
  await expect(page).toHaveURL(/\/start$/)
})

test('signing out in one tab clears the other tab before the next person signs in', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const other = await context.newPage()
  await other.goto('/more')
  await expect(other.getByText('Shop code 10234')).toBeVisible()
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(other).toHaveURL(/\/signin$/)

  // Someone else, with no shop, signs in on this phone
  api.user = { ...MockApi.completeUser(), id: 'u2', phone: '9000000005', name: 'Next Person' }
  api.shop = null
  await page.getByLabel('Mobile number').fill('9000000005')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/start$/)
  // The other tab follows the new sign-in without a reload: with the old cache it would open A's salon
  await expect(other).toHaveURL(/\/start$/)
  await expect(other.getByText('Shine Unisex Salon')).toBeHidden()
})

test('an unsaved registration draft isn’t shown to the next person on the phone', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await page.getByLabel('GSTIN').fill('27AAPFU0939F1ZV')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  api.user = { ...MockApi.completeUser(), id: 'u2', phone: '9000000005' }
  await page.getByLabel('Mobile number').fill('9000000005')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await page.goto('/register')
  await expect(page.getByLabel('GSTIN')).toHaveValue('')
})

test('a cleared date doesn’t break History or the break form', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'Bookings' }).click()
  await page.getByRole('button', { name: 'History' }).click()
  await page.getByLabel('From').fill('')
  await expect(page.getByText('Pick up to 31 days')).toBeVisible()
  await page.goto(`/salon/time-off?staff=st1&date=${addDays(todayIst(), 1)}`)
  await page.getByLabel('Day').fill('')
  await page.getByRole('button', { name: 'Save break' }).click()
  await expect(page.getByText('Pick the day.')).toBeVisible()
})

test('a break far ahead opens that day on the board', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const day = addDays(todayIst(), 45)
  await page.goto(`/salon/time-off?staff=st1&date=${day}`)
  await page.getByRole('button', { name: 'Save break' }).click()
  await expect(page).toHaveURL(new RegExp(`date=${day}$`))
  await expect(page.getByText('Break').first()).toBeVisible()
})

test('a service edited elsewhere: the sheet saves with the newest version after the reload', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/services')
  await page.getByRole('button', { name: /Haircut/ }).click()
  api.services[0].version = 4
  await page.getByLabel('Price (₹)').fill('260')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('This service was changed meanwhile')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('30 min · ₹260')).toBeVisible()
  await page.getByRole('button', { name: /Haircut/ }).click()
  await page.getByLabel('Minutes').fill('32')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('in steps of 5')).toBeVisible()
})

test('a shift can end at midnight', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.staff[0].hours = [{ weekday: 1, start: '18:00', end: '24:00' }]
  await page.goto('/setup/staff/st1')
  await expect(page.getByText('To midnight')).toBeVisible()
  await page.getByRole('listitem').filter({ hasText: /^Tue/ }).getByRole('button', { name: 'Add hours' }).click()
  await page.getByLabel('Till midnight').nth(1).check()
  await page.getByRole('button', { name: 'Save hours' }).click()
  const sent = api.calls.find((c) => c.path.endsWith('/hours'))!.body as { hours: Array<{ weekday: number; end: string }> }
  expect(sent.hours).toEqual([
    { weekday: 1, start: '18:00', end: '24:00' },
    { weekday: 2, start: '10:00', end: '24:00' },
  ])
})

test('"mark all read" marks only the messages on screen', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.inbox = [{ id: 'n1', type: 'SALON_NEW_BOOKING', title: 'New booking', body: 'x', url: '/salon/day', sentAt: new Date().toISOString(), read: false }]
  await page.goto('/notifications')
  await expect(page.getByText('1 unread')).toBeVisible()
  api.inbox.unshift({ id: 'n2', type: 'SALON_BOOKING_CANCELLED', title: 'Cancelled', body: 'y', url: '/salon/day', sentAt: new Date().toISOString(), read: false })
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect.poll(() => api.calls.find((c) => c.path.startsWith('/api/v1/me/notifications/read'))?.body).toEqual({ ids: ['n1'] })
})

test('a walk-in whose answer was lost is retried with the same key, and the choice can’t change meanwhile', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  api.failOnce.set('/walk-ins', { status: 502, code: 'BAD_GATEWAY', message: 'Bad gateway' })
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page.getByText("We couldn't tell if it was added.")).toBeVisible()
  await expect(page.getByLabel(/Haircut/)).toBeDisabled()
  await expect(page.getByLabel("Customer's name (optional)")).toBeDisabled()
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  const keys = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/salon/walk-ins').map((c) => c.idempotencyKey)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
})
