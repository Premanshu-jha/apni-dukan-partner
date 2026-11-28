import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { addDays, API, MockApi, todayIst } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

type Texts = Record<string, string>
const read = (lang: string, area: string) => JSON.parse(readFileSync(`src/i18n/${lang}/${area}.json`, 'utf8')) as Texts

/** This phone's saved language (and, for an account, its own), before the app starts. */
async function savedLanguage(page: Page, values: Record<string, string>) {
  await page.context().addInitScript((v) => {
    if (localStorage.getItem('e2e.language')) return
    localStorage.setItem('e2e.language', '1')
    for (const [k, x] of Object.entries(v)) localStorage.setItem(k, x)
  }, values)
}

/** PATCH /auth/me from the page with the session's token, as the app sends it: the status and the answer's body. */
async function patchMe(page: Page, api: MockApi, body: unknown) {
  const token = [...api['accessValid']].at(-1) ?? ''
  return page.evaluate(
    async ({ url, body, token }) => {
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      return { status: r.status, body: (await r.json()) as { code?: string; details?: Record<string, string>; language?: string | null; name?: string } }
    },
    { url: `${API}/api/v1/auth/me`, body, token },
  )
}

test('the fake backend answers PATCH /auth/me as AuthController.updateMe does', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const empty = await patchMe(page, api, {})
  expect(empty.status).toBe(400)
  expect(empty.body.code).toBe('VALIDATION_FAILED')
  expect(Object.keys(empty.body.details!)).toEqual(['name'])
  const set = await patchMe(page, api, { language: 'kn' })
  expect([set.status, set.body.language]).toEqual([200, 'kn'])
  const cleared = await patchMe(page, api, { language: null })
  expect([cleared.status, cleared.body.language]).toEqual([200, null])
  expect(api.user.language).toBeNull()
  const badLanguage = await patchMe(page, api, { language: 'fr' })
  expect(badLanguage.status).toBe(400)
  expect(Object.keys(badLanguage.body.details!)).toEqual(['language'])
  // Both wrong: only the name is reported (the size check comes first), and nothing is saved
  const both = await patchMe(page, api, { name: 'R', language: 'fr' })
  expect(both.status).toBe(400)
  expect(Object.keys(both.body.details!)).toEqual(['name'])
  expect(api.user.name).toBe(MockApi.completeUser().name)
})

test('a sent-back registration: each step shows its own reasons first, and the others link to their step', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT', statusReason: null, statusReasonCodes: ['HOURS_MISSING', 'LICENCE_EXPIRED', 'INSIDE_PHOTOS', 'OTHER'] })
  await page.goto('/register/photos')
  const list = page.getByRole('list', { name: 'What to fix:' })
  await expect(list.getByRole('listitem')).toHaveText([
    'The trade licence has expired',
    'Photos of the inside are missing or not clear',
    /^Opening hours are missing/,
    'Something else (see the note)',
  ])
  // The licence and photos are fixed on this step: first, without a link; "Something else" has no one place
  await expect(list.getByRole('link')).toHaveCount(1)
  await list.getByRole('link', { name: 'Fix: Opening hours are missing' }).click()
  await expect(page).toHaveURL(/\/register\/hours$/)
  await expect(page.getByRole('list', { name: 'What to fix:' }).getByRole('listitem').first()).toHaveText('Opening hours are missing')
})

test('a fix asked on a live salon links each reason to its page, in the reader\'s language', async ({ page, context, api }) => {
  await savedLanguage(page, { language: 'te', 'language:u1': 'te' })
  await signedIn(context, api)
  api.user = { ...api.user, language: 'te' }
  api.approvedSalon()
  api.askToFix(null, ['LICENCE_EXPIRED', 'HOURS_MISSING'])
  await page.goto('/salon/day')
  const te = read('te', 'review')
  const list = page.getByRole('list', { name: te.whatToFix })
  await expect(list.getByRole('link')).toHaveCount(2)
  await expect(list.getByRole('link').first()).toHaveText(te.fixLink)
  // Every reason has its own place: the general "where to fix it" sentence isn't needed
  await expect(page.getByText(read('te', 'shop').recheckFixWhereList)).toHaveCount(0)
  await list.getByRole('link', { name: te.fixAria.replace('{reason}', te.reasonLICENCE_EXPIRED) }).click()
  await expect(page).toHaveURL(/\/setup\/document$/)
})

test('after a declined address request the form starts from that request, to fix rather than type it all again', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER', { addressLocked: true })
  api.addressRequests.push({
    id: 'ar1', addressLine: 'Plot 4, New Market', area: 'Sector 18', city: 'Noida', pincode: '201301', latitude: 28.57, longitude: 77.32,
    status: 'PENDING', reason: null, statusReasonCodes: [], createdAt: new Date().toISOString(), decidedAt: null,
  })
  api.decideAddressRequest(false, null, ['PIN_WRONG_PLACE'])
  await page.goto('/setup/address')
  await expect(page.getByLabel('Shop number, building, street')).toHaveValue('Plot 4, New Market')
  await expect(page.getByLabel('Area')).toHaveValue('Sector 18')
  await expect(page.getByLabel('Pincode')).toHaveValue('201301')
})

