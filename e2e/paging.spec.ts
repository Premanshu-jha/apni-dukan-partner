import type { Page } from '@playwright/test'
import { addDays, istInstant, micros, MockApi, todayIst } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

/**
 * n bookings starting on `day`, three at each quarter hour (so ties sit across page ends), each start with
 * microseconds as the backend sends them. Returns them in the backend's order for that list.
 */
function bookings(api: MockApi, n: number, day: string, over: Record<string, unknown> = {}) {
  for (let i = 0; i < n; i++) {
    const start = new Date(Date.parse(istInstant(day, '00:15')) + Math.floor(i / 3) * 15 * 60_000).toISOString()
    api.addBooking({ startsAt: start.replace('.000Z', '.000123Z'), customerName: `Customer ${i + 1}`, ...over })
  }
}

/** The upcoming list in the backend's order: startsAt, then id. */
function soonestFirst(api: MockApi) {
  return [...api.appointments].sort(
    (x, y) => micros(x.startsAt as string) - micros(y.startsAt as string) || ((x.id as string) < (y.id as string) ? -1 : 1),
  )
}

const cards = (page: Page) => page.locator('[data-index]')
/** The coming-up list's page reads (not its `since=` calls). */
const upcomingCalls = (api: MockApi) => api.calls.filter((c) => c.path.startsWith('/api/v1/salon/upcoming') && !c.path.includes('since='))
const sinceCalls = (api: MockApi) => api.calls.filter((c) => c.path.startsWith('/api/v1/salon/upcoming?since='))

async function openBookings(page: Page) {
  await page.getByRole('link', { name: 'Bookings' }).click()
}

