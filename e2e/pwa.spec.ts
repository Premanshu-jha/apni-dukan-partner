import { atSalon, expect, test } from './helpers'

/** Waits until the service worker controls the page (it takes control on its first start). */
async function controlled(page: import('@playwright/test').Page) {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready
    return navigator.serviceWorker.controller !== null
  })
}

test('the built site sends the security headers (as Caddy does on Railway)', async ({ page }) => {
  const res = (await page.goto('/signin'))!
  const h = res.headers()
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['content-security-policy']).toContain("connect-src 'self' http://api.test")
  expect(h['strict-transport-security']).toContain('max-age=')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['permissions-policy']).toContain('geolocation=(self)')
})

test('installable: the manifest lists PNG icons (192, 512, maskable) that load, and the iPhone icon', async ({ page }) => {
  await page.goto('/signin')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'Clozest Partner', short_name: 'Clozest Pro', id: '/', start_url: '/', scope: '/', display: 'standalone', theme_color: '#0b0f26' })
  const icons = manifest.icons as Array<{ src: string; sizes: string; type: string; purpose: string }>
  expect(icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ src: '/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' }),
    ]),
  )
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  for (const src of [...icons.map((i) => i.src), appleIcon!]) {
    const res = await page.request.get(src)
    expect(res.ok(), src).toBe(true)
    expect(res.headers()['content-type'], src).toMatch(/image\/(png|svg\+xml)/)
  }
})

// "New version available — Reload" is covered by unit tests (src/lib/swUpdate.test.tsx, src/sw.test.ts): the browser
// fetches a service worker update itself, outside what Playwright can route, so a test can't serve a "next" sw.js.

test('opened without a connection: the offline page, and "Try again" opens the app once back online', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await controlled(page)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible()
  await expect(page).toHaveURL(/\/salon\/day$/)

  await context.setOffline(false)
  await page.getByRole('link', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})
