import { addDays, MockApi, todayIst } from './mockApi'
import { expect, fakeMp4, JPEG, signedIn, stubVideoLength, test } from './helpers'

test('a new owner signs up, registers the salon in five steps and waits for the visit', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByLabel('Mobile number').fill('98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await expect(page).toHaveURL(/\/welcome\/email$/)
  await page.getByLabel('Email').fill('ravi@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await page.getByLabel('Your name').fill('Ravi Kumar')
  await page.getByRole('button', { name: 'Done' }).click()

  // No shop yet: the start screen
  await expect(page).toHaveURL(/\/start$/)
  await page.getByRole('button', { name: 'Register my salon' }).click()

  // Step 1: details and the GPS pin
  await expect(page).toHaveURL(/\/register$/)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('Enter the salon name')).toBeVisible()
  await expect(page.getByText("Add the salon's location to continue.")).toBeVisible()
  await page.getByLabel('Salon name').fill('Shine Unisex Salon')
  await page.getByLabel('Owner’s name').fill('Ravi Kumar')
  await page.getByLabel('Shop number, building, street').fill('Shop 12, Ithum Tower')
  await page.getByLabel('Area').fill('Sector 62')
  await page.getByLabel('City').fill('Noida')
  await page.getByLabel('Pincode').fill('201309')
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByRole('application', { name: /drag the pin/ })).toBeVisible()
  await expect(page.getByText('GPS was accurate to about 30 m.')).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await expect(page).toHaveURL(/\/register\/photos$/)
  const create = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/shops')!
  expect(create.body).toMatchObject({ name: 'Shine Unisex Salon', pincode: '201309', latitude: 28.627, longitude: 77.372, gstin: null, type: 'SALON' })

  // Step 2: photos and papers. Uploads need the shop in the token: the app refreshed after creating the shop.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByLabel('Add your photo').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await page.getByLabel('Add shop front').setInputFiles({ name: 'shop.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()   // the salon video too
  await page.getByLabel('Record video').setInputFiles({ name: 'salon.mp4', mimeType: 'video/mp4', buffer: fakeMp4() })
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()   // the registration document is optional
  await expect(page.getByText(/customers see "Registered"/)).toBeVisible()
  await expect(page.getByLabel('Add the registration document')).toBeDisabled()   // which one, first
  await page.getByLabel('Trade licence').check()
  await page.getByLabel('Add the registration document').setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') })
  await expect(page.getByText('Added: Trade licence.')).toBeVisible()
  // A wrong one: removed again (it's optional), then the right one
  await page.getByRole('button', { name: 'Remove it' }).click()
  await expect(page.getByText('Added: Trade licence.')).toBeHidden()
  expect(api.shop!.registrationDocFileId).toBeNull()
  await page.getByLabel('Trade licence').check()
  await page.getByLabel('Add the registration document').setInputFiles({ name: 'licence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') })
  await expect(page.getByText('Added: Trade licence.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  const uploads = api.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/api/v1/files?'))
  expect(uploads.map((u) => u.path)).toEqual([
    '/api/v1/files?purpose=OWNER_PHOTO',
    '/api/v1/files?purpose=SHOP_PHOTO',
    '/api/v1/files?purpose=REG_DOC',
    '/api/v1/files?purpose=REG_DOC',   // the right one, after removing the wrong one
  ])
  expect(uploads.every((u) => MockApi.tokenHasShop(u.auth) && u.contentType?.startsWith('multipart/form-data'))).toBe(true)
  expect(api.calls.find((c) => c.path === '/api/v1/shops/me/registration-document')!.body).toMatchObject({ type: 'TRADE_LICENCE' })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3: services, ticked from the list with a price each, plus one of their own
  await expect(page).toHaveURL(/\/register\/services$/)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Tick at least one service')).toBeVisible()
  await page.getByLabel('Haircut').check()
  await page.getByRole('button', { name: 'Save 1 service and continue' }).click()
  await expect(page.getByText('Haircut: enter the price.')).toBeVisible()
  await page.getByLabel('Haircut price (₹)').fill('150')   // each row's boxes name their service
  await page.getByRole('button', { name: '+ Add your own service' }).click()
  await page.getByLabel('Service name').fill('Head massage')
  await page.locator('[id^="own-"][id$="-price"]').fill('100')
  await page.getByRole('button', { name: 'Save 2 services and continue' }).click()
  await expect(page).toHaveURL(/\/register\/hours$/)
  const batch = api.calls.find((c) => c.path === '/api/v1/salon/services/batch')!
  expect(batch.body).toEqual({
    services: [
      { name: 'Haircut', durationMinutes: 30, pricePaise: 15000, priceIsFrom: false, returnAfterDays: 21 },
      { name: 'Head massage', durationMinutes: 30, pricePaise: 10000, priceIsFrom: false, returnAfterDays: 14 },
    ],
  })

  // Step 4: opening hours, Sunday off
  await page.getByRole('switch', { name: 'Sun open' }).click()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/review$/)
  const hours = api.calls.find((c) => c.method === 'PUT' && c.path === '/api/v1/salon/hours')!
  expect(hours.body).toMatchObject({ version: null })
  expect((hours.body as { days: unknown[] }).days).toHaveLength(6)

  // Step 5: check and submit
  await expect(page.getByText('Shop 12, Ithum Tower, Sector 62, Noida 201309')).toBeVisible()
  await expect(page.getByText('Services: 2 added')).toBeVisible()
  await expect(page.getByText('Sun: Closed')).toBeVisible()
  // A festival holiday though there are no barbers yet; no day is picked for him (one tap mustn't close tomorrow)
  await expect(page.getByRole('button', { name: 'Pick a day to close' })).toBeDisabled()
  const diwali = addDays(todayIst(), 3)
  await page.getByLabel('Close the salon on').fill(diwali)
  await page.getByRole('button', { name: /^Close / }).click()
  await expect(page.getByRole('button', { name: 'Open again' })).toBeVisible()
  expect(api.closures).toEqual([expect.objectContaining({ date: diwali, barbers: 0 })])
  // The owner cuts hair too: added as a barber with every service and the salon's hours, and off on the holiday
  await expect(page.getByText('Do you cut hair here yourself?')).toBeVisible()
  await page.getByRole('button', { name: 'Yes, add me' }).click()
  await expect(page.getByRole('status').filter({ hasText: "You're one of the barbers" })).toBeFocused()
  expect(api.closures).toEqual([expect.objectContaining({ date: diwali, barbers: 1 })])
  expect(api.staff).toHaveLength(1)
  expect(api.staff[0]).toMatchObject({ loginPhone: api.user.phone, serviceIds: ['v1', 'v2'].map(() => expect.any(String)) })
  expect((api.staff[0].hours as unknown[]).length).toBe(6)
  await page.getByRole('button', { name: 'Submit for the visit' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('Waiting for our field team')).toBeVisible()
  await expect(page.getByText('10234')).toBeVisible()

})

