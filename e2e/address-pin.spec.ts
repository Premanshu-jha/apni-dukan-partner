import type { BrowserContext, Page } from '@playwright/test'
import { expect, signedIn, test } from './helpers'

/** Registration step 1 with the details typed (the GPS isn't used). */
async function typeDetails(page: Page) {
  await page.getByLabel('Salon name').fill('Shine Unisex Salon')
  await page.getByLabel('Owner’s name').fill('Ravi Kumar')
  await page.getByLabel('Shop number, building, street').fill('Shop 12, Ithum Tower')
  await page.getByLabel('Area').fill('Sector 62')
  await page.getByLabel('City').fill('Noida')
  await page.getByLabel('Pincode').fill('201309')
}

/** The GPS answers after window.__gpsDelay ms (0 by default): a slow fix. */
async function slowableGps(context: BrowserContext) {
  await context.addInitScript(() => {
    const geo = navigator.geolocation
    const real = geo.getCurrentPosition.bind(geo)
    geo.getCurrentPosition = (ok, err, options) => {
      const delay = (window as unknown as { __gpsDelay?: number }).__gpsDelay ?? 0
      setTimeout(() => real(ok, err, options), delay)
    }
  })
}

/** Tap the map away from the pin: moves the pin there, like a drag. */
async function moveThePinByHand(page: Page) {
  await page.getByRole('application', { name: /drag the pin/ }).click({ position: { x: 60, y: 170 } })
}

function savedPoint(api: { calls: { method: string; path: string; body: unknown }[] }) {
  const create = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/shops')!
  return create.body as { latitude: number; longitude: number }
}

const find = (page: Page) => page.getByRole('button', { name: 'Find my salon on the map' })
const gps = (page: Page) => page.getByRole('button', { name: /Use my location|Take my location again/ })
const map = (page: Page) => page.getByRole('application', { name: /drag the pin/ })

test('the owner finds the salon from its address and the pin from the address is saved', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  // Reachable before the address is filled in: a tap says what's missing, and nothing is sent
  await expect(find(page)).toHaveAttribute('aria-disabled', 'true')
  await find(page).click({ force: true })   // aria-disabled, not disabled: a tap (or a screen reader) still reaches it
  await expect(page.getByText('Fill in the address, area, city and pincode above to find it on the map.')).toBeVisible()
  expect(api.calls.some((c) => c.path === '/api/v1/shops/geocode')).toBe(false)

  await typeDetails(page)
  await expect(page.getByText('Fill in the address, area, city and pincode above')).toBeHidden()
  await expect(find(page)).not.toHaveAttribute('aria-disabled', 'true')
  await find(page).click()

  await expect(map(page)).toBeVisible()
  await expect(page.getByText("This is only close by. Drag the pin onto your salon's door.")).toBeVisible()
  await expect(page.getByText(/GPS was accurate/)).toBeHidden()
  const search = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/shops/geocode')!
  expect(search.body).toEqual({ addressLine: 'Shop 12, Ithum Tower', area: 'Sector 62', city: 'Noida', pincode: '201309' })

  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/photos$/)
  expect(savedPoint(api)).toMatchObject({ latitude: 28.6215, longitude: 77.3652 })
})

test('address, then GPS: the GPS point is saved and the address hint goes', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.geocode = { latitude: 28.6215, longitude: 77.3652, precision: 'EXACT', formattedAddress: 'Ithum Tower, Noida' }
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(page.getByText('Check the pin is on your door.')).toBeVisible()

  await gps(page).click()
  await expect(page.getByText('GPS was accurate to about 30 m.')).toBeVisible()
  await expect(page.getByText('Check the pin is on your door.')).toBeHidden()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/photos$/)
  expect(savedPoint(api)).toMatchObject({ latitude: 28.627, longitude: 77.372 })
})

test('GPS, then address: the address point is saved', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await typeDetails(page)
  await gps(page).click()
  await expect(page.getByText('GPS was accurate to about 30 m.')).toBeVisible()
  // Every address field is filled: the address at the point isn't looked up (it would use the shared budget)
  await page.waitForTimeout(300)
  expect(reverseCalls(api)).toHaveLength(0)
  await find(page).click()
  await expect(page.getByText("This is only close by. Drag the pin onto your salon's door.")).toBeVisible()
  await expect(page.getByText(/GPS was accurate/)).toBeHidden()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/photos$/)
  expect(savedPoint(api)).toMatchObject({ latitude: 28.6215, longitude: 77.3652 })
})

