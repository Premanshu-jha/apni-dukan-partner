import { MockApi } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

test('someone who works at a salon sees the number to give the owner, and gets in once added', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  await page.getByRole('button', { name: 'I work at a salon' }).click()
  await expect(page.getByText('+91 98480 12345')).toBeVisible()
  await page.getByRole('button', { name: "I've been added, check again" }).click()
  await expect(page.getByText("You haven't been added to a salon yet.")).toBeVisible()

  api.addedToShop = MockApi.shopOf({ myRole: 'HELPER' })
  api.members = [{ userId: 'u1', name: 'Ravi Kumar', phone: '9848012345', role: 'HELPER', staffId: null, walkInAccess: false }]
  await page.getByRole('button', { name: "I've been added, check again" }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  // A fresh token was fetched so it carries the shop
  expect(api.calls.filter((c) => c.path === '/api/v1/auth/refresh').length).toBeGreaterThanOrEqual(2)
})

test('a kirana shop sees "coming soon" and no kirana screens at all', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ type: 'KIRANA' })
  for (const path of ['/', '/salon/day', '/setup', '/more']) {
    await page.goto(path)
    await expect(page.getByText('Kirana partners: coming soon')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  }
  expect(api.calls.some((c) => c.path.startsWith('/api/v1/salon'))).toBe(false)
})

test('a helper of a salon not approved yet waits; the owner meanwhile sets up', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'PENDING_VISIT', myRole: 'HELPER' })
  api.role = 'HELPER'
  await page.goto('/salon/day')
  await expect(page.getByText("Your salon isn't live yet")).toBeVisible()
  // The field team approves; "check again" lets them in
  api.shop = MockApi.shopOf({ status: 'APPROVED', myRole: 'HELPER' })
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
})

test('a suspended salon shows why, and the day can only be looked at', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER', { status: 'SUSPENDED', statusReason: 'Shop found closed at the visit.' })
  api.addBooking({ startsAt: new Date(Date.now() + 5 * 60_000).toISOString() })
  await page.goto('/salon/day')
  await expect(page.getByText('Shop found closed at the visit.')).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Walk-in' })).toBeHidden()
  await expect(page.getByText('Pause online bookings')).toBeHidden()
  await page.getByText('Riya Sharma').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start' })).toBeHidden()
})

test('each role sees its own tabs and is kept out of screens it cannot use', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveText([/Today$/, /Bookings$/, /More$/])
  await page.goto('/setup/services')
  await expect(page).toHaveURL(/\/salon\/day$/)
  await page.goto('/team')
  await expect(page).toHaveURL(/\/salon\/day$/)
  // A barber sees only his own column
  await expect(page.getByRole('button', { name: 'Everyone' })).toBeHidden()
  await expect(page.getByText('Imran ·')).toBeVisible()
  await expect(page.getByText('Ravi ·')).toBeHidden()
})

test('a helper has Salon to look at but not to change, and no Team or closed days', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.getByRole('link', { name: 'Salon' }).click()
  await expect(page.getByText('Only the owner can change these.')).toBeVisible()
  await page.getByRole('link', { name: /Services and prices/ }).click()
  await expect(page.getByRole('button', { name: '+ Add a service' })).toBeHidden()
  await page.goto('/more')
  await expect(page.getByRole('link', { name: 'Team and walk-in access' })).toBeHidden()
  await expect(page.getByRole('link', { name: 'Closed days' })).toBeHidden()
  await page.goto('/salon/closures')
  await expect(page).toHaveURL(/\/salon\/day$/)
})

test('signed out: every screen goes to sign-in, and a link opened then comes back after sign-in', async ({ page, api }) => {
  api.user = MockApi.completeUser()
  api.approvedSalon()
  await page.goto('/salon/bookings')
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByLabel('Mobile number').fill('9848012345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/salon\/bookings$/)
})
