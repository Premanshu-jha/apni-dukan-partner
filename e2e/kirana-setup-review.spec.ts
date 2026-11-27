import { expect, JPEG, signedIn, test } from './helpers'
import type { MockApi } from './mockApi'

/**
 * The product setup's fixes after the independent reviews (review-partner-AB/CD/EF): no refetch loops, no polling on
 * the counter, retries that never pass a changed number off as saved, counts checked by the product's own unit, the
 * counter's one-line strip, failed sends with Write to us, and the fake backend refusing what the backend refuses.
 */

async function waiting(context: Parameters<typeof signedIn>[0], api: MockApi, role: 'OWNER' | 'HELPER' = 'OWNER') {
  await signedIn(context, api, null)
  api.kiranaShop(role, { status: 'PENDING_VISIT', shopVideoFileId: 'fv-video' })
}

const linesGets = (api: MockApi) => api.kirana.setupCalls.filter((c) => c.method === 'GET' && c.path.startsWith('/kirana/setup/lines')).length

test('AB#1/CD#3: lines checked on another phone meanwhile: one read of the lines, the setup read once, no spinner loop', async ({ page, context, api }) => {
  await waiting(context, api)
  api.kirana.listPage(Array.from({ length: 22 }, (_, i) => ({ wording: `Item ${i + 1}`, name: `Item ${i + 1}`, mrpPaise: 1000 })))
  await page.goto('/kirana/setup/lines')
  await expect(page.getByText('Line 1 of 22')).toBeVisible()
  // The helper's phone checks the two this phone hasn't loaded (it has the first 20) meanwhile
  for (const l of api.kirana.lines.slice(20)) l.status = 'SKIPPED'
  for (let i = 1; i <= 20; i++) {
    await expect(page.getByText(`Line ${i} of 22`)).toBeVisible()
    await page.getByRole('button', { name: 'Skip this line' }).click()
  }
  await expect(page.getByText('All lines checked')).toBeVisible()
  await page.waitForTimeout(1500)
  expect(linesGets(api)).toBeLessThanOrEqual(2)
  expect(api.kirana.setupCalls.filter((c) => c.path === '/kirana/setup').length).toBeLessThanOrEqual(3)
})

test('AB#2: the counter reads the setup once and never polls, even while a page is being read', async ({ page, context, api }) => {
  await waiting(context, api)
  api.kirana.readingFor = 1000
  api.kirana.listPage([], { status: 'READING' })
  await page.goto('/kirana/counter')
  await expect(page.getByRole('link', { name: 'Setting up: reading your list…' })).toBeVisible()
  await page.waitForTimeout(10_000)
  expect(api.kirana.setupCalls.filter((c) => c.path === '/kirana/setup').length).toBe(1)
})

test('AB#4/CD#2: a count whose answer was lost, corrected to another number, is saved as the new number', async ({ page, context, api }) => {
  await waiting(context, api)
  const oil = api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l', stock: 0, counted: false })
  await page.goto('/kirana/setup/count')
  await page.getByLabel('How many are on the shelf now?').fill('12')
  api.loseAnswers = 1
  api.loseAnswersOf = /\/kirana\/products\/oil\/stock$/
  await page.getByRole('button', { name: 'Save and go to the next' }).click()
  await expect(page.getByText("We couldn't tell if it was saved", { exact: false })).toBeVisible()
  expect(oil.stock).toBe(12)
  await page.getByLabel('How many are on the shelf now?').fill('15')
  await page.getByRole('button', { name: 'Save and go to the next' }).click()
  await expect(page.getByText('All products counted')).toBeVisible()
  expect(oil.stock).toBe(15)
  const refs = api.kirana.setupCalls.length ? api.calls.filter((c) => c.path.endsWith('/oil/stock')).map((c) => (c.body as { clientRef: string }).clientRef) : []
  expect(new Set(refs).size).toBe(2)
})

