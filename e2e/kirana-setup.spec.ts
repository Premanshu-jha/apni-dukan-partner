import type { Page } from '@playwright/test'
import { expect, JPEG, signedIn, test } from './helpers'
import type { MockApi } from './mockApi'

/**
 * The product setup after Submit (kirana switch on): the counter's card with the next step and progress, the list's
 * pages read by AI, each line added or skipped one at a time, counts, photos, then "I've added all my products", which
 * books the field visit. The fake backend follows ProductSetupService's records and error codes.
 */

async function waiting(_page: Page, context: Parameters<typeof signedIn>[0], api: MockApi, role: 'OWNER' | 'HELPER' = 'OWNER') {
  await signedIn(context, api, null)
  api.kiranaShop(role, { status: 'PENDING_VISIT', shopVideoFileId: 'fv-video' })
}

const salt = { wording: 'Tata Salt 1kg', brand: 'Tata', name: 'Salt', size: '1 kg', mrpPaise: 2800, quantity: 12, suggestions: [{ productId: null, itemId: 'it-salt', name: 'Tata Salt 1 kg', brand: 'Tata', size: '1 kg', pricePaise: 2800, score: 0.97 }], sure: true }
const dal = { wording: 'Toor dal loose', name: 'Toor dal', byWeight: true, mrpPaise: 14000, quantity: 25 }
const heading = { wording: 'GROCERY', quantity: null }