test('coming up: 100 a page soonest first; ties across a page end are neither lost nor repeated; focus moves to the first new booking', async ({ page, context, api }) => {
  bookings(api, 230, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  await openBookings(page)
  await expect(cards(page)).toHaveCount(100)
  await expect(page.getByText('The next 100 bookings, soonest first')).toBeVisible()

  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(200)
  await expect(page.locator('[data-index="100"] button')).toBeFocused()
  // The second page was asked after the 100th booking, its start sent back exactly as received
  const order = soonestFirst(api)
  const second = upcomingCalls(api).find((c) => c.path.includes('afterId='))!
  expect(second.path).toBe(
    `/api/v1/salon/upcoming?afterStart=${encodeURIComponent(order[99].startsAt as string)}&afterId=${order[99].id}`,
  )
  expect(second.path).toContain('.000123Z')

  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(230)
  await expect(page.getByText('230 bookings coming up')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show more bookings' })).toBeHidden()
  // Every booking once, in the backend's order
  const shown = await page.locator('[data-index] button').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
  expect(shown.map((t) => t.match(/Customer \d+/)?.[0])).toEqual(order.map((a) => a.customerName))
})

test('exactly 100 coming up: one more (empty) page, then the count gets the focus and the button goes', async ({ page, context, api }) => {
  bookings(api, 100, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(page.getByText('100 bookings coming up')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Show more bookings' })).toBeHidden()
  await expect(cards(page)).toHaveCount(100)
})

test('a failed "Show more" keeps the bookings and says so; tapping again works', async ({ page, context, api }) => {
  bookings(api, 150, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  await openBookings(page)
  api.failPages = 3 // the first try and both automatic retries
  const more = page.getByRole('button', { name: 'Show more bookings' })
  await more.click()
  // Still the same button while it loads (aria-busy, not disabled, so the focus stays on it)
  await expect(page.getByRole('button', { name: 'Loading more bookings…' })).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByRole('alert')).toContainText("Couldn't load more. Tap Show more bookings to try again.")
  await expect(cards(page)).toHaveCount(100)
  await expect(more).toBeFocused()
  await more.click()
  await expect(cards(page)).toHaveCount(150)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a "Show more" refused by the backend (an unreadable cursor) keeps the list too', async ({ page, context, api }) => {
  bookings(api, 120, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  await openBookings(page)
  await expect(cards(page)).toHaveCount(100)
  api.failOnce.set('/salon/upcoming', { status: 400, code: 'BAD_REQUEST', message: "'x' is not a valid value for 'afterStart'" })
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't load more")
  await expect(cards(page)).toHaveCount(100)
})

test('offline: "Show more" says so at once and asks nothing; back online it loads', async ({ page, context, api }) => {
  bookings(api, 150, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  await openBookings(page)
  await expect(cards(page)).toHaveCount(100)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(page.getByRole('alert')).toContainText("You're offline. Connect to the internet and tap Show more bookings again.")
  expect(upcomingCalls(api).some((c) => c.path.includes('afterId='))).toBe(false)
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
})

test('a refresh asks only what changed; reopening asks again only the pages on screen, each 304 ("s1-" tag) when unchanged', async ({ page, context, api }) => {
  bookings(api, 150, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  // The day board: coming back to the app asks only what changed (nothing) and keeps the board (its 304 is in day-delta.spec)
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.deltas.length).toBe(1)
  expect(api.deltas[0]).toMatchObject({ changed: [], removed: [] })
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
  const before = upcomingCalls(api).length
  // Coming back to the app: one delta call, no page asked again
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.upcomingDeltas.filter((d) => !d.full).length).toBe(1)
  expect(api.upcomingDeltas.at(-1)).toMatchObject({ changed: [], removed: [] })
  await page.waitForTimeout(500)
  expect(upcomingCalls(api).length - before).toBe(0)
  // Reopening the list: a new seq first, then the two loaded pages again, each a 304
  await page.getByRole('link', { name: 'Today' }).click()
  await openBookings(page)
  await expect.poll(() => api.notModified.filter((p) => p.startsWith('/api/v1/salon/upcoming')).length).toBe(2)
  await page.waitForTimeout(500)
  expect(upcomingCalls(api).length - before).toBe(2)
  expect(sinceCalls(api).at(-1)!.path).toBe('/api/v1/salon/upcoming?since=start')
  await expect(cards(page)).toHaveCount(150)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const [total, more] of [[501, true], [500, false]] as const) {
  test(`the list stops at 500 bookings; with ${total} the note ${more ? 'says where the rest are' : 'is not shown (nothing comes after)'}`, async ({ page, context, api }) => {
    bookings(api, total, addDays(todayIst(), 2))
    await atSalon(page, context, api)
    await openBookings(page)
    for (let n = 200; n <= 500; n += 100) {
      await page.getByRole('button', { name: 'Show more bookings' }).click()
      await expect(cards(page)).toHaveCount(n)
    }
    await expect(page.getByRole('button', { name: 'Show more bookings' })).toBeHidden()
    // The page after the cap is asked once, only to know whether anything comes after
    await expect.poll(() => upcomingCalls(api).length).toBe(6)
    const note = page.getByText('Showing the next 500 bookings. Open a day on Today to see the ones after.')
    if (more) {
      await expect(note).toBeVisible()
      await expect(page.getByText('The next 500 bookings, soonest first')).toBeVisible()
    } else {
      await expect(page.getByText('500 bookings coming up')).toBeVisible()
      await expect(note).toHaveCount(0)
    }
  })
}

test('a refresh with two pages loaded, after bookings were added, cancelled and moved across the page edge: nothing missing or twice, in order', async ({ page, context, api }) => {
  const day = addDays(todayIst(), 1)
  bookings(api, 150, day)
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
  const order = soonestFirst(api)
  // A new booking before all the others, one on page 1 cancelled, one from page 2 moved onto page 1 and one from
  // page 1 moved past the page edge
  api.addBooking({ startsAt: istInstant(day, '00:00'), customerName: 'Customer new' })
  order[10].status = 'CANCELLED_BY_CUSTOMER'
  const moveTo = (a: Record<string, unknown>, startsAt: string) =>
    Object.assign(a, { startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString() })
  moveTo(order[120], order[50].startsAt as string)
  moveTo(order[5], order[110].startsAt as string)
  const before = upcomingCalls(api).length
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  const expected = soonestFirst(api).filter((a) => a.status === 'CONFIRMED').map((a) => a.customerName)
  expect(expected).toHaveLength(150)
  await expect
    .poll(async () => (await page.locator('[data-index] button').evaluateAll((els) => els.map((e) => e.textContent?.match(/Customer (\d+|new)/)?.[0]))))
    .toEqual(expected)
  // Only what changed came (one call): the new one and the moved ones in changed, the cancelled one in removed
  expect(upcomingCalls(api).length - before).toBe(0)
  const delta = api.upcomingDeltas.at(-1)!
  expect(delta.removed).toEqual([order[10].id])
  expect(delta.changed).toEqual(expect.arrayContaining([order[120].id, order[5].id]))
  expect(delta.changed).toHaveLength(3)
})

test('coming up, more pages on the backend: a booking after the loaded end waits for Show more; a setup change reloads the pages', async ({ page, context, api }) => {
  const day = addDays(todayIst(), 1)
  bookings(api, 150, day)
  await atSalon(page, context, api)
  await openBookings(page)
  await expect(cards(page)).toHaveCount(100)
  api.addBooking({ startsAt: istInstant(day, '00:00'), customerName: 'Customer early' })
  const late = api.addBooking({ startsAt: istInstant(day, '23:00'), customerName: 'Customer late' })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Customer early')).toBeVisible()
  expect(api.upcomingDeltas.at(-1)!.changed).toContain(late.id)
  await expect(cards(page)).toHaveCount(101)
  await expect(page.getByText('Customer late')).toHaveCount(0)
  // Show more goes on from where the first answer ended: nothing missing or twice
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(152)
  await expect(page.getByText('Customer late')).toBeVisible()

  const before = upcomingCalls(api).length
  api.staff[0].name = 'Ravi K'
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => upcomingCalls(api).length - before).toBe(2)
  expect(api.upcomingDeltas.at(-1)!.full).toBe(true)
  await expect(cards(page)).toHaveCount(152)
})

test('coming up for a barber: his own bookings only; one given to another barber leaves his list', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  const mine = api.addBooking({ startsAt: istInstant(addDays(todayIst(), 1), '10:00'), staffId: 'st2', customerName: 'Mine Meena' })
  await page.goto('/salon/bookings')
  await expect(page.getByText('Mine Meena')).toBeVisible()
  api.addBooking({ startsAt: istInstant(addDays(todayIst(), 1), '11:00'), staffId: 'st1', customerName: 'Other Om' })
  mine.staffId = 'st1'
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Mine Meena')).toHaveCount(0)
  expect(api.upcomingDeltas.at(-1)).toMatchObject({ changed: [], removed: [mine.id] })
  await expect(page.getByText('Other Om')).toHaveCount(0)
})

test('a failed refresh keeps the bookings with "Couldn\'t refresh the list"', async ({ page, context, api }) => {
  bookings(api, 150, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
  api.offline = true
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('alert')).toContainText("Couldn't refresh the list. It may be a little out of date.", { timeout: 15_000 })
  await expect(cards(page)).toHaveCount(150)
  api.offline = false
  // The next refresh goes on from the same seq: what changed meanwhile comes
  const seq = sinceCalls(api).filter((c) => !c.path.endsWith('since=start')).at(-1)?.path ?? null
  api.addBooking({ startsAt: istInstant(addDays(todayIst(), 1), '00:00'), customerName: 'Customer meanwhile' })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Customer meanwhile')).toBeVisible()
  if (seq) expect(sinceCalls(api).at(-1)!.path).toBe(seq)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('messages: a refresh with every page loaded asks those 10 pages again, no more', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.inbox = Array.from({ length: 330 }, (_, i) => ({
    id: `n${i}`, type: 'SALON_NEW_BOOKING', title: `Booking ${i + 1}`, body: 'x', url: '/salon/day',
    sentAt: new Date(Date.now() - i * 60_000).toISOString(), read: true,
  }))
  await page.goto('/notifications')
  for (let n = 60; n <= 300; n += 30) {
    await page.getByRole('button', { name: 'Show older' }).click()
    await expect(page.getByText(/^Booking \d+$/)).toHaveCount(n)
  }
  const lists = () => api.calls.filter((c) => c.path.startsWith('/api/v1/me/notifications?')).length
  const before = lists()
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(lists).toBe(before + 10)
  await page.waitForTimeout(500)
  expect(lists()).toBe(before + 10)
  await expect(page.getByText(/^Booking \d+$/)).toHaveCount(300)
})

test('a busy backend (503 SERVICE_BUSY, Retry-After): the client waits and tries once, then the query waits Retry-After too', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: new Date(Date.now() + 2 * 3600_000).toISOString(), customerName: 'Late Riya' })
  api.dayDown = 2
  api.busyRetryAfter = 2
  await page.goto('/salon/day')
  await expect(page.getByText('Late Riya')).toBeVisible({ timeout: 15_000 })
  const at = api.calls.filter((c) => c.path.startsWith('/api/v1/salon/day')).map((c) => c.at)
  expect(at.length).toBeGreaterThanOrEqual(3)
  expect(at[1] - at[0]).toBeGreaterThanOrEqual(1900) // the client's own wait
  expect(at[2] - at[1]).toBeGreaterThanOrEqual(1900) // the query's retry, after Retry-After (not 1 s)
})

test('history: 100 a page with the backend\'s next; the totals cover the whole range; no "pick fewer days"', async ({ page, context, api }) => {
  bookings(api, 150, addDays(todayIst(), -2), { status: 'COMPLETED' })
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'History' }).click()
  await expect(cards(page)).toHaveCount(100)
  await expect(page.getByText('₹30,000', { exact: true })).toBeVisible() // 150 haircuts at ₹200
  await expect(page.getByText('Done: 150')).toBeVisible()
  await expect(page.getByText('Pick fewer days')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  await expect(cards(page)).toHaveCount(150)
  await expect(page.locator('[data-index="100"] button')).toBeFocused()
  await expect(page.getByText('150 bookings and walk-ins, latest first')).toBeVisible()
  await expect(page.getByText('₹30,000', { exact: true })).toBeVisible()
  // The next page is the backend's `next`: the 100th (latest first, then id) start and id, as received
  const latest = [...api.appointments].sort(
    (x, y) => micros(y.startsAt as string) - micros(x.startsAt as string) || ((x.id as string) < (y.id as string) ? -1 : 1),
  )
  const second = api.calls.find((c) => c.path.startsWith('/api/v1/salon/history') && c.path.includes('afterId='))!
  expect(second.path).toContain(`&afterStart=${encodeURIComponent(latest[99].startsAt as string)}&afterId=${latest[99].id}`)
})

test('history: a failed page keeps what is shown; offline says so', async ({ page, context, api }) => {
  bookings(api, 130, addDays(todayIst(), -1), { status: 'COMPLETED' })
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'History' }).click()
  await expect(cards(page)).toHaveCount(100)
  api.failPages = 3
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText("Couldn't load more. Tap Show more to try again.")
  await expect(cards(page)).toHaveCount(100)
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText("You're offline")
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  await expect(cards(page)).toHaveCount(130)
})