test('a slow GPS fix that arrives after the owner moved the pin doesn’t move it back', async ({ page, context, api }) => {
  await slowableGps(context)
  await signedIn(context, api)
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(map(page)).toBeVisible()

  await page.evaluate(() => ((window as unknown as { __gpsDelay: number }).__gpsDelay = 1500))
  await gps(page).click()
  await moveThePinByHand(page)
  await expect(page.getByText("This is only close by.")).toBeHidden()   // the hint goes once the owner moves it
  await page.waitForTimeout(2000)   // the fix has come and been dropped
  await expect(page.getByText(/GPS was accurate/)).toBeHidden()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/photos$/)
  const p = savedPoint(api)
  expect([p.latitude, p.longitude]).not.toEqual([28.627, 77.372])
  expect([p.latitude, p.longitude]).not.toEqual([28.6215, 77.3652])
})

test('editing the address after finding it says to search again or drag; a new search that finds nothing keeps the pin', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.geocode = { latitude: 28.6215, longitude: 77.3652, precision: 'EXACT', formattedAddress: 'Ithum Tower, Noida' }
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(page.getByText('Check the pin is on your door.')).toBeVisible()

  await page.getByLabel('Area').fill('Sector 63')
  await expect(page.getByText('Check the pin is on your door.')).toBeHidden()
  await expect(page.getByText('You changed the address — tap Find my salon on the map again or drag the pin.')).toBeVisible()
  await expect(map(page)).toBeVisible()

  api.geocode = null
  await find(page).click()
  await expect(page.getByText("Couldn't find that address. Check the pincode and area, or use your location.")).toBeVisible()
  await expect(page.getByText('You changed the address')).toBeHidden()
  await expect(page.getByText('Check the pin is on your door.')).toBeHidden()
  await expect(map(page)).toBeVisible()

  // Moving the pin by hand clears the rest
  await page.getByLabel('Area').fill('Sector 62')
  await moveThePinByHand(page)
  await expect(page.getByText('You changed the address')).toBeHidden()
})

test('an address Google doesn’t know says so, and GPS still works', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.geocode = null
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(page.getByText("Couldn't find that address. Check the pincode and area, or use your location.")).toBeVisible()
  await expect(map(page)).toBeHidden()
  await gps(page).click()
  await expect(map(page)).toBeVisible()
  await expect(page.getByText("Couldn't find that address.")).toBeHidden()
})

test('GPS refused while a pin from the address is on the map shows how to turn location on', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(map(page)).toBeVisible()
  await context.clearPermissions()
  await gps(page).click()
  await expect(page.getByText('Location is turned off')).toBeVisible()
  await expect(map(page)).toBeVisible()   // the pin stays
})

test('address search turned off on the backend hides the button and moves focus to Use my location', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.geocode = 'off'
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(find(page)).toBeHidden()
  await expect(page.getByText('Stand inside your salon and tap the button.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeFocused()
})

test('too many searches, Google down, a busy backend or no network: a plain message, and the button stays', async ({ page, context, api }) => {
  await signedIn(context, api)
  const down = "Address search isn't working right now. Use your location, or try again later."
  api.failOnce.set('/shops/geocode', { status: 429, code: 'TRY_LATER', message: 'Many address searches in a short time.', retryAfter: 600 })
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(page.getByText('Many address searches in a short time. Try again in 10 minutes, or use your location.')).toBeVisible()

  api.failOnce.set('/shops/geocode', { status: 503, code: 'GEOCODING_UNAVAILABLE', message: "Address search isn't working right now." })
  await find(page).click()
  await expect(page.getByText(down)).toBeVisible()

  api.failOnce.set('/shops/geocode', { status: 503, code: 'SERVICE_BUSY', message: "We're having a short problem.", retryAfter: 5 })
  await find(page).click()
  await expect.poll(() => api.calls.filter((c) => c.path === '/api/v1/shops/geocode').length).toBe(3)
  await expect(page.getByText(down)).toBeVisible()
  await page.waitForTimeout(1000)
  expect(api.calls.filter((c) => c.path === '/api/v1/shops/geocode')).toHaveLength(3)   // a POST isn't repeated

  await page.route('**/api/v1/shops/geocode', (route) => route.abort('internetdisconnected'))
  await find(page).click()
  await expect(page.getByText(down)).toBeVisible()
  await page.unroute('**/api/v1/shops/geocode')
  await expect(find(page)).toBeVisible()

  // And when it works again, the pin comes
  await find(page).click()
  await expect(map(page)).toBeVisible()
})

const reverseCalls = (api: { calls: { path: string; body: unknown }[] }) => api.calls.filter((c) => c.path === '/api/v1/shops/reverse-geocode')
const filledText = "We filled the address from your location. Check it and correct anything that's wrong."

test('after Use my location, the empty address fields are filled from the GPS point and saved', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await page.getByLabel('Salon name').fill('Shine Unisex Salon')
  await page.getByLabel('Owner’s name').fill('Ravi Kumar')
  await gps(page).click()
  await expect(page.getByText(filledText)).toBeVisible()
  await expect(page.getByLabel('Shop number, building, street')).toHaveValue('Ithum Tower, Sector 62 Road')
  await expect(page.getByLabel('Area')).toHaveValue('Sector 62')
  await expect(page.getByLabel('City')).toHaveValue('Noida')
  await expect(page.getByLabel('Pincode')).toHaveValue('201309')
  expect(reverseCalls(api)[0].body).toEqual({ latitude: 28.627, longitude: 77.372 })
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/photos$/)
  const create = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/shops')!
  expect(create.body).toMatchObject({ addressLine: 'Ithum Tower, Sector 62 Road', area: 'Sector 62', city: 'Noida', pincode: '201309' })
})