test('a new kirana: the counter says what to do, a page of the list is read, and each line is added or skipped one at a time', async ({ page, context, api }) => {
  await waiting(page, context, api)
  api.kirana.nextPage.push([salt, dal, heading])
  await page.goto('/')
  await expect(page).toHaveURL(/\/kirana\/counter$/)
  // F-02 / EF#5: the next thing to do as one line above Scan (Scan stays on the first screen); no promise of a call (F-01)
  const strip = page.getByRole('link', { name: 'Set up your products: photograph your list' })
  await expect(strip).toBeVisible()
  await expect(page.getByText(/field team calls|we'll call/i)).toHaveCount(0)
  const scan = await page.getByRole('button', { name: 'Scan' }).boundingBox()
  expect(scan!.y + scan!.height).toBeLessThan(page.viewportSize()!.height)
  expect((await strip.boundingBox())!.height).toBeLessThan(60)
  await strip.click()

  // F-08: what a good page looks like, before the camera
  await expect(page.getByRole('img', { name: 'The whole page, flat and straight, in good light' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Tilted, cut off or dark' })).toBeVisible()
  await page.getByLabel('Take a photo of the page').setInputFiles({ name: 'p1.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText("Page sent. We're reading it", { exact: false })).toBeVisible()
  expect(api.files.at(-1)!.purpose).toBe('BILL')
  expect(api.kirana.pages).toHaveLength(1)

  // While it reads: said so on the setup page, then its lines are there to check
  await page.getByRole('link', { name: 'Back to the product setup' }).click()
  await expect(page.getByText('Reading 1 page of your list…')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Check your list: 3 left' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: 'Check your list: 3 left' }).click()

  // Line 1: the sure match is picked already; the count is one tap from the list's number
  await expect(page.getByText('Line 1 of 3')).toBeVisible()
  await expect(page.getByText('Tata Salt 1kg')).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Tata Salt 1 kg Known product/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Add and go to the next' }).click()
  await expect(page.getByText('Count them now. 0 if there are none.').last()).toBeVisible()
  await page.getByRole('button', { name: '12 (as on the list)' }).click()
  await page.getByRole('button', { name: 'Add and go to the next' }).dblclick()

  // Line 2: a new product sold loose, its name and price as read
  await expect(page.getByText('Line 2 of 3')).toBeVisible()
  await expect(page.getByText('2 left')).toBeVisible()
  expect(api.kirana.setupCalls.filter((c) => c.method === 'POST' && c.path.includes('/setup/lines/')).length).toBe(1)
  await expect(page.getByLabel('Name')).toHaveValue('Toor dal')
  await expect(page.getByLabel('Price of 1 kg (₹)')).toHaveValue('140')
  await page.getByLabel('How many kg are on the shelf now?').fill('24.5')

  // Leaving and coming back (a reload, the app closed): the same line, with what was typed
  await page.reload()
  await expect(page.getByText('Line 2 of 3')).toBeVisible()
  await expect(page.getByLabel('How many kg are on the shelf now?')).toHaveValue('24.5')
  await page.getByRole('button', { name: 'Add and go to the next' }).click()

  // Line 3: a heading, skipped; then brought back by mistake and skipped again
  await expect(page.getByText('Line 3 of 3')).toBeVisible()
  await page.getByRole('button', { name: 'Skip this line' }).click()
  await expect(page.getByText('All lines checked')).toBeVisible()
  await page.getByRole('link', { name: '1 line skipped: see it' }).click()
  await page.getByRole('button', { name: 'Bring back' }).click()
  await page.getByRole('link', { name: 'Check the line you brought back' }).click()
  await page.getByRole('button', { name: 'Skip this line' }).click()

  const made = api.kirana.products.map((p) => [p.name, p.stock, p.unit])
  expect(made).toEqual([['Tata Salt 1 kg', 12, 'PIECE'], ['Toor dal', 24.5, 'KG']])
  expect(api.kirana.lines.map((l) => l.status)).toEqual(['ADDED', 'ADDED', 'SKIPPED'])
})

test('twenty lines at a time: the next twenty are read once these are done, never in a loop', async ({ page, context, api }) => {
  await waiting(page, context, api)
  api.kirana.listPage(Array.from({ length: 22 }, (_, i) => ({ wording: `Item ${i + 1}`, name: `Item ${i + 1}`, mrpPaise: 1000 })))
  await page.goto('/kirana/setup/lines')
  for (let i = 1; i <= 21; i++) {
    await expect(page.getByText(`Line ${i} of 22`)).toBeVisible()
    await page.getByRole('button', { name: 'Skip this line' }).click()
  }
  await expect(page.getByText('Line 22 of 22')).toBeVisible()
  expect(api.kirana.setupCalls.filter((c) => c.method === 'GET' && c.path.startsWith('/kirana/setup/lines')).length).toBe(2)
})

test('a line onto a product already counted asks to add or replace; a taken name offers the product instead', async ({ page, context, api }) => {
  await waiting(page, context, api)
  const atta = api.kirana.product({ id: 'atta', name: 'Aashirvaad Atta 5 kg', pricePaise: 26500, stock: 4, counted: true })
  const sug = [{ productId: 'atta', itemId: null, name: 'Aashirvaad Atta 5 kg', brand: null, size: null, pricePaise: 26500, score: 0.9 }]
  api.kirana.listPage([{ wording: 'Atta 5kg (shelf)', suggestions: sug, sure: true }, { wording: 'Atta 5kg (godown)', suggestions: sug, sure: true }, { wording: 'Lux Soap 100 g', name: 'Aashirvaad Atta 5 kg', mrpPaise: 3500 }])
  api.kirana.lines[0].status = 'ADDED'
  api.kirana.lines[0].productId = 'atta'
  await page.goto('/kirana/setup/lines')
  await expect(page.getByText('Line 2 of 3')).toBeVisible()
  await page.getByLabel('How many are on the shelf now?').fill('6')
  await page.getByRole('button', { name: 'Add and go to the next' }).click()
  const ask = page.getByRole('dialog', { name: 'Aashirvaad Atta 5 kg is already counted' })
  await ask.getByRole('button', { name: 'Yes, add it (makes 10)' }).click()
  await expect(page.getByText('Line 3 of 3')).toBeVisible()
  expect(atta.stock).toBe(10)

  // A new product named like one the shop has: "Use … which you already have"
  await page.getByLabel('How many are on the shelf now?').fill('2')
  await page.getByRole('button', { name: 'Add and go to the next' }).click()
  await expect(page.getByText('You already have a product called "Aashirvaad Atta 5 kg".')).toBeVisible()
  await page.getByRole('button', { name: 'Use “Aashirvaad Atta 5 kg”, which you already have' }).click()
  await page.getByRole('button', { name: 'Add and go to the next' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'No, the count is 2' }).click()
  await expect(page.getByText('All lines checked')).toBeVisible()
  expect(atta.stock).toBe(2)
})

test("a page that couldn't be read: why, in plain words, and taken again or deleted", async ({ page, context, api }) => {
  await waiting(page, context, api)
  api.kirana.listPage([], { status: 'FAILED', failureCode: 'NOT_A_LIST', failure: "This doesn't look like a list of products." })
  api.kirana.listPage([], { status: 'FAILED', failureCode: 'LIST_UNREADABLE', failure: 'x' })
  await page.goto('/kirana/setup')
  await expect(page.getByText("This doesn't look like a list of products. Take a photo of one page of your list.")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Take 2 pages again' })).toBeVisible()
  // Delete asks first
  await page.getByRole('button', { name: 'Delete page' }).first().click()
  await page.getByRole('dialog', { name: 'Delete page 1?' }).getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByRole('link', { name: 'Take 1 page again' })).toBeVisible()
  // Taken again: the new page is sent, the failed one goes
  await page.getByRole('link', { name: 'Take it again' }).click()
  await expect(page.getByText('Take this page again, flat and in good light.', { exact: false })).toBeVisible()
  api.kirana.nextPage.push([dal])
  await page.getByLabel('Take a photo of the page').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByRole('link', { name: 'Back to the product setup' })).toBeVisible()
  await expect.poll(() => api.kirana.pages.map((p) => p.status)).toEqual(['READING'])
})

test('a page sent with no answer is tried again with the same clientRef: one page', async ({ page, context, api }) => {
  await waiting(page, context, api)
  await page.goto('/kirana/setup/list')
  // The first send gets no answer (the network dropped); the retry must carry the same clientRef and file
  const sent: unknown[] = []
  await page.route('**/api/v1/kirana/reads', async (route) => {
    sent.push(route.request().postDataJSON())
    if (sent.length === 1) return route.abort('failed')
    return route.fallback()
  })
  await page.getByLabel('Take a photo of the page').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText("We couldn't tell if it was sent", { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText("Page sent. We're reading it", { exact: false })).toBeVisible()
  expect(api.kirana.pages).toHaveLength(1)
  expect(sent).toHaveLength(2)
  expect(sent[1]).toEqual(sent[0])
  expect(api.files.filter((f) => f.purpose === 'BILL')).toHaveLength(1)
})

test('counts, photos (refused, then the side with the size), then "I\'ve added all my products" books the visit', async ({ page, context, api }) => {
  await waiting(page, context, api)
  api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l', pricePaise: 15000, stock: 0, counted: false, pictured: false })
  api.kirana.product({ id: 'rice', name: 'Sona Rice', unit: 'KG', pricePaise: 6000, stock: 0, counted: true, pictured: false })
  await page.goto('/kirana/counter')
  await page.getByRole('link', { name: 'Continue setting up · 1 left' }).click()
  await expect(page.getByText('Fortune Oil 1 l')).toBeVisible()
  await page.getByLabel('How many are on the shelf now?').fill('7')
  await page.getByRole('button', { name: 'Save and go to the next' }).click()
  await expect(page.getByText('All products counted')).toBeVisible()
  expect(api.kirana.products[0].stock).toBe(7)

  // The finish is refused while photos are missing: why, and one tap to fix it
  await page.getByRole('link', { name: 'Take product photos: 2 left' }).click()
  await expect(page.getByText('Take a photo of the front of the pack. Make sure “1 l” can be read.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'The front of one pack, its name and size clear' })).toBeVisible()
  api.kirana.photoAnswer = 'NEED_SIZE'
  await page.getByLabel('Take a photo').setInputFiles({ name: 'o.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText('Sent: Fortune Oil 1 l.', { exact: false })).toBeVisible()
  // The loose one: its own words
  await expect(page.getByText('Take a photo of the Sona Rice in its sack or bin.')).toBeVisible()
  api.kirana.photoAnswer = 'OK'
  await page.getByLabel('Take a photo').setInputFiles({ name: 'r.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText('All photos sent')).toBeVisible()
  expect(api.files.filter((f) => f.purpose === 'PRODUCT_PHOTO')).toHaveLength(2)

  // Back again: the oil needs the side with its size
  await page.goto('/kirana/setup/photos')
  await expect(page.getByText('Now a photo of the side where “1 l” is printed.')).toBeVisible()
  await page.getByLabel('Take a photo of the side').setInputFiles({ name: 's.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText('All photos sent')).toBeVisible()
  const sides = api.kirana.setupCalls.filter((c) => c.method === 'PUT')
  expect(sides.at(-1)!.body).toMatchObject({ fileId: null, sizeFileId: expect.any(String) })

  await page.getByRole('link', { name: 'Back to the product setup' }).click()
  await page.getByRole('button', { name: "I've added all my products" }).click()
  const ask = page.getByRole('dialog', { name: 'Have you added everything you sell?' })
  await expect(ask.getByText('our field team calls you to fix a time for the visit', { exact: false })).toBeVisible()
  await ask.getByRole('button', { name: 'Yes, all added' }).click()
  await expect(page.getByText('All products added')).toBeVisible()
  expect(api.kirana.setupReadyAt).not.toBeNull()
  // The counter now says what happens next (the visit), and it can be hidden
  await page.goto('/kirana/counter')
  await expect(page.getByText('What happens next')).toBeVisible()
  await expect(page.getByText('Set up your products')).toHaveCount(0)
})

test('"I\'ve added all my products" refused (a photo still missing): the reason, and the fix one tap away', async ({ page, context, api }) => {
  await waiting(page, context, api)
  api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l', counted: true, pictured: true })
  await page.goto('/kirana/setup')
  await expect(page.getByRole('button', { name: "I've added all my products" })).toBeVisible()
  // Another phone adds a product without a photo meanwhile
  api.kirana.product({ id: 'soap', name: 'Lux Soap 100 g', counted: true, pictured: false })
  await page.getByRole('button', { name: "I've added all my products" }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, all added' }).click()
  await expect(page.getByText('1 products need a photo.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Take product photos: 1 left' })).toBeVisible()
  expect(api.kirana.setupReadyAt).toBeNull()
})

test('a helper does the setup too, and asks the owner to finish it', async ({ page, context, api }) => {
  await waiting(page, context, api, 'HELPER')
  api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l' })
  await page.goto('/kirana/counter')
  await page.getByRole('link', { name: 'Setup ready: ask the owner to finish it' }).click()
  await expect(page.getByText('Everything is added. Ask the owner to tap', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: "I've added all my products" })).toHaveCount(0)
  const ask = page.getByRole('link', { name: 'Ask the owner on WhatsApp' }).first()
  await expect(ask).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/)
  // F-20: a helper's first time at the counter, once
  await page.goto('/kirana/counter')
  await expect(page.getByText("You're a helper at Sharma Kirana Store")).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Setup ready: ask the owner to finish it' })).toBeVisible()
  await expect(page.getByText("You're a helper at Sharma Kirana Store")).toHaveCount(0)
})

test('an approved kirana never reads the setup (no card, no call)', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  await page.goto('/kirana/counter')
  await expect(page.getByRole('button', { name: 'Scan' })).toBeVisible()
  await page.waitForTimeout(500)
  expect(api.kirana.setupCalls).toEqual([])
  await expect(page.getByText('Set up your products')).toHaveCount(0)
})

test('nothing on its way: the setup is read once, not polled', async ({ page, context, api }) => {
  await waiting(page, context, api)
  api.kirana.product({ id: 'oil', name: 'Fortune Oil 1 l', counted: false })
  await page.goto('/kirana/setup')
  await expect(page.getByRole('link', { name: 'Count your products: 1 left' })).toBeVisible()
  await page.waitForTimeout(9_000)
  expect(api.kirana.setupCalls.filter((c) => c.path === '/kirana/setup').length).toBe(1)
})

// ---------- the other kirana fixes of this round ----------

test('F-06/F-21: adding products one after another stays on the form; leaving with typing asks first', async ({ page, context, api }) => {
  await waiting(page, context, api)
  await page.goto('/kirana/setup')
  await page.getByRole('link', { name: 'Or add products one by one' }).first().click()
  await page.getByRole('button', { name: 'Kg (loose)' }).click()
  await page.getByLabel('Name').fill('Sugar loose')
  await page.getByLabel('Price of 1 kg (₹)').fill('48')
  // From the setup, the count is asked for
  await page.getByRole('button', { name: 'Save and add the next' }).click()
  await expect(page.getByText('Count them now. 0 if there are none.').last()).toBeVisible()
  await page.getByLabel(/Stock on the shelf now/).fill('20')
  await page.getByRole('button', { name: 'Save and add the next' }).click()
  await expect(page.getByText('Saved: Sugar loose. Add the next one.')).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveValue('')
  await expect(page.getByLabel('Name')).toBeFocused()
  // "Sold by" kept for the next one
  await expect(page.getByLabel('Price of 1 kg (₹)')).toBeVisible()
  await page.getByLabel('Name').fill('Rice loose')
  let asked = ''
  page.once('dialog', (d) => {
    asked = d.message()
    void d.dismiss()
  })
  await page.getByRole('button', { name: 'Back' }).click()
  expect(asked).toContain('What you typed is kept')
  await expect(page).toHaveURL(/\/kirana\/products\/new/)
})

test('F-11: an unknown barcode billed now is kept to add later, on Products', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  await page.goto('/kirana/counter')
  await page.getByRole('button', { name: 'Scan' }).click()
  await page.getByLabel('Or type the digits under the barcode').fill('8906000777000')
  await page.getByRole('button', { name: 'Use', exact: true }).click()
  await page.getByRole('button', { name: 'Bill it now, add the product later' }).click()
  await expect(page.getByRole('dialog', { name: /not in your list/i })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/kirana/products')
  await expect(page.getByText('1 barcode to add as a product')).toBeVisible()
  await page.getByRole('link', { name: 'Add 8906000777000' }).click()
  await expect(page.getByLabel('Barcode (optional)')).toHaveValue('8906000777000')
})

test('F-12: removing a barcode asks first', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  api.kirana.product({ id: 'salt', name: 'Tata Salt 1 kg', barcodes: [{ code: '8901058000017', pack: 1 }] })
  await page.goto('/kirana/products/salt')
  await page.getByRole('button', { name: /Remove barcode 8901058000017/ }).click()
  const ask = page.getByRole('dialog', { name: 'Remove barcode 8901058000017?' })
  await ask.getByRole('button', { name: 'Keep it' }).click()
  expect(api.kirana.products[0].barcodes).toHaveLength(1)
  await page.getByRole('button', { name: /Remove barcode 8901058000017/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, remove' }).click()
  await expect(page.getByText('None yet: add the one on its pack so it scans.')).toBeVisible()
  expect(api.kirana.products[0].barcodes).toHaveLength(0)
})

test('F-13: a helper refused something the owner does gets "Ask the owner on WhatsApp"', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('HELPER')
  api.kirana.product({ id: 'salt', name: 'Tata Salt 1 kg' })
  await page.goto('/kirana/products/salt')
  const ask = page.getByRole('link', { name: 'Ask the owner on WhatsApp' })
  await expect(ask).toHaveAttribute('href', /wa\.me\/\?text=.*Tata%20Salt%201%20kg/)
})

test('F-10: over the khata limit, the owner raises it and Back returns to the bill with the khata sheet open', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  api.kirana.product({ id: 'soap', name: 'Lux Soap 100 g', pricePaise: 3500, stock: 40 })
  api.kirana.customer({ id: 'ramesh', name: 'Ramesh', creditLimitPaise: 1000, balancePaise: 900 })
  await page.goto('/kirana/counter')
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await page.getByRole('button', { name: /Khata/ }).last().click()
  await page.getByRole('button', { name: /Ramesh/ }).click()
  await page.getByRole('button', { name: /Put .* on Ramesh's khata/ }).click()
  await page.getByRole('link', { name: /Ramesh's khata limit/ }).click()
  await expect(page).toHaveURL(/\/kirana\/khata\/ramesh$/)
  api.kirana.customers[0].creditLimitPaise = 100000
  await page.getByRole('link', { name: '← Back to the bill' }).click()
  await expect(page).toHaveURL(/\/kirana\/counter$/)
  await expect(page.getByRole('dialog').getByText('Ramesh', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: /Put .* on Ramesh's khata/ }).click()
  await expect(page.getByRole('dialog', { name: 'Bill 1 saved' })).toBeVisible()
})

test("F-15/F-18/F-23: today's card has a full-width button, Day goes back where it came from", async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  await page.goto('/more')
  await page.goto('/kirana/bills')
  await page.getByRole('link', { name: "See today's cash and UPI →" }).click()
  await expect(page).toHaveURL(/\/kirana\/day$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/kirana\/bills$/)
  // Opened straight from a link: Back goes to Bills
  await page.goto('/kirana/day')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/kirana\/bills$/)
})

test("F-18: the Bills' today card offers Try again after an error", async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  let fail = true
  await page.route('**/api/v1/kirana/day', (route) => (fail ? route.fulfill({ status: 500, body: '{"code":"UNKNOWN","message":"Something went wrong"}' }) : route.fallback()))
  await page.goto('/kirana/bills')
  const retry = page.getByRole('button', { name: 'Try again' }).first()
  await expect(retry).toBeVisible({ timeout: 20_000 })
  fail = false
  await retry.click()
  await expect(page.getByText('Cash in the drawer', { exact: false }).first()).toBeVisible()
})

test('F-09: the review lists every gap, each one tap from its step; F-08: guides before the photos and papers', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER', { status: 'DRAFT', ownerPhotoFileId: null, shopPhotoFileId: null, shopVideoFileId: null })
  api.kirana.upiId = null
  api.kirana.sellsFood = true
  await page.goto('/register/review')
  await expect(page.getByText('Still needed before you can submit:')).toBeVisible()
  await expect(page.getByRole('link', { name: /Add both photos/ })).toHaveAttribute('href', '/register/photos?from=review')
  await expect(page.getByRole('link', { name: /Add the shop video/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Your FSSAI licence is needed: you sell food\. Fix it/ })).toHaveAttribute('href', '/register/licences?from=review')
  await expect(page.getByRole('link', { name: /Add your UPI ID/ })).toHaveAttribute('href', '/register/upi?from=review')
  await page.getByRole('link', { name: /Add both photos/ }).click()
  await expect(page.getByRole('img', { name: 'Your face filling the photo, eyes open' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'From outside, the whole board readable' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Slowly, from the board to the shelves inside' })).toBeVisible()
  await page.goto('/register/licences')
  await expect(page.getByRole('img', { name: 'A payment or application receipt' })).toBeVisible()
  await expect(page.getByText('Upload the certificate itself, not the payment or application receipt.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'The whole licence, flat, name and address readable' })).toBeVisible()
  // The gap under Continue takes him to it
  await page.getByRole('button', { name: /Your FSSAI licence is needed/ }).click()
  await expect(page.getByLabel('FSSAI number')).toBeFocused()
})