test('the fake backend refuses half and unreadable cursors as the backend does', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const auth = api.calls.filter((c) => c.auth).at(-1)!.auth!
  const ask = (path: string) =>
    page.evaluate(
      async ([p, a]) => {
        const r = await fetch(`http://api.test/api/v1${p}`, { headers: { Authorization: a } })
        return { status: r.status, body: await r.json() }
      },
      [path, auth] as const,
    )
  const day = todayIst()
  expect(await ask('/salon/upcoming?afterId=a1')).toMatchObject({
    status: 400,
    body: { code: 'VALIDATION_FAILED', details: { afterId: 'send afterStart and afterId together' } },
  })
  expect(await ask('/salon/upcoming?afterStart=2026-11-06T04:30:00Z')).toMatchObject({ status: 400, body: { code: 'VALIDATION_FAILED' } })
  expect(await ask('/salon/upcoming?afterStart=yesterday&afterId=a1')).toMatchObject({ status: 400, body: { code: 'BAD_REQUEST' } })
  expect(await ask(`/salon/history?from=${day}&to=${day}&afterStart=2026-11-06T04:30:00Z&afterId=not-a-uuid`)).toMatchObject({
    status: 400,
    body: { code: 'BAD_REQUEST' },
  })
  expect(await ask('/me/notifications?app=partner&cursor=nope')).toMatchObject({ status: 400, body: { code: 'BAD_CURSOR' } })
})