test('what the owner typed is kept, also when typed while the answer was on its way', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.reverseDelay = 1500
  await page.goto('/register')
  await page.getByLabel('Shop number, building, street').fill('Shop 12')
  await gps(page).click()
  await expect(map(page)).toBeVisible()
  await page.getByLabel('Area').fill('Sector 63')   // while the reverse lookup is still on its way
  await expect(page.getByText(filledText)).toBeVisible({ timeout: 5000 })
  await expect(page.getByLabel('Shop number, building, street')).toHaveValue('Shop 12')
  await expect(page.getByLabel('Area')).toHaveValue('Sector 63')
  await expect(page.getByLabel('City')).toHaveValue('Noida')
  await expect(page.getByLabel('Pincode')).toHaveValue('201309')
})

test('nothing is said when the address at the point can’t be found or the lookup fails; the pin still works', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.reverse = null
  await page.goto('/register')
  await gps(page).click()
  await expect(map(page)).toBeVisible()
  await expect.poll(() => reverseCalls(api).length).toBe(1)
  api.reverse = 'down'
  await gps(page).click()
  await expect.poll(() => reverseCalls(api).length).toBe(2)
  await page.waitForTimeout(500)
  await expect(page.getByText(filledText)).toBeHidden()
  await expect(page.getByText(/isn't working|Couldn't find/)).toBeHidden()
  await expect(page.getByLabel('Area')).toHaveValue('')
  await expect(map(page)).toBeVisible()
})

test('turned off on the backend: nothing is said and address search is hidden too', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.reverse = 'off'
  await page.goto('/register')
  await gps(page).click()
  await expect.poll(() => reverseCalls(api).length).toBe(1)
  await expect(find(page)).toBeHidden()
  await expect(page.getByText(filledText)).toBeHidden()
})

test('the address isn’t looked up after an address search or after moving the pin', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await expect(map(page)).toBeVisible()
  await moveThePinByHand(page)
  await page.waitForTimeout(500)
  expect(reverseCalls(api)).toHaveLength(0)
})

test('a slow answer for the address at the point is dropped once the owner moves the pin', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.reverseDelay = 1500
  await page.goto('/register')
  await gps(page).click()
  await expect(map(page)).toBeVisible()
  await moveThePinByHand(page)
  await expect.poll(() => reverseCalls(api).length).toBe(1)
  await page.waitForTimeout(2000)   // the answer has come and been dropped
  await expect(page.getByText(filledText)).toBeHidden()
  await expect(page.getByLabel('Area')).toHaveValue('')
  await expect(page.getByLabel('City')).toHaveValue('')
})

test('editing the address while the search runs places the pin but says the address changed', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.geocode = { latitude: 28.6215, longitude: 77.3652, precision: 'EXACT', formattedAddress: 'Ithum Tower, Noida' }
  api.geocodeDelay = 1000
  await page.goto('/register')
  await typeDetails(page)
  await find(page).click()
  await page.getByLabel('Area').fill('Sector 63')   // while the search is on its way
  await expect(map(page)).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('You changed the address — tap Find my salon on the map again or drag the pin.')).toBeVisible()
  await expect(page.getByText('Check the pin is on your door.')).toBeHidden()
})

test('search turned off while the guide to turn location on shows: focus goes to the location heading', async ({ page, context, api }) => {
  await context.clearPermissions()
  await signedIn(context, api)
  api.geocode = 'off'
  await page.goto('/register')
  await gps(page).click()
  await expect(page.getByText('Location is turned off')).toBeVisible()
  await typeDetails(page)
  await find(page).click()
  await expect(find(page)).toBeHidden()
  await expect(page.getByText('Salon location', { exact: true })).toBeFocused()
})

