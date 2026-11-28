import type { Page } from '@playwright/test'
import { atSalon, expect, signedIn, test } from './helpers'

/**
 * The kirana switch off (the default build, VITE_KIRANA_ENABLED unset): the salon app, nothing of the kirana's. No
 * "What do you run?", no /kirana/... page, no kirana tab or link, no call to /api/v1/kirana, no kirana download.
 */

/** The kirana's own downloads (React.lazy chunks): none may be fetched with the switch off. */
const KIRANA_CHUNK = /\/assets\/(Counter|Bills|Products|Khata|KhataPicker|KiranaRegister|KiranaLicences|KiranaTeam|Scanner|UpiQrCode|kirana|cart|forget|drafts|common|browser|esm)-[\w-]+\.js$/

function watchDownloads(page: Page): string[] {
  const seen: string[] = []
  page.on('request', (r) => {
    if (KIRANA_CHUNK.test(new URL(r.url()).pathname)) seen.push(r.url())
  })
  return seen
}

const noKiranaCall = (api: { calls: { path: string }[] }) => api.calls.filter((c) => c.path.startsWith('/api/v1/kirana'))

test('registration has no kirana choice: Start is for salons, and Register goes straight to the salon’s details', async ({ page, context, api }) => {
  const downloads = watchDownloads(page)
  // Even with "Kirana" picked on this phone earlier (a build with the switch on), it is a salon
  await signedIn(context, api, 'KIRANA', false)
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('I own a salon')).toBeVisible()
  await expect(page.getByText(/kirana/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'Register my salon' }).click()
  // "Before you start", in the salon's words
  await expect(page).toHaveURL(/\/register\/ready$/)
  await expect(page.getByText('Be at your salon')).toBeVisible()
  await expect(page.getByText(/kirana|FSSAI/i)).toHaveCount(0)
  await page.getByRole('button', { name: "I'm at my salon. Let's start" }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: 'Register your salon' })).toBeVisible()
  await expect(page.getByLabel('Salon name')).toBeVisible()
  await expect(page.getByText(/Registering a/)).toHaveCount(0)
  await expect(page.getByLabel('GSTIN (optional)')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Registration steps' }).getByText('Services')).toBeVisible()

  // "What do you run?" doesn't exist
  await page.goto('/register/kind')
  await expect(page.getByText('Page not found')).toBeVisible()
  await expect(page.getByRole('button', { name: /Kirana \/ general store/ })).toHaveCount(0)

  expect(noKiranaCall(api)).toEqual([])
  expect(downloads).toEqual([])
})

test('a salon has no kirana page, tab or link, and the app makes no kirana call', async ({ page, context, api }) => {
  const downloads = watchDownloads(page)
  await atSalon(page, context, api, 'OWNER')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible()
  for (const tab of ['Counter', 'Bills', 'Products', 'Khata']) await expect(nav.getByRole('link', { name: tab })).toHaveCount(0)

  await page.goto('/setup')
  await expect(page.getByRole('link', { name: /Team/ }).first()).toBeVisible()
  await page.goto('/more')
  await expect(page.locator('a[href^="/kirana"]')).toHaveCount(0)

  // An old link to a kirana page: the app's "Page not found", with the way back to today
  for (const path of ['/kirana/counter', '/kirana/bills', '/kirana/khata/c1', '/kirana/licences', '/register/upi']) {
    await page.goto(path)
    await expect(page.getByText('Page not found')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to today' })).toBeVisible()
  }

  expect(noKiranaCall(api)).toEqual([])
  expect(downloads).toEqual([])
})

test('a kirana shop (there shouldn’t be one) sees only "Kirana shops aren’t on Clozest yet"', async ({ page, context, api }) => {
  const downloads = watchDownloads(page)
  await signedIn(context, api)
  api.kiranaShop('OWNER')
  for (const path of ['/', '/salon/day', '/setup', '/more', '/notifications', '/setup/details']) {
    await page.goto(path)
    await expect(page.getByText("Kirana shops aren't on Clozest yet"), path).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  }
  // A draft kirana's owner on a registration step: the same
  api.kiranaShop('OWNER', { status: 'DRAFT' })
  await page.goto('/register/photos')
  await expect(page.getByText("Kirana shops aren't on Clozest yet")).toBeVisible()

  // Help and signing out still work
  await page.getByRole('link', { name: 'Write to support' }).click()
  await expect(page).toHaveURL(/\/help\?about=Kirana/)

  expect(api.calls.some((c) => c.path.startsWith('/api/v1/salon'))).toBe(false)
  expect(noKiranaCall(api)).toEqual([])
  expect(downloads).toEqual([])
})
