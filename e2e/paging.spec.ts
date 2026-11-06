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
const upcomingCalls = (api: MockApi) => api.calls.filter((c) => c.path.startsWith('/api/v1/salon/upcoming'))

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

test('a refresh asks again only the pages on screen, each answered 304 ("s1-" tag) when unchanged', async ({ page, context, api }) => {
  bookings(api, 150, addDays(todayIst(), 1))
  await atSalon(page, context, api)
  // The day board's own tag: coming back to the app gets a 304 and keeps the board
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.notModified.some((p) => p.startsWith('/api/v1/salon/day'))).toBe(true)
  await openBookings(page)
  await page.getByRole('button', { name: 'Show more bookings' }).click()
  await expect(cards(page)).toHaveCount(150)
  const before = upcomingCalls(api).length
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.notModified.filter((p) => p.startsWith('/api/v1/salon/upcoming')).length).toBe(2)
  // Two pages loaded, two asked again: no third
  await page.waitForTimeout(500)
  expect(upcomingCalls(api).length - before).toBe(2)
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
  // The two loaded pages asked again, no more
  expect(upcomingCalls(api).length - before).toBe(2)
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
