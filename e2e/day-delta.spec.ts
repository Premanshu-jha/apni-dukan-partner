import type { Page } from '@playwright/test'
import { addDays, istInstant, minutesFromNow, todayIst, type MockApi } from './mockApi'
import { expect, signedIn, test } from './helpers'

/** The day board polls with `since` and applies what changed (backend README, "Day board deltas"). */

/** Coming back to the app refreshes the board (as the 30-second poll does); waits for that answer. */
async function refresh(page: Page, api: MockApi) {
  const n = api.deltas.length
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.deltas.length).toBeGreaterThan(n)
}

const dayCalls = (api: MockApi) => api.calls.filter((c) => c.path.startsWith('/api/v1/salon/day?'))

test('new, changed, moved to another day and removed: only what changed comes, and the board follows', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const keep = api.addBooking({ startsAt: minutesFromNow(120), customerName: 'Kept Kamal' })
  const cancel = api.addBooking({ startsAt: minutesFromNow(90), customerName: 'Cancel Chetan' })
  const move = api.addBooking({ startsAt: minutesFromNow(60), customerName: 'Moving Mohan' })
  await page.goto('/salon/day')
  await expect(page.getByText('Kept Kamal')).toBeVisible()
  const first = dayCalls(api)[0]
  expect(first.path).not.toContain('since=')

  // A new booking (earlier than the rest), one cancelled by its customer, one moved to tomorrow
  api.addBooking({ startsAt: minutesFromNow(30), customerName: 'New Nisha' })
  Object.assign(cancel, { status: 'CANCELLED_BY_CUSTOMER', cancelReason: 'Cancelled by the customer' })
  const tomorrow = addDays(todayIst(), 1)
  Object.assign(move, { startsAt: istInstant(tomorrow, '11:00'), endsAt: istInstant(tomorrow, '11:30') })
  await refresh(page, api)

  const last = dayCalls(api).at(-1)!
  expect(last.path).toMatch(/since=q\d+-/)
  const delta = api.deltas.at(-1)!
  expect(delta.full).toBeUndefined()
  expect(delta.removed).toEqual([move.id])
  expect(delta.changed).toEqual(expect.arrayContaining([cancel.id]))
  expect(delta.changed).not.toContain(keep.id)

  await expect(page.getByText('New Nisha')).toBeVisible()
  await expect(page.getByText('Moving Mohan')).toHaveCount(0)
  await expect(page.getByText('Kept Kamal')).toBeVisible()
  // The live list keeps the screen's order (by start): the new, earlier booking comes first
  const names = await page.getByRole('listitem').allInnerTexts()
  const order = ['New Nisha', 'Kept Kamal'].map((n) => names.findIndex((t) => t.includes(n)))
  expect(order[0]).toBeGreaterThanOrEqual(0)
  expect(order[0]).toBeLessThan(order[1])

  // Tomorrow's board is its own (the whole day first), and has the moved booking
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.getByText('Moving Mohan')).toBeVisible()
  expect(dayCalls(api).at(-1)!.path).toBe(`/api/v1/salon/day?date=${tomorrow}`)
})

test('a booking given to another barber moves column; nothing changed is an empty delta', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const a = api.addBooking({ startsAt: minutesFromNow(60), customerName: 'Riya Sharma' })
  await page.goto('/salon/day')
  await page.getByRole('button', { name: 'Imran' }).click()
  await expect(page.getByText('Riya Sharma')).toHaveCount(0)

  a.staffId = 'st2'
  await refresh(page, api)
  expect(api.deltas.at(-1)!.changed).toEqual([a.id])
  await expect(page.getByText('Riya Sharma')).toBeVisible()
  await page.getByRole('button', { name: 'Ravi', exact: true }).click()
  await expect(page.getByText('Riya Sharma')).toHaveCount(0)

  await refresh(page, api)
  expect(api.deltas.at(-1)).toMatchObject({ changed: [], removed: [] })
})

test('a setup change (or an old cursor) brings the whole day back: everything is replaced', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(60), customerName: 'Riya Sharma' })
  await page.goto('/salon/day')
  await expect(page.getByRole('button', { name: 'Ravi', exact: true })).toBeVisible()

  api.staff[0].name = 'Ravi Kumar'
  await refresh(page, api)
  expect(api.deltas.at(-1)!.full).toBe(true)
  await expect(page.getByRole('group', { name: 'Show barber' }).getByRole('button', { name: 'Ravi Kumar' })).toBeVisible()

  // The backend forgets cursors older than an hour: the whole day again, then deltas from the new seq
  api.wholeDayNext = true
  api.appointments.length = 0
  await refresh(page, api)
  expect(api.deltas.at(-1)!.full).toBe(true)
  await expect(page.getByText('Riya Sharma')).toHaveCount(0)
  await refresh(page, api)
  expect(api.deltas.at(-1)!.full).toBeUndefined()
})

test('a failed poll keeps the board and its seq; the next one carries on from there', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(60), customerName: 'Riya Sharma' })
  await page.goto('/salon/day')
  await expect(page.getByText('Riya Sharma')).toBeVisible()
  const seq = [...api.daySeqs.keys()].at(-1)!

  api.failOnce.set('/salon/day', { status: 400, code: 'BAD', message: 'The board could not be read.' })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText("Couldn't refresh: The board could not be read. Showing what we had.")).toBeVisible()
  await expect(page.getByText('Riya Sharma')).toBeVisible()

  api.addBooking({ startsAt: minutesFromNow(90), customerName: 'After Arjun' })
  await refresh(page, api)
  expect(api.deltas.at(-1)!.since).toBe(seq)
  await expect(page.getByText('After Arjun')).toBeVisible()
  await expect(page.getByText("Couldn't refresh")).toHaveCount(0)
})

test('a barber gets only his own column: other barbers\' rows never show, their ids are ignored', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  const mine = api.addBooking({ startsAt: minutesFromNow(60), staffId: 'st2', customerName: 'Mine Meena' })
  await page.goto('/salon/day')
  await expect(page.getByText('Mine Meena')).toBeVisible()

  api.addBooking({ startsAt: minutesFromNow(30), staffId: 'st1', customerName: 'Other Om' })
  // His booking given to Ravi: it leaves his board
  mine.staffId = 'st1'
  await refresh(page, api)
  expect(api.deltas.at(-1)).toMatchObject({ changed: [], removed: [mine.id] })
  await expect(page.getByText('Mine Meena')).toHaveCount(0)
  await expect(page.getByText('Other Om')).toHaveCount(0)
})

test('the whole-day read keeps its ETag: back on a date, an unchanged board is 304 and then deltas go on', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(30) })
  await page.goto('/salon/day')
  await expect(page.getByText('Riya Sharma')).toBeVisible()
  await page.getByRole('button', { name: 'Next day' }).click()
  await expect(page.getByRole('heading', { name: 'Tomorrow' })).toBeVisible()
  // Today's board was let go when another date was opened; reading it again sends the kept ETag
  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect.poll(() => api.notModified.some((p) => p === `/api/v1/salon/day?date=${todayIst()}`)).toBe(true)
  await expect(page.getByText('Riya Sharma')).toBeVisible()
  api.addBooking({ startsAt: minutesFromNow(45), customerName: 'Later Lalit' })
  await refresh(page, api)
  expect(api.deltas.at(-1)!.full).toBeUndefined()
  await expect(page.getByText('Later Lalit')).toBeVisible()
})
