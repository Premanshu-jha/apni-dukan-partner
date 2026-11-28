import { readFileSync } from 'node:fs'
import { atSalon, expect, languageKept, signedIn, test } from './helpers'

const hi = (area: string) => JSON.parse(readFileSync(`src/i18n/hi/${area}.json`, 'utf8')) as Record<string, string>

test('a new phone opens on the language screen; Hindi is chosen once and sign-in is in Hindi, with Change', async ({ page }) => {
  await page.goto('/signin')
  // Nothing chosen yet: the language comes first, each language in its own script with its English name
  await expect(page).toHaveURL(/\/language$/)
  await expect(page.getByRole('heading', { name: 'Choose your language' })).toBeVisible()
  for (const name of ['हिन्दी, Hindi', 'తెలుగు, Telugu', 'मराठी, Marathi', 'தமிழ், Tamil', 'ಕನ್ನಡ, Kannada', 'English']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  // No Back on a first choice (nothing chosen to go back to)
  await expect(page.getByRole('link', { name: 'Back' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  await page.getByRole('button', { name: /^हिन्दी/ }).click()

  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: hi('auth').phoneSendCode })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  // Kept on this phone: a reload goes straight to sign-in, in Hindi
  await page.reload()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: hi('auth').phoneSendCode })).toBeVisible()

  // Change (also said in English): the language screen again, now with Back; the number typed is still there after
  await page.getByLabel(hi('auth').phoneLabel).fill('98480')
  await page.getByRole('link', { name: `${hi('language').change} (Change)` }).click()
  await expect(page).toHaveURL(/\/language$/)
  await expect(page.getByRole('heading', { name: 'अपनी भाषा चुनें' })).toBeVisible()
  await page.getByRole('button', { name: hi('common').back }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByLabel(hi('auth').phoneLabel)).toHaveValue('98480')
  await page.getByRole('link', { name: `${hi('language').change} (Change)` }).click()
  await page.getByRole('button', { name: /^English/ }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
  await expect(page.getByLabel('Mobile number')).toHaveValue('98480')
  await expect(page.getByText('Language:')).toBeVisible()
  // Went back the step it came: Back leaves sign-in (no second sign-in in the history)
  await page.goBack()
  await expect(page).not.toHaveURL(/\/signin$/)
})