test('AB#4: a line added with no answer, then sent with another count: said, never passed off as the new count', async ({ page, context, api }) => {
  await waiting(context, api)
  api.kirana.listPage([{ wording: 'Lux Soap 100 g', name: 'Lux Soap 100 g', mrpPaise: 3500 }, { wording: 'Next one', name: 'Next one', mrpPaise: 1000 }])
  await page.goto('/kirana/setup/lines')
  await page.getByLabel('How many are on the shelf now?').fill('12')
  api.loseAnswers = 1
  api.loseAnswersOf = /\/kirana\/setup\/lines\//
  await page.getByRole('button', { name: 'Add and go to the next' }).click()
  await expect(page.getByText("We couldn't tell if it was saved", { exact: false })).toBeVisible()
  await page.getByLabel('How many are on the shelf now?').fill('15')
  await page.getByRole('button', { name: 'Add and go to the next' }).click()
  await expect(page.getByText('This line was already added with 12 (Lux Soap 100 g).', { exact: false })).toBeVisible()
  await expect(page.getByText('Line 2 of 2')).toBeVisible()
  expect(api.kirana.products.filter((p) => p.name === 'Lux Soap 100 g')).toHaveLength(1)
})

test("AB#7/CD#5: a line matched to the shop's product sold by kg takes 2.5, and the count screen waits for the unit", async ({ page, context, api }) => {
  await waiting(context, api)
  const rice = api.kirana.product({ id: 'rice', name: 'Basmati rice', unit: 'KG', pricePaise: 9000, stock: 0, counted: false })
  api.kirana.listPage([{ wording: 'Basmati rice 25', quantity: 25, suggestions: [{ productId: 'rice', itemId: null, name: 'Basmati rice', brand: null, size: null, pricePaise: 9000, score: 0.95 }], sure: true }])
  await page.goto('/kirana/setup/lines')
  await expect(page.getByLabel('How many kg are on the shelf now?')).toBeVisible()
  await page.getByLabel('How many kg are on the shelf now?').fill('2.5')
  await page.getByRole('button', { name: 'Add and go to the next' }).click()
  await expect(page.getByText('All lines checked')).toBeVisible()
  expect(rice.stock).toBe(2.5)

  // The fake refuses part of a piece as the backend does: a piece product's count stays whole
  api.kirana.product({ id: 'soap', name: 'Lux Soap', stock: 0, counted: false })
  rice.counted = true
  await page.goto('/kirana/setup/count')
  await page.getByLabel('How many are on the shelf now?').fill('1.5')
  await page.getByRole('button', { name: 'Save and go to the next' }).click()
  await expect(page.getByText(/whole number/i).first()).toBeVisible()
})

test('CD#10: the same photo picked twice is not sent as a second page', async ({ page, context, api }) => {
  await waiting(context, api)
  let n = 0
  await page.route('**/api/v1/files?purpose=BILL', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'fsame', purpose: 'BILL', contentType: 'image/jpeg', sizeBytes: 9, originalName: 'p.jpg', createdAt: new Date().toISOString(), duplicate: n++ > 0 }) }),
  )
  await page.goto('/kirana/setup/list')
  await page.getByLabel('Take a photo of the page').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText("Page sent. We're reading it", { exact: false })).toBeVisible()
  await page.getByLabel('Photograph the next page').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText("You've sent this photo already", { exact: false })).toBeVisible()
  expect(api.kirana.pages).toHaveLength(1)
})

test('CD#11: a recount page taken again is sent as a recount; AB#10: after a lost answer only Try again sends', async ({ page, context, api }) => {
  await waiting(context, api)
  const failed = api.kirana.listPage([], { status: 'FAILED', failureCode: 'LIST_UNREADABLE', recount: true })
  await page.goto(`/kirana/setup/list?retake=${failed.readId}`)
  await expect(page.getByLabel('Take a photo of the page')).toBeEnabled()
  api.loseAnswers = 1
  api.loseAnswersOf = /\/kirana\/reads$/
  await page.getByLabel('Take a photo of the page').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText("We couldn't tell if it was sent", { exact: false })).toBeVisible()
  await expect(page.getByLabel('Take a photo of the page')).toBeDisabled()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('link', { name: 'Back to the product setup' })).toBeVisible()
  const sends = api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/kirana/reads').map((c) => c.body as { recount?: boolean; clientRef: string })
  expect(sends.every((b) => b.recount === true)).toBe(true)
  expect(new Set(sends.map((b) => b.clientRef)).size).toBe(1)
  expect(api.kirana.pages.filter((p) => p.status === 'READING')).toHaveLength(1)
})

