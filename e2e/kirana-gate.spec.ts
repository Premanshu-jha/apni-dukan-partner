import { expect, signedIn, test } from './helpers'

/**
 * The kirana switch on (the second Playwright project, built with VITE_KIRANA_ENABLED=true): the gate keeps a kirana's
 * people on kirana screens, and Start asks "What do you run?" before a salon's steps.
 */
test("a kirana's people see only kirana screens, and a salon's only salon screens", async ({ page, context, api }) => {
  await signedIn(context, api)
  api.kiranaShop('OWNER')
  for (const path of ['/', '/salon/day', '/setup', '/salon/walk-in', '/subscription']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/kirana\/counter$/)
  }
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Khata' })).toBeVisible()
  expect(api.calls.some((c) => c.path.startsWith('/api/v1/salon'))).toBe(false)

  api.approvedSalon('OWNER')
  const before = api.calls.length
  await page.goto('/kirana/counter')
  await expect(page).toHaveURL(/\/salon\/day$/)
  expect(api.calls.slice(before).some((c) => c.path.startsWith('/api/v1/kirana'))).toBe(false)
})

test('with the switch on, Start says "shop", and a salon is registered after "What do you run?"', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('I own a shop')).toBeVisible()
  await expect(page.getByRole('button', { name: 'I work at a shop' })).toBeVisible()
  // /register with nothing picked yet: "What do you run?" comes first
  await page.goto('/register')
  await expect(page).toHaveURL(/\/register\/kind$/)
  await page.goto('/start')
  await page.getByRole('button', { name: 'Register my shop' }).click()
  await expect(page).toHaveURL(/\/register\/kind$/)
  await page.getByRole('button', { name: /Salon \/ barber shop/ }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByText('Registering a Salon / barber shop')).toBeVisible()
  await expect(page.getByLabel('Salon name')).toHaveValue('')
})