test('Change keeps the "number may have moved" notice and its number', async ({ page, context }) => {
  await languageKept(context)
  await context.addInitScript(() => {
    if (sessionStorage.getItem('e2e.moved')) return
    sessionStorage.setItem('e2e.moved', '1')
    sessionStorage.setItem('ad.phoneMovedTo', JSON.stringify({ phone: '+919000000001', at: Date.now() }))
  })
  await page.goto('/signin')
  const notice = page.getByText(/Your number was probably changed/)
  await expect(notice).toBeVisible()
  await page.getByRole('link', { name: 'Change' }).click()
  await page.getByRole('button', { name: /^English/ }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(notice).toBeVisible()
  await expect(page.getByLabel('Mobile number')).toHaveValue(/9000000001/)
})

test('a slow language download never holds the first screen: another tap (English) goes on at once', async ({ page }) => {
  // Telugu's words take a long time to arrive
  await page.route('**/assets/**', async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    if (body.includes('మీ భాష')) await new Promise((r) => setTimeout(r, 8000))
    await route.fulfill({ response, body })
  })
  await page.goto('/signin')
  await expect(page).toHaveURL(/\/language$/)
  await page.getByRole('button', { name: /^తెలుగు/ }).click()
  await page.getByRole('button', { name: /^English/ }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
  // Telugu arriving later changes nothing
  await page.waitForTimeout(8500)
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('a language that can’t be downloaded (offline) says so on the first screen, and the person can pick again', async ({ page, context }) => {
  await page.goto('/signin')
  await expect(page).toHaveURL(/\/language$/)
  await context.setOffline(true)
  await page.getByRole('button', { name: /^తెలుగు/ }).click()
  // Said in Telugu (the person tapped it because they read it), and in English, with English as the way on
  await expect(page.getByRole('alert')).toContainText('భాష డౌన్‌లోడ్ కాలేదు')
  await expect(page.getByRole('alert')).toContainText('or tap English')
  await expect(page).toHaveURL(/\/language$/)
  // English is in the app: it works offline too
  await page.getByRole('button', { name: /^English/ }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await context.setOffline(false)
})

test('Before you start: "not at my salon now" says it can wait with nothing lost; at the salon, step 1 opens with the reminder', async ({ page, context, api }) => {
  await languageKept(context)
  await signedIn(context, api, 'SALON', false)
  await page.goto('/start')
  await page.getByRole('button', { name: 'Register my salon' }).click()
  await expect(page).toHaveURL(/\/register\/ready$/)
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
  const points = page.getByRole('list', { name: 'Before you start' }).getByRole('listitem')
  await expect(points).toHaveCount(3)
  await expect(points.nth(0)).toContainText('Be at your salon')
  await expect(page.getByText(/about 10 minutes\. Each step is saved when you finish it/)).toBeVisible()

  await page.getByRole('button', { name: "I'm not at my salon now" }).click()
  await expect(page.getByText('No problem')).toBeVisible()
  await expect(page.getByText('Come back to the app when you are at your salon and tap “Register my salon”. Nothing is lost.')).toBeVisible()
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page).toHaveURL(/\/start$/)

  // A link straight to step 1 still asks first
  await page.goto('/register')
  await expect(page).toHaveURL(/\/register\/ready$/)
  await page.getByRole('button', { name: "I'm not at my salon now" }).click()
  await page.getByRole('button', { name: 'I am at my salon now' }).click()
  await page.getByRole('button', { name: "I'm at my salon. Let's start" }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByText('Stand inside your salon, then tap “Use my location”.')).toBeVisible()
  // Answered once on this phone: a reload stays on step 1
  await page.reload()
  await expect(page).toHaveURL(/\/register$/)
  // Once the location is taken, the reminder has done its job
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText('GPS was accurate to about 30 m.')).toBeVisible()
  await expect(page.getByText('Stand inside your salon, then tap “Use my location”.')).toHaveCount(0)
  // Start's button again: answered already, straight to step 1 (not asked twice)
  await page.goto('/start')
  await page.getByRole('button', { name: 'Register my salon' }).click()
  await expect(page).toHaveURL(/\/register$/)
})

test('Before you start is in the language chosen', async ({ page, context, api }) => {
  await context.addInitScript(() => localStorage.setItem('language', 'hi'))
  await signedIn(context, api, 'SALON', false)
  await page.goto('/register/ready')
  await expect(page.getByRole('heading', { name: hi('register').readyTitle })).toBeVisible()
  await expect(page.getByText(hi('register').readyBeThere)).toBeVisible()
  await expect(page.getByRole('button', { name: hi('register').readyStart })).toBeVisible()
})

test('the location far from the address found asks whether the owner is at the salon; close by, it doesn’t', async ({ page, context, api }) => {
  await languageKept(context)
  await signedIn(context, api)
  // An exact address about 900 m from where the phone is
  api.geocode = { latitude: 28.6215, longitude: 77.3652, precision: 'EXACT', formattedAddress: 'Ithum Tower, Noida' }
  await page.goto('/register')
  await page.getByLabel('Shop number, building, street').fill('Shop 12, Ithum Tower')
  await page.getByLabel('Area').fill('Sector 62')
  await page.getByLabel('City').fill('Noida')
  await page.getByLabel('Pincode').fill('201309')
  await page.getByRole('button', { name: 'Find my salon on the map' }).click()
  await expect(page.getByText(/from the address you typed/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Use my location' }).click()
  const far = page.getByText(/^Your phone is 9\d0 m from the address you typed\. Are you inside your salon\?$/)
  await expect(far).toBeVisible()
  // One question, not also "check the address"
  await expect(page.getByText(/Check that the address above still matches/)).toHaveCount(0)
  // "Yes, I'm inside": answered, gone
  await page.getByRole('button', { name: "Yes, I'm inside. Keep it" }).click()
  await expect(far).toHaveCount(0)
  // Taking the location again asks again; the second answer is one tap too
  await page.getByRole('button', { name: 'Take my location again' }).first().click()
  await expect(far).toBeVisible()

  // The address corrected without searching again: no distance to the old one is worth a question
  await page.getByLabel('Area').fill('Sector 63')
  await page.getByRole('button', { name: 'Take my location again' }).first().click()
  await expect(page.getByText('GPS was accurate to about 30 m.')).toBeVisible()
  await expect(far).toHaveCount(0)

  // Only an area was found (it can be far off): the same distance asks nothing
  api.geocode = { latitude: 28.6215, longitude: 77.3652, precision: 'AREA', formattedAddress: 'Sector 62, Noida' }
  await page.getByRole('button', { name: 'Find my salon on the map' }).click()
  await page.getByRole('button', { name: /Use my location|Take my location again/ }).click()
  await expect(page.getByText('GPS was accurate to about 30 m.')).toBeVisible()
  await expect(page.getByText(/from the address you typed/)).toHaveCount(0)
})

test('answered already, Before you start goes straight on to step 1 (the kind changed on step 1, a link to it)', async ({ page, context, api }) => {
  await languageKept(context)
  await signedIn(context, api, 'SALON', true)
  await page.goto('/register/ready')
  await expect(page).toHaveURL(/\/register$/)
})

test('the language is one tap away on Today, for owners and barbers alike, and fits a 360px phone', async ({ page, context, api }) => {
  await context.addInitScript(() => {
    if (!localStorage.getItem('language')) localStorage.setItem('language', 'en')
  })
  await page.setViewportSize({ width: 360, height: 740 })
  await atSalon(page, context, api, 'BARBER')
  await page.getByRole('button', { name: 'Language: English' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'తెలుగు' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'te')
  await expect(page.getByRole('button', { name: /తెలుగు/ }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})