test('a declined request the field team has since overtaken (they set the address) isn\'t where the form starts', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER', { addressLocked: true })
  api.addressRequests.push({
    id: 'ar1', addressLine: 'Plot 4, New Market', area: 'Sector 18', city: 'Noida', pincode: '201301', latitude: 28.57, longitude: 77.32,
    status: 'PENDING', reason: null, statusReasonCodes: [], createdAt: new Date().toISOString(), decidedAt: null,
  })
  api.decideAddressRequest(false, null, ['PIN_WRONG_PLACE'])
  const later = new Date(Date.now() + 60_000).toISOString()
  api.shop = { ...api.shop!, addressLine: 'Shop 9, Old Market', updatedAt: later }   // moved by the field team afterwards
  await page.goto('/setup/address')
  await expect(page.getByLabel('Shop number, building, street')).not.toHaveValue('Plot 4, New Market')
})

test.describe('the phone\'s own language', () => {
  test.use({ locale: 'ta-IN' })

  test('someone signed in before languages came keeps the Tamil showing with one tap: saved on the phone and the account', async ({ page, context, api }) => {
    await signedIn(context, api)
    api.approvedSalon()
    await page.goto('/salon/day')
    const ta = read('ta', 'language')
    const offer = page.getByRole('region', { name: ta.offerTitle })
    await offer.getByRole('button', { name: ta.keepShown.replace('{name}', 'தமிழ்') }).click()
    await expect(offer).toHaveCount(0)
    await expect.poll(() => api.languagePatches).toEqual(['ta'])
    expect(await page.evaluate(() => localStorage.getItem('language'))).toBe('ta')
  })

  test('the first screen puts it first and marks it, in it; one tap and sign-in is in it: saved for the offline page and on the account', async ({ page, api }) => {
    api.user = MockApi.completeUser()
    api.approvedSalon()
    await page.goto('/signin')
    await expect(page).toHaveURL(/\/language$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('உங்கள் மொழியைத் தேர்ந்தெடுங்கள்')
    const buttons = page.getByRole('group').getByRole('button')
    await expect(buttons.first()).toHaveAccessibleName('தமிழ், Tamil')
    await buttons.first().click()
    const auth = read('ta', 'auth')
    await page.getByLabel(auth.phoneLabel).fill('9848012345')
    await page.getByRole('button', { name: auth.phoneSendCode }).click()
    await page.getByLabel(auth.codeLabel).fill('123456')
    await expect(page.getByRole('navigation', { name: read('ta', 'app').navMain })).toBeVisible()
    await expect.poll(() => api.languagePatches).toEqual(['ta'])
    expect(await page.evaluate(() => localStorage.getItem('language'))).toBe('ta')
    await page.goto('/offline.html')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ta')
  })

  test('picked on a new phone\'s first screen, the language is the phone\'s: an account with its own (from another phone) keeps it, nothing sent', async ({ page, api }) => {
    api.user = { ...MockApi.completeUser(), language: 'kn' }
    api.approvedSalon()
    await page.goto('/signin')
    await page.getByRole('button', { name: /^தமிழ்/ }).click()
    const auth = read('ta', 'auth')
    await page.getByLabel(auth.phoneLabel).fill('9848012345')
    await page.getByRole('button', { name: auth.phoneSendCode }).click()
    await page.getByLabel(auth.codeLabel).fill('123456')
    // A helper may have set the phone up: the owner's own language comes back
    await expect(page.getByRole('navigation', { name: read('kn', 'app').navMain })).toBeVisible()
    await page.waitForTimeout(300)
    expect(api.languagePatches).toEqual([])
  })

  test('a phone with a language chosen before: the account\'s own language (from another phone) wins, and nothing is sent', async ({ page, context, api }) => {
    await context.addInitScript(() => {
      if (!localStorage.getItem('language')) localStorage.setItem('language', 'ta')
    })
    api.user = { ...MockApi.completeUser(), language: 'kn' }
    api.approvedSalon()
    await page.goto('/signin')
    const auth = read('ta', 'auth')
    await page.getByLabel(auth.phoneLabel).fill('9848012345')
    await page.getByRole('button', { name: auth.phoneSendCode }).click()
    await page.getByLabel(auth.codeLabel).fill('123456')
    await expect(page.getByRole('navigation', { name: read('kn', 'app').navMain })).toBeVisible()
    await page.waitForTimeout(300)
    expect(api.languagePatches).toEqual([])
  })
})

for (const lang of ['ta', 'kn'] as const) {
  test(`long pills fit a 360px phone in ${lang}: an invited barber, an offer ended early`, async ({ page, context, api }) => {
    await page.setViewportSize({ width: 360, height: 760 })
    await savedLanguage(page, { language: lang, 'language:u1': lang })
    await signedIn(context, api)
    api.user = { ...api.user, language: lang }
    api.approvedSalon()
    api.staff[0].invitedPhone = '9848012345'
    api.staff[0].name = 'Venkatanarasimharajuvaripeta Ravi'
    api.offers.push({
      offer: { id: 'of9', percentOff: 20, allServices: true, serviceIds: [], startsOn: addDays(todayIst(), -2), endsOn: addDays(todayIst(), 3), from: null, until: null },
      createdAt: new Date().toISOString(), endedAt: new Date().toISOString(), notified: 3, bookings: 0,
    })
    const fits = async () => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(over).toBeLessThanOrEqual(0)
    }
    await page.goto('/setup/staff')
    const invited = page.getByText(read(lang, 'setup').invited.replace('{phone}', '98480 12345'))
    await expect(invited).toBeVisible()
    await fits()
    const card = await page.getByRole('link').filter({ has: invited }).boundingBox()
    const pill = await invited.boundingBox()
    expect(pill!.x + pill!.width).toBeLessThanOrEqual(card!.x + card!.width)
    await page.goto('/salon/offers')
    const ended = page.getByText(read(lang, 'offers').endedEarly)
    await expect(ended).toBeVisible()
    await fits()
    const box = await ended.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(360)
  })
}
