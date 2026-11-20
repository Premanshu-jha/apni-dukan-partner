import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { MockApi, minutesFromNow } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

type Texts = Record<string, string>
const read = (lang: string, area: string) => JSON.parse(readFileSync(`src/i18n/${lang}/${area}.json`, 'utf8')) as Texts
const hi = (area: string) => read('hi', area)
const te = (area: string) => read('te', area)

/** This phone's saved language (and, for an account, its own), before the app starts. */
async function savedLanguage(page: Page, values: Record<string, string>) {
  await page.context().addInitScript((v) => {
    if (localStorage.getItem('e2e.language')) return
    localStorage.setItem('e2e.language', '1')
    for (const [k, x] of Object.entries(v)) localStorage.setItem(k, x)
  }, values)
}

test('choosing a language tells the backend once (PATCH /me), confirms in the new language, and is not sent again', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('region', { name: 'Use the app in your language' }).getByRole('button', { name: 'తెలుగు' }).click()
  // The confirmation, in Telugu, says where to change it (More → Language, in Telugu's words)
  await expect(page.getByRole('status').filter({ hasText: te('language').changedToast })).toBeVisible()
  await expect.poll(() => api.languagePatches).toEqual(['te'])
  expect(api.user.language).toBe('te')
  await page.reload()
  await expect(page.getByRole('heading', { name: te('day').dayToday })).toBeVisible()
  await page.waitForTimeout(300)
  expect(api.languagePatches).toEqual(['te']) // the backend has it: nothing more
})

test('a send that failed is tried again at the next start', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.failLanguagePatches = 1
  await page.getByRole('region', { name: 'Use the app in your language' }).getByRole('button', { name: 'हिन्दी' }).click()
  await expect.poll(() => api.languagePatches).toEqual(['hi'])
  expect(api.user.language).toBeNull()
  await page.reload()
  await expect.poll(() => api.languagePatches).toEqual(['hi', 'hi'])
  expect(api.user.language).toBe('hi')
})

test('a language chosen on the sign-in screen is sent once after signing in', async ({ page, api }) => {
  api.user = MockApi.completeUser()
  api.approvedSalon()
  await page.goto('/signin')
  await page.getByLabel('Mobile number').fill('9848012345')
  await page.getByRole('button', { name: 'हिन्दी' }).click()
  await page.getByRole('button', { name: hi('auth').phoneSendCode }).click()
  await page.getByLabel(hi('auth').codeLabel).fill('123456')
  await expect(page.getByRole('navigation', { name: hi('app').navMain })).toBeVisible()
  await expect.poll(() => api.languagePatches).toEqual(['hi'])
})

test('each account keeps its own language on a shared phone; signed out, the sign-in screen keeps the last one', async ({ page, context, api }) => {
  // Someone else last used this phone in Hindi; this owner chose Telugu here before
  await savedLanguage(page, { language: 'hi', 'language:u1': 'te' })
  await signedIn(context, api)
  api.approvedSalon()
  await page.goto('/salon/day')
  await expect(page.getByRole('navigation', { name: te('app').navMain })).toBeVisible()
  // More → sign out: the sign-in screen stays in his Telugu (the phone's last language)
  await page.getByRole('navigation', { name: te('app').navMain }).getByRole('link', { name: te('app').tabMore }).click()
  await page.getByRole('button', { name: te('profile').signOut, exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
})

test("the field team's reasons show in the reader's language as a list, with their note under it", async ({ page, context, api }) => {
  await savedLanguage(page, { language: 'hi', 'language:u1': 'hi' })
  await signedIn(context, api)
  api.approvedSalon()
  api.askToFix('Board is hidden behind a tree.', ['BOARD_NOT_VISIBLE', 'VIDEO_UNCLEAR'])
  await page.goto('/salon/day')
  const list = page.getByRole('list', { name: hi('review').whatToFix })
  // Each with "Fix ›" to the page where it is fixed (both: Photos and video)
  const fix = hi('review').fixLink
  await expect(list.getByRole('listitem')).toHaveText([hi('review').reasonBOARD_NOT_VISIBLE + fix, hi('review').reasonVIDEO_UNCLEAR + fix])
  await expect(list.getByRole('link').first()).toHaveAttribute('href', '/setup/photos')
  await expect(page.getByText(hi('review').noteFromTeam)).toBeVisible()
  await expect(page.getByText('Board is hidden behind a tree.')).toBeVisible() // their words, as written
})

test('a declined address lists the team\'s reasons (an old decline without codes keeps its sentence: edit-code.spec)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER', { addressLocked: true })
  api.addressRequests.push({
    id: 'ar1', addressLine: 'Plot 4, New Market', area: 'Sector 18', city: 'Noida', pincode: '201301', latitude: 28.57, longitude: 77.32,
    status: 'PENDING', reason: null, statusReasonCodes: [], createdAt: new Date().toISOString(), decidedAt: null,
  })
  api.decideAddressRequest(false, null, ['ADDRESS_WRONG'])
  await page.goto('/setup/address')
  await expect(page.getByText("Your last request (Plot 4, New Market) wasn't approved. Your address stays as it was; you can send a new one below.")).toBeVisible()
  await expect(page.getByRole('list', { name: 'What to fix:' }).getByRole('listitem')).toHaveText(['The address is wrong'])
})

test('every booking card shows its services\' pictures, on Today and on Bookings', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(60), serviceIds: ['v1', 'v2'] })
  await page.goto('/salon/day')
  const card = page.getByRole('button').filter({ hasText: 'Riya Sharma' })
  await expect(card.getByTestId('card-service-icons').locator('svg')).toHaveCount(2)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Bookings' }).click()
  await expect(page.getByRole('button').filter({ hasText: 'Riya Sharma' }).getByTestId('card-service-icons').locator('svg')).toHaveCount(2)
})

test('a cold start shows the saved language at once from its cached texts, then the download refreshes them', async ({ page, context, api }) => {
  const marker = 'CACHED-TODAY'
  await savedLanguage(page, {
    language: 'hi',
    'language:u1': 'hi',
    'language.texts': JSON.stringify({ lang: 'hi', messages: { ...Object.fromEntries(['app', 'day', 'common', 'language'].map((a) => [a, hi(a)])), day: { ...hi('day'), dayToday: marker } } }),
  })
  // Hold the Hindi download until the cached texts were seen
  let release = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/assets/*.js', async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    const probe = hi('language').profileHint
    const escaped = probe.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
    if (body.includes(probe) || body.includes(escaped)) await held
    await route.fulfill({ response, body })
  })
  await signedIn(context, api)
  api.approvedSalon()
  await page.goto('/salon/day')
  await expect(page.getByRole('heading', { name: marker })).toBeVisible() // Hindi from the cache, no English first
  await expect(page.getByRole('navigation', { name: hi('app').navMain })).toBeVisible()
  release()
  await expect(page.getByRole('heading', { name: hi('day').dayToday })).toBeVisible()
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('language.texts') ?? '{}').messages?.day?.dayToday)
  expect(kept).toBe(hi('day').dayToday)
})

test('More has a language button at the top that leads to the picker', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('region', { name: 'Use the app in your language' }).getByRole('button', { name: 'Keep English' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Language: English' }).click()
  await expect(page.getByRole('button', { name: 'English', exact: true })).toBeFocused()
})

test('the offline page speaks the saved language', async ({ page, context, api }) => {
  await savedLanguage(page, { language: 'te' })
  await signedIn(context, api)
  await page.goto('/offline.html')
  await expect(page.getByRole('heading', { name: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'మళ్లీ ప్రయత్నించండి' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
})
