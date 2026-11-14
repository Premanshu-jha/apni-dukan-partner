import { addDays, istInstant, minutesFromNow, todayIst } from './mockApi'
import { atSalon, expect, test } from './helpers'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** "Mon" … "Sun" of a yyyy-MM-dd date. */
const weekdayOf = (date: string) => WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]

test('a booking tapped in Bookings opens on its day’s board', async ({ page, context, api }) => {
  const tomorrow = addDays(todayIst(), 1)
  api.addBooking({ startsAt: istInstant(tomorrow, '18:00'), customerName: 'Tomorrow Guest' })
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'Bookings' }).click()
  await page.getByText('Tomorrow Guest').click()
  await expect(page).toHaveURL(new RegExp(`/salon/day\\?date=${tomorrow}$`))
  await expect(page.getByRole('heading', { name: 'Tomorrow', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('Tomorrow Guest')).toBeVisible()
  // Closed, it stays closed (the link is used once)
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(page.getByText('Tomorrow Guest')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('a link to a booking no longer on that day says so', async ({ page, context, api }) => {
  api.addBooking({ startsAt: minutesFromNow(60), customerName: 'Still Here' })
  await atSalon(page, context, api)
  await page.goto(`/salon/day?date=${todayIst()}&open=gone-1`)
  await expect(page.getByText("That booking isn't on this day's board any more.", { exact: false })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('new hours that strand a booking list it, and its link opens it on the board', async ({ page, context, api }) => {
  const day = addDays(todayIst(), 2)
  api.addBooking({ startsAt: istInstant(day, '18:00'), customerName: 'Stranded Guest' })
  await atSalon(page, context, api)
  await page.goto('/setup/staff/st1')
  await page.getByRole('button', { name: `Remove ${weekdayOf(day)} shift` }).click()
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText("Some of his upcoming bookings wouldn't fit any more.", { exact: false })).toBeVisible()
  await expect(page.getByText('1 booking is in the way')).toBeVisible()
  const link = page.getByRole('link', { name: /6:00 PM–6:30 PM/ })
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/salon/day\\?date=${day}$`))
  await expect(page.getByRole('dialog').getByText('Stranded Guest')).toBeVisible()
  // Nothing was saved
  expect(api.staff[0].hours).toHaveLength(7)
})

test('services he would drop list the bookings that use them', async ({ page, context, api }) => {
  api.addBooking({ startsAt: istInstant(addDays(todayIst(), 1), '11:00'), serviceIds: ['v2'] })
  await atSalon(page, context, api)
  await page.goto('/setup/staff/st1')
  await page.getByLabel('Beard trim').uncheck()
  await page.getByRole('button', { name: 'Save services' }).click()
  await expect(page.getByText('1 booking is in the way')).toBeVisible()
  await expect(page.getByRole('link', { name: /11:00 AM–/ })).toHaveAttribute('href', /open=a\d+/)
})

test('a second shift starts after the first, splitting a shift that runs to closing', async ({ page, context, api }) => {
  api.staff[0].hours = []
  await atSalon(page, context, api)
  await page.goto('/setup/staff/st1')
  await page.getByRole('listitem').filter({ hasText: /^Mon/ }).getByRole('button', { name: 'Add hours' }).click()
  await page.getByRole('button', { name: 'Add a second shift' }).click()
  await expect(page.locator('#h-1-0-s')).toHaveValue('10:00')
  await expect(page.locator('#h-1-0-e')).toHaveValue('15:00')
  await expect(page.locator('#h-1-1-s')).toHaveValue('16:00')
  await expect(page.locator('#h-1-1-e')).toHaveValue('20:00')
  await expect(page.getByText('two shifts overlap')).toBeHidden()
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.staff[0].hours).toEqual([
    { weekday: 1, start: '10:00', end: '15:00' },
    { weekday: 1, start: '16:00', end: '20:00' },
  ])
})

test('a second shift after a short first one leaves an hour for a break (10:00–14:00, then 15:00–20:00)', async ({ page, context, api }) => {
  api.staff[0].hours = []
  await atSalon(page, context, api)
  await page.goto('/setup/staff/st1')
  await page.getByRole('listitem').filter({ hasText: /^Mon/ }).getByRole('button', { name: 'Add hours' }).click()
  await page.locator('#h-1-0-e').fill('14:00')
  await page.getByRole('button', { name: 'Add a second shift' }).click()
  await expect(page.locator('#h-1-1-s')).toHaveValue('15:00')
  await expect(page.locator('#h-1-1-e')).toHaveValue('20:00')
  await expect(page.getByText('two shifts overlap')).toBeHidden()
})

test('a big salon’s day (50 barbers, 2,000 bookings) opens on one barber and draws everyone quickly', async ({ page, context, api }) => {
  test.slow()
  const today = todayIst()
  api.staff = Array.from({ length: 50 }, (_, s) => ({
    id: `big${s}`, name: `Barber ${s}`, active: true, serviceIds: ['v1'], hours: [], loginPhone: null, photoFileId: null, version: 0,
  }))
  for (let s = 0; s < 50; s++) {
    for (let i = 0; i < 40; i++) {
      const m = 8 * 60 + i * 20
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      api.addBooking({ startsAt: istInstant(today, hhmm), staffId: `big${s}`, customerName: `Guest ${s}-${i}` })
    }
  }
  await atSalon(page, context, api)
  const cards = page.locator('main li > button')
  await expect(page.getByRole('button', { name: 'Barber 0', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(cards).toHaveCount(40)
  // Timed inside the page, from the tap to all 2,000 cards drawn: only the app's own work, not Playwright's polling
  // or a busy shared CI runner's round trips (which made the old wall-clock timing fail now and then)
  const drawMs = await page.evaluate(async () => {
    const everyone = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Everyone')!
    const t0 = performance.now()
    everyone.click()
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
    while (document.querySelectorAll('main li > button').length < 2000) {
      await frame()
      if (performance.now() - t0 > 20_000) break
    }
    // Two more frames: the one that lays out and paints the 2,000 cards has run (a board slow only to lay out or
    // paint is counted too)
    await frame()
    await frame()
    return performance.now() - t0
  })
  await expect(cards).toHaveCount(2000)
  expect(drawMs).toBeLessThan(5000)
  // One booking changes: the board shows it at the next refresh, the rest stays as it was
  api.appointments.find((a) => a.customerName === 'Guest 7-3')!.customerName = 'Renamed Guest'
  api.salonVersion++
  await expect(page.getByText('Renamed Guest')).toBeVisible({ timeout: 40_000 })
  await expect(cards).toHaveCount(2000)
})