test('limits the backend has: 100 pages a day, with the way on', async ({ page, context, api }) => {
  await waiting(context, api)
  api.kirana.pagesPerDay = 0
  await page.goto('/kirana/setup/list')
  await page.getByLabel('Take a photo of the page').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText("You've sent 0 pages today.", { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Or add products one by one' })).toBeVisible()
  await expect(page.getByText('Still not working?')).toBeVisible()
})

test('pictures still being found: wait, with "Photograph them anyway"', async ({ page, context, api }) => {
  await waiting(context, api)
  api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l', counted: true, pictured: false, finding: true })
  await page.goto('/kirana/setup')
  await expect(page.getByText('1 photo is being checked. Come back in a few minutes.')).toBeVisible()
  await page.getByRole('link', { name: 'Photograph them anyway' }).click()
  await expect(page.getByText("We're looking for the company's own picture of it.", { exact: false })).toBeVisible()
})

test('EF#14: Back while a product photo is being sent asks first', async ({ page, context, api }) => {
  await waiting(context, api)
  api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l', counted: true, pictured: false })
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/files?purpose=PRODUCT_PHOTO', async (route) => {
    await held
    await route.fallback()
  })
  await page.goto('/kirana/setup/photos')
  await page.getByLabel('Take a photo').setInputFiles({ name: 'o.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  let asked = ''
  page.once('dialog', (d) => {
    asked = d.message()
    void d.dismiss()
  })
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  expect(asked).toContain('still being sent')
  await expect(page).toHaveURL(/\/kirana\/setup\/photos$/)
  release()
})

test('EF#3: a refused "I\'ve added all my products" has Write to us under it; CD#12: unreadable pages fix goes to the retake', async ({ page, context, api }) => {
  await waiting(context, api)
  api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l' })
  await page.goto('/kirana/setup')
  await expect(page.getByRole('button', { name: "I've added all my products" })).toBeVisible()
  const bad = api.kirana.listPage([], { status: 'FAILED', failureCode: 'NOT_A_LIST' })
  await page.getByRole('button', { name: "I've added all my products" }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, all added' }).click()
  await expect(page.getByText("One page of your list couldn't be read.", { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Write to us' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Take 1 page again' })).toHaveAttribute('href', `/kirana/setup/list?retake=${bad.readId}`)
})

test("EF#3: a refused counter save has Write to us; the setup's error state has Call us", async ({ page, context, api }) => {
  await waiting(context, api)
  await page.route('**/api/v1/kirana/setup', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"UNKNOWN","message":"Something went wrong"}' }))
  await page.goto('/kirana/counter')
  await expect(page.getByRole('link', { name: 'Call us' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("We couldn't check your product setup just now.")).toBeVisible()
})

test('AB#3/EF#2: a helper sent away from an owner-only screen is told why on the counter', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('HELPER')
  await page.goto('/kirana/team')
  await expect(page).toHaveURL(/\/kirana\/counter$/)
  await expect(page.getByText('Only the owner can open that screen. Ask Ravi Kumar.')).toBeVisible()
})

test('CD#13: "Save and add the next" takes the used barcode out of the address', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  await page.goto('/kirana/products/new?barcode=8906000111222&from=%2Fkirana%2Fproducts')
  await page.getByLabel('Name').fill('Parle-G 250 g')
  await page.getByLabel('Price of one (₹)').fill('25')
  await page.getByRole('button', { name: 'Save and add the next' }).click()
  await expect(page.getByText('Saved: Parle-G 250 g. Add the next one.')).toBeVisible()
  await expect(page).not.toHaveURL(/barcode=/)
  await page.reload()
  await expect(page.getByLabel('Barcode (optional)')).toHaveValue('')
})

test('EF#15: a registration guide that fails to download leaves the photos step working', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER', { status: 'DRAFT', ownerPhotoFileId: null, shopPhotoFileId: null, shopVideoFileId: null })
  await page.route(/\/assets\/Guides-[^/]*\.js$/, (route) => route.abort('failed'))
  await page.goto('/register/photos')
  await expect(page.getByText('Your photo', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('img', { name: 'Your face filling the photo, eyes open' })).toHaveCount(0)
  await expect(page.getByText('Something went wrong', { exact: false })).toHaveCount(0)
})