test('a half-done registration comes back where it was, with the field team’s reason when sent back', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT', statusReason: 'The board in the photo is not readable.', shopPhotoFileId: null })
  await page.goto('/')
  // Sent back: the review, with the field team's reason and a link to each step
  await expect(page).toHaveURL(/\/register\/review$/)
  await expect(page.getByText('The board in the photo is not readable.')).toBeVisible()
  await page.getByRole('link', { name: 'Edit details or move the pin' }).click()
  await expect(page).toHaveURL(/\/register\?from=review$/)
  await expect(page.getByText('The board in the photo is not readable.')).toBeVisible()
  await expect(page.getByLabel('Salon name')).toHaveValue('Shine Unisex Salon')
  await page.getByLabel('GSTIN').fill('27aapfu0939f1zv')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  // Opened from the review: back to it, not on to Photos
  await expect(page).toHaveURL(/\/register\/review$/)
  const patch = api.calls.find((c) => c.method === 'PATCH')!
  expect(patch.body).toMatchObject({ version: 3, gstin: '27AAPFU0939F1ZV', udyamNumber: '' })
  // The board screens stay closed until it is submitted
  await page.goto('/salon/day')
  await expect(page).toHaveURL(/\/register\/review$/)
})

test('an owner coming back to a registration lands on the first step not done, and the step pills jump', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT', shopPhotoFileId: null })
  await page.goto('/')
  await expect(page).toHaveURL(/\/register\/photos$/)
  // Every step is one tap away once the salon is saved
  await page.getByRole('link', { name: /Details/ }).click()
  await expect(page).toHaveURL(/\/register$/)
  await page.getByRole('link', { name: /Hours/ }).click()
  await expect(page).toHaveURL(/\/register\/hours$/)
  await page.getByRole('link', { name: /Submit/ }).click()
  await expect(page).toHaveURL(/\/register\/review$/)
  // The pin as a map, not numbers
  await expect(page.getByLabel("Map: your salon's pin, where customers find you")).toBeVisible()
})