test('messages: 30 a page, at most 300 kept on screen, then a note', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.inbox = Array.from({ length: 330 }, (_, i) => ({
    id: `n${i}`,
    type: 'SALON_NEW_BOOKING',
    title: `Booking ${i + 1}`,
    body: 'x',
    url: '/salon/day',
    sentAt: new Date(Date.now() - i * 60_000).toISOString(),
    read: true,
  }))
  await page.goto('/notifications')
  for (let n = 60; n <= 300; n += 30) {
    await page.getByRole('button', { name: 'Show older' }).click()
    await expect(page.getByText(/^Booking \d+$/)).toHaveCount(n)
  }
  await expect(page.getByText('Showing the latest 300 messages.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show older' })).toBeHidden()
})

test('a delta arriving while "Show more" loads is not lost: that tick is skipped and the next one carries the cancel', async ({ page, context, api }) => {
  const day = addDays(todayIst(), 1)
  bookings(api, 150, day)
  await atSalon(page, context, api)
  await openBookings(page)
  await expect(cards(page)).toHaveCount(100)
  const order = soonestFirst(api)
  api.slow.set('afterId=', 1500)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  // Cancelled by its customer while the next page loads, and the app comes back to the front meanwhile
  order[3].status = 'CANCELLED_BY_CUSTOMER'
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(cards(page)).toHaveCount(150)
  api.slow.clear()
  // No delta was taken during the load (the seq didn't move); the next refresh brings the cancel
  expect(api.upcomingDeltas.filter((d) => !d.full)).toHaveLength(0)
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(cards(page)).toHaveCount(149)
  expect(api.upcomingDeltas.at(-1)!.removed).toEqual([order[3].id])
  await expect(page.getByText(order[3].customerName as string, { exact: true })).toHaveCount(0)
})

