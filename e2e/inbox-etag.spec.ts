import { atSalon, expect, test } from './helpers'

/** Counts DOM changes inside the first element matching `selector` from now on. */
async function watch(page: import('@playwright/test').Page, selector: string) {
  await page.evaluate((sel) => {
    const w = window as unknown as { changes: number }
    w.changes = 0
    new MutationObserver((list) => (w.changes += list.length)).observe(document.querySelector(sel)!, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
  }, selector)
  return () => page.evaluate(() => (window as unknown as { changes: number }).changes)
}

test('an unchanged bell and message list are answered 304 and nothing on screen changes', async ({ page, context, api }) => {
  api.inbox = [1, 2, 3].map((i) => ({
    id: `n${i}`, type: 'SALON_NEW_BOOKING', title: `New booking ${i}`, body: 'x', url: '/salon/day', sentAt: new Date(Date.now() - i * 60_000).toISOString(), read: false,
  }))
  await atSalon(page, context, api)
  const bell = page.getByRole('link', { name: 'Messages, 3 unread' })
  await expect(bell).toBeVisible()
  const count = '/api/v1/me/notifications/unread-count?app=partner'
  const bellChanges = await watch(page, 'a[href="/notifications"]')
  // Coming back to the app asks again with the ETag it holds
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.notModified.filter((p) => p === count).length).toBeGreaterThan(0)
  const asked = api.calls.filter((c) => c.path === count)
  expect(asked.length).toBeGreaterThan(1)
  expect(await bellChanges()).toBe(0)
  await expect(bell).toBeVisible()

  await bell.click()
  await expect(page.getByText('New booking 3')).toBeVisible()
  const list = '/api/v1/me/notifications?app=partner'
  const listChanges = await watch(page, 'main ul')
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => api.notModified.filter((p) => p === list).length).toBeGreaterThan(0)
  expect(await listChanges()).toBe(0)

  // A new message: 200 with the new list, and the bell and list show it
  api.inbox.unshift({ id: 'n0', type: 'SALON_NEW_BOOKING', title: 'New booking 0', body: 'x', url: '/salon/day', sentAt: new Date().toISOString(), read: false })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('New booking 0')).toBeVisible()
  await expect(page.getByText('4 unread')).toBeVisible()
})
