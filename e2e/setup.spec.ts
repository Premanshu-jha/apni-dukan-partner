import { addDays, minutesFromNow, todayIst } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

test('the owner adds a service, edits its price and switches one off', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'Salon' }).click()
  await page.getByRole('link', { name: /Services and prices/ }).click()
  await page.getByRole('button', { name: '+ Add a service' }).click()
  await page.getByLabel('Name').fill('H')
  await page.getByLabel('Price (₹)').fill('abc')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('A name of 2 to 60 letters')).toBeVisible()
  await expect(page.getByText('A price in rupees')).toBeVisible()
  await page.getByLabel('Name').fill('Head massage')
  await page.getByLabel('Minutes').fill('20')
  await page.getByLabel('Price (₹)').fill('149.50')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('20 min · ₹149.50')).toBeVisible()
  expect(api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/salon/services')!.body).toEqual({
    name: 'Head massage',
    durationMinutes: 20,
    pricePaise: 14950,
    priceIsFrom: false,
  })

  await page.getByRole('button', { name: /Haircut/ }).click()
  await page.getByLabel('Price (₹)').fill('250')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('30 min · ₹250')).toBeVisible()

  await page.getByRole('switch', { name: 'Hair colour on offer' }).click()
  await expect(page.getByRole('switch', { name: 'Hair colour on offer' })).toHaveAttribute('aria-checked', 'false')
  expect(api.calls.filter((c) => c.method === 'PATCH').at(-1)!.body).toEqual({ version: 0, active: false })
})

test('a new owner’s checklist leads through barbers, skills and hours', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.staff = []
  await page.goto('/salon/day')
  await expect(page.getByText('Before customers can book')).toBeVisible()
  await page.getByRole('link', { name: 'Add your barbers' }).click()
  await page.getByRole('button', { name: '+ Add a barber' }).click()
  await page.getByLabel('Name').fill('Ravi')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page).toHaveURL(/\/setup\/staff\/st\d+$/)

  await page.getByLabel('Haircut').check()
  await page.getByLabel('Beard trim').check()
  await page.getByRole('button', { name: 'Save services' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  await page.getByRole('listitem').filter({ hasText: /^Mon/ }).getByRole('button', { name: 'Add hours' }).click()
  await page.getByRole('button', { name: 'Add a second shift' }).first().click()
  await page.locator('#h-1-0-e').fill('14:00')
  await page.locator('#h-1-1-s').fill('13:00')
  await expect(page.getByText('Mon: two shifts overlap.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save hours' })).toBeDisabled()
  await page.locator('#h-1-1-s').fill('15:00')
  await page.getByRole('button', { name: 'Copy Monday to Tue–Sat' }).click()
  await page.getByRole('button', { name: 'Save hours' }).click()
  const hours = api.calls.find((c) => c.path.endsWith('/hours'))!.body as { hours: unknown[] }
  expect(hours.hours).toHaveLength(12)
  expect(hours.hours[0]).toEqual({ weekday: 1, start: '10:00', end: '14:00' })

  await page.getByLabel('His mobile number').fill('90000 00009')
  await page.getByRole('button', { name: 'Give sign-in' }).click()
  await expect(page.getByText('He can sign in with this number now.')).toBeVisible()
  expect(api.calls.find((c) => c.path.endsWith('/login'))!.body).toEqual({ phone: '9000000009' })

  await page.goto('/salon/day')
  await expect(page.getByText('Before customers can book')).toBeHidden()
})

test('two people editing a barber: the stale save says so and the next one works', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/staff/st1')
  await page.getByLabel('Name').fill('Ravi K')
  api.staff[0].version = 7 // someone else saved meanwhile
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText('Someone changed this barber meanwhile')).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveValue('Ravi K')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => (c.body as { version: number }).version)).toEqual([0, 7])
})

test('switching off a barber with bookings is refused with the backend’s reason', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.addBooking({ startsAt: minutesFromNow(20) })
  await page.goto('/setup/staff/st1')
  await page.getByRole('switch', { name: 'Working here' }).click()
  await expect(page.getByText('He has bookings coming up. Move or cancel them first.')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Working here' })).toHaveAttribute('aria-checked', 'true')
})

test('booking rules save from the defaults (no version yet)', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/rules')
  await page.getByLabel('Book up to (days ahead)').fill('45')
  await expect(page.getByText('From 1 to 30 days')).toBeVisible()
  await page.getByLabel('Book up to (days ahead)').fill('21')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ version: null, minLeadMinutes: 30, maxDaysAhead: 21 })
})

test('a break with a booking in the way lists it; a free time saves', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const tomorrow = addDays(todayIst(), 1)
  api.addBooking({ startsAt: `${tomorrow}T08:00:00.000Z`, customerName: 'Riya' }) // 13:30 India time
  await page.goto(`/salon/time-off?staff=st1&date=${tomorrow}`)
  await page.getByLabel('From').fill('13:00')
  await page.getByLabel('To').fill('14:00')
  await page.getByRole('button', { name: 'Save break' }).click()
  await expect(page.getByText('1 already booked in this time')).toBeVisible()
  await expect(page.getByRole('link', { name: /Riya/ })).toBeVisible()
  expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/blocks'))).toBe(false)

  await page.getByLabel('From').fill('15:00')
  await page.getByLabel('To').fill('15:30')
  await page.getByRole('button', { name: 'Save break' }).click()
  await expect(page).toHaveURL(new RegExp(`/salon/day\\?date=${tomorrow}$`))
  await expect(page.getByText('Break').first()).toBeVisible()

  // The owner removes it again from the board
  await page.getByRole('button', { name: /Break/ }).click()
  await page.getByRole('button', { name: 'Remove break' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove break' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('leave is for the owner; a barber adds breaks for himself only', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  await page.goto('/salon/day')
  await page.getByRole('button', { name: 'Add break' }).click()
  await expect(page).toHaveURL(/staff=st2/)
  await expect(page.getByRole('button', { name: 'Leave (whole days)' })).toBeHidden()
  await page.getByLabel('From').fill('23:00')
  await page.getByLabel('To').fill('23:30')
  await page.getByRole('button', { name: 'Save break' }).click()
  await expect(page).toHaveURL(/\/salon\/day/)
  expect(api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/blocks'))!.path).toBe('/api/v1/salon/staff/st2/blocks')
})

test('the owner closes a day (first moving what is booked), then opens it again', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const day = addDays(todayIst(), 1)
  const b = api.addBooking({ startsAt: `${day}T06:00:00.000Z` })
  await page.goto('/salon/closures')
  await page.getByLabel('Close the salon on').fill(day)
  await page.getByRole('button', { name: /Close / }).click()
  await expect(page.getByText('1 already on that day')).toBeVisible()
  b.status = 'CANCELLED_BY_SALON'
  await page.getByRole('button', { name: /Close / }).click()
  await expect(page.getByRole('button', { name: 'Open again' })).toBeVisible()
  await page.getByRole('button', { name: 'Open again' }).click()
  await expect(page.getByText('None.')).toBeVisible()
})

test('pause online bookings for the rest of today, then resume', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.getByRole('button', { name: 'Too busy? Pause online bookings' }).click()
  await page.getByRole('button', { name: 'Rest of today' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByText(/Online bookings paused until/)).toBeVisible()
  expect(api.calls.find((c) => c.path === '/api/v1/salon/pause' && c.method === 'POST')!.body).toEqual({})
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('button', { name: 'Too busy? Pause online bookings' })).toBeVisible()
})