test('a full reload that fails keeps polling: "Try again" brings the list up to date', async ({ page, context, api }) => {
  test.setTimeout(60_000)
  const day = addDays(todayIst(), 1)
  bookings(api, 150, day)
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
  // The setup changed (full: true), and the pages can't be read
  api.staff[0].name = 'Ravi K'
  api.failUpcomingPages = 20
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText("Couldn't refresh the list. It may be a little out of date.")).toBeVisible({ timeout: 20_000 })
  await expect(cards(page)).toHaveCount(150)
  api.failUpcomingPages = 0
  api.addBooking({ startsAt: istInstant(day, '00:00'), customerName: 'Customer back' })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Customer back')).toBeVisible()
  await expect(cards(page)).toHaveCount(151)
  await expect(page.getByText("Couldn't refresh the list.")).toHaveCount(0)
})

test('a booking message while the list is open asks one delta, not every page again', async ({ page, context, api }) => {
  const day = addDays(todayIst(), 1)
  bookings(api, 150, day)
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
  await page.waitForTimeout(300)
  const pagesBefore = upcomingCalls(api).length
  const sinceBefore = sinceCalls(api).length
  const all = api.calls.length
  api.addBooking({ startsAt: istInstant(day, '00:00'), customerName: 'Customer pushed' })
  // What the service worker posts to the open app when a push arrives
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { kind: 'push', type: 'SALON_NEW_BOOKING' } })),
  )
  await expect(page.getByText('Customer pushed')).toBeVisible()
  await page.waitForTimeout(800)
  expect(upcomingCalls(api).length - pagesBefore).toBe(0)
  expect(sinceCalls(api).length - sinceBefore).toBe(1)
  // Besides that one delta: only the messages' own reads (the bell), nothing else of the salon
  const others = api.calls.slice(all).filter((c) => !c.path.startsWith('/api/v1/salon/upcoming?since=') && !c.path.startsWith('/api/v1/me/notifications'))
  expect(others.map((c) => c.path)).toEqual([])
})

test('a full reload whose first page fails: Try again loads the pages again, so the changes behind full: true come', async ({ page, context, api }) => {
  test.setTimeout(60_000)
  const day = addDays(todayIst(), 1)
  bookings(api, 150, day)
  await atSalon(page, context, api)
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
  const order = soonestFirst(api)
  // A setup change and a cancel together (full: true); the reload's since=start works, its first page doesn't
  api.staff[0].name = 'Ravi K'
  order[3].status = 'CANCELLED_BY_CUSTOMER'
  api.failUpcomingPages = 3 // the first page and its two retries
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText("Couldn't refresh the list. It may be a little out of date.")).toBeVisible({ timeout: 20_000 })
  await expect(cards(page)).toHaveCount(150)
  const pagesBefore = upcomingCalls(api).length
  await page.getByRole('button', { name: 'Try again' }).click()
  // The pages again (not a delta from the seq of the load that failed), and the cancel shows
  await expect(cards(page)).toHaveCount(149)
  await expect(page.getByText(order[3].customerName as string, { exact: true })).toHaveCount(0)
  expect(upcomingCalls(api).length - pagesBefore).toBe(2)
  await expect(page.getByText("Couldn't refresh the list.")).toHaveCount(0)
})