test('typing is kept on the phone before the first save, and a stale save reloads the shop', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await page.getByLabel('Salon name').fill('Shine')
  await page.reload()
  await expect(page.getByLabel('Salon name')).toHaveValue('Shine')

  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  api.failOnce.set('/shops/me/submit', { status: 409, code: 'SHOP_CHANGED', message: 'Someone changed your shop. Reload and try again.' })
  await page.goto('/register/review')
  await page.getByRole('button', { name: 'Submit for the visit' }).click()
  await expect(page.getByText('Someone changed your shop')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for the visit' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
})

test('the "do you cut hair" question: No is kept and says where to change it; a barber list that cannot be read offers a retry', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  api.failOnce.set('/salon/staff', { status: 403, code: 'FORBIDDEN', message: 'Not allowed.' })
  await page.goto('/register/review')
  await expect(page.getByText("Couldn't read your barbers")).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('button', { name: 'No, only staff' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'add yourself in the Salon tab → Barbers' })).toBeFocused()
  expect(api.calls.some((c) => c.path === '/api/v1/salon/staff/me')).toBe(false)
})

test('location blocked: the app shows how to turn it on', async ({ page, context, api }) => {
  await context.clearPermissions()
  await signedIn(context, api)
  await page.goto('/register')
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText('Location is turned off')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('a photo upload answered 503 PHOTOS_BUSY says to try again in a minute, is not repeated, and a new pick works', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT', shopPhotoFileId: null })
  const message = 'Lots of photos are being sent right now. Try again in a minute.'
  api.failOnce.set('/files', { status: 503, code: 'PHOTOS_BUSY', message, retryAfter: 60 })
  await page.goto('/register/photos')
  const busy = page.waitForResponse((r) => r.url().includes('/api/v1/files') && r.request().method() === 'POST')
  await page.getByLabel('Add shop front').setInputFiles({ name: 'shop.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  expect((await busy).headers()['retry-after']).toBe('60')   // as the backend sends it
  await expect(page.getByRole('alert')).toHaveText(message)
  await page.waitForTimeout(2500)   // longer than the SERVICE_BUSY wait: nothing is sent again by itself
  expect(api.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/api/v1/files'))).toHaveLength(1)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByLabel('Add shop front').setInputFiles({ name: 'shop.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  expect(api.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/api/v1/files'))).toHaveLength(2)
})

test('his own barber profile switched off: the review says nobody can book his chair', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  api.staff.push({ id: 'st-me', name: 'Ravi', active: false, serviceIds: [], hours: [], loginPhone: api.user.phone, invitedPhone: null, photoFileId: null, version: 0 })
  await page.goto('/register/review')
  await expect(page.getByText("Your barber profile is switched off, so customers can't book your chair.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Yes, add me' })).toHaveCount(0)
})
