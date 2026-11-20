import { readFileSync } from 'node:fs'
import { expect, signedIn, test } from './helpers'

const te = (area: string) => JSON.parse(readFileSync(`src/i18n/te/${area}.json`, 'utf8')) as Record<string, string>

test('a first-time visitor sees About (for salons, with the price) first, with Sign in on it; sign-in links back to every page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole('heading', { name: 'Clozest for salons' })).toBeVisible()
  await expect(page.getByText('Clozest is operated by Premanshu Jha, a sole proprietor.')).toBeVisible()
  await expect(page.getByText(/₹500 a month per salon/)).toBeVisible()
  // The front page has no Back (nothing before it)
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Sign in or sign up' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByRole('navigation', { name: 'About Clozest' }).getByRole('link', { name: 'Refund policy' }).click()
  await expect(page.getByText(/Subscription payments are not refunded/)).toBeVisible()
  // Back goes to the screen before it
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/signin$/)
})

test('a first-time visitor picks Telugu on About: the page is in Telugu, and so is the sign-in screen after it', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/about$/)
  await page.getByRole('group', { name: 'Choose your language' }).getByRole('button', { name: 'తెలుగు' }).click()
  await expect(page.getByRole('heading', { level: 1, name: te('about').title })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
  // The amounts are the same figures, inside the Telugu sentence
  await expect(page.getByText(te('about').priceLine.replace('{price}', '500').replace('{days}', '30'))).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Clozest for salons' })).toHaveCount(0)

  await page.getByRole('link', { name: te('about').signInOrUp }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: te('auth').phoneSendCode })).toBeVisible()
  await expect(page.getByRole('button', { name: 'తెలుగు' })).toHaveAttribute('aria-pressed', 'true')
  // A real choice, kept on this phone
  await page.reload()
  await expect(page.getByRole('button', { name: te('auth').phoneSendCode })).toBeVisible()
  // The policies keep their English text, and say so in Telugu
  await page.getByRole('navigation', { name: te('misc').legalNavAria }).getByRole('link', { name: te('misc').legalRefunds }).click()
  await expect(page.getByRole('heading', { level: 1, name: te('about').refundsTitle })).toBeVisible()
  await expect(page.getByText(te('about').englishApplies)).toBeVisible()
  await expect(page.getByText(/Subscription payments are not refunded/)).toBeVisible()
})

test('someone who has signed in on this browser goes straight to sign-in at /, even after a reload (not About)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  await page.goto('/more')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  // A fresh load later (the installed app opens at /): still sign-in
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a saved session whose refresh is refused (expired, or from before this release): sign-in at /, even after a reload', async ({ page, context, api }) => {
  await signedIn(context, api)
  // The backend no longer knows the saved token (expired, or ended elsewhere)
  for (const t of api.refreshTokens.keys()) api.refreshTokens.set(t, 'revoked')
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a visit to / drops a path saved by an earlier visit, so signing up from About ends at the start', async ({ page }) => {
  await page.goto('/salon/day')
  await expect(page).toHaveURL(/\/signin$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/about$/)
  expect(await page.evaluate(() => localStorage.getItem('adp.returnTo'))).toBeNull()
})

for (const [path, title] of [
  ['/about', 'Clozest for salons'],
  ['/contact', 'Contact us'],
  ['/terms', 'Terms of service'],
  ['/privacy', 'Privacy policy'],
  ['/refunds', 'Refunds and cancellation'],
  ['/delivery', 'Shipping and delivery'],
] as const) {
  test(`opened straight from a link while signed out, ${path} shows (no sign-in first)`, async ({ page, api }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    // Nothing asks the backend for anything to show a public page (no session needed)
    expect(api.calls.filter((c) => !c.path.includes('/auth/refresh'))).toEqual([])
    if (path === '/about') {
      await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
    } else {
      // Nothing before it: Back goes to the front page, in its place, so the phone's Back doesn't loop back
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page).toHaveURL(/\/about$/)
      expect(await page.evaluate(() => (history.state as { idx?: number } | null)?.idx ?? 0)).toBe(0)
    }
  })
}

test('signed in: More links to the same pages, and Back returns to More', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  await page.goto('/more')
  await page.getByRole('navigation', { name: 'About Clozest' }).getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/more$/)
})

test('signed in and opened from a link, Back from a public page goes to the start', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of service' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  // The start (`/`), which the salon screens then take over: never sign-in, never the page again
  await expect(page).not.toHaveURL(/\/(terms|signin|about)$/)
  expect(await page.evaluate(() => (history.state as { idx?: number } | null)?.idx ?? 0)).toBe(0)
})
