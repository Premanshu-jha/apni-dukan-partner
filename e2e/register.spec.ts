import { MockApi } from './mockApi'
import { expect, JPEG, signedIn, test } from './helpers'

test('a new owner signs up, registers the salon in three steps and waits for the visit', async ({ page, api }) => {
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

  // Step 2: photos. Uploads need the shop in the token: the app refreshed after creating the shop.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByLabel('Add your photo').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await page.getByLabel('Add shop front').setInputFiles({ name: 'shop.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  const uploads = api.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/api/v1/files'))
  expect(uploads.map((u) => u.path)).toEqual(['/api/v1/files?purpose=OWNER_PHOTO', '/api/v1/files?purpose=SHOP_PHOTO'])
  expect(uploads.every((u) => MockApi.tokenHasShop(u.auth) && u.contentType?.startsWith('multipart/form-data'))).toBe(true)
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3: check and submit
  await expect(page.getByText('Shop 12, Ithum Tower, Sector 62, Noida 201309')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for the visit' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('Waiting for our field team')).toBeVisible()
  await expect(page.getByText('10234')).toBeVisible()
  await expect(page.getByText('Before customers can book')).toBeHidden() // the mock salon already has services and barbers
})

test('a half-done registration comes back where it was, with the field team’s reason when sent back', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT', statusReason: 'The board in the photo is not readable.', shopPhotoFileId: null })
  await page.goto('/')
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByText('The board in the photo is not readable.')).toBeVisible()
  await expect(page.getByLabel('Salon name')).toHaveValue('Shine Unisex Salon')
  await page.getByLabel('GSTIN').fill('27aapfu0939f1zv')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/photos$/)
  const patch = api.calls.find((c) => c.method === 'PATCH')!
  expect(patch.body).toMatchObject({ version: 3, gstin: '27AAPFU0939F1ZV', udyamNumber: '' })
  // The board screens stay closed until it is submitted
  await page.goto('/salon/day')
  await expect(page).toHaveURL(/\/register$/)
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

test('location blocked: the app shows how to turn it on', async ({ page, context, api }) => {
  await context.clearPermissions()
  await signedIn(context, api)
  await page.goto('/register')
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText('Location is turned off')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})
