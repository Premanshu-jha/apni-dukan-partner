import type { Page } from '@playwright/test'
import { expect, signedIn, test } from './helpers'
import type { MockApi } from './mockApi'

/** The kirana counter's rough edges, each as the shopkeeper meets it (0.28.0's review fixes). */

async function atCounter(page: Page, context: Parameters<typeof signedIn>[0], api: MockApi, role: 'OWNER' | 'HELPER' = 'OWNER', over: Record<string, unknown> = {}) {
  await signedIn(context, api, null)
  api.kiranaShop(role, over)
  api.kirana.product({ id: 'soap', name: 'Lux Soap 100 g', pricePaise: 3500, stock: 40 })
  api.kirana.product({ id: 'salt', name: 'Tata Salt 1 kg', pricePaise: 2800, stock: 5 })
  await page.goto('/')
  await expect(page).toHaveURL(/\/kirana\/counter$/)
}

async function addSoap(page: Page) {
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
}

const posts = (api: MockApi, path: string) => api.calls.filter((c) => c.method === 'POST' && c.path === `/api/v1${path}`)

test('the receipt: change for the cash handed over, and a UPI that failed paid by cash in one tap', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  await page.getByRole('button', { name: 'Cash ₹35' }).click()
  await page.getByLabel('Cash given (optional, ₹)').fill('50')
  await expect(page.getByText('Give back ₹15')).toBeVisible()
  await page.getByLabel('Cash given (optional, ₹)').fill('20')
  await expect(page.getByText('₹15 short')).toBeVisible()
  await page.getByRole('button', { name: 'Next bill' }).click()

  await addSoap(page)
  await page.getByRole('button', { name: 'UPI ₹35' }).click()
  await expect(page.getByRole('img', { name: /UPI QR to pay ₹35/ })).toBeVisible()
  await page.getByRole('button', { name: "UPI didn't work: paid by cash instead" }).click()
  await expect(page.getByText('Paid by Cash')).toBeVisible()
  await expect(page.getByRole('img', { name: /UPI QR/ })).toHaveCount(0)
  expect(api.kirana.bills[0].payment).toBe('CASH')
})

test('a whole bill cleared in one tap, after a question', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  await page.getByLabel('Search your products').fill('salt')
  await page.getByRole('button', { name: /Tata Salt/ }).click()
  await page.getByRole('button', { name: 'Clear bill' }).click()
  await page.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.getByText('This bill (2 items)')).toBeVisible()
  await page.getByRole('button', { name: 'Clear bill' }).click()
  await page.getByRole('button', { name: 'Clear the bill' }).click()
  await expect(page.getByRole('heading', { name: 'This bill', exact: true })).toBeVisible()
  expect(posts(api, '/kirana/bills')).toHaveLength(0)
})

test('an item not in the list: its name and price changed on the bill; pieces show Change too', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  await page.getByRole('button', { name: 'Change' }).first().click()
  await page.getByLabel('How many').fill('3')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Cash ₹105' })).toBeVisible()
})

test('a khata over its limit: the owner gets a link to change the limit', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  api.kirana.customer({ id: 'kc-a', name: 'Anil', creditLimitPaise: 2000 })
  await addSoap(page)
  await page.getByRole('button', { name: 'Khata ₹35' }).click()
  await page.getByRole('button', { name: /Anil/ }).click()
  await page.getByRole('button', { name: "Put ₹35 on Anil's khata" }).click()
  await page.getByRole('link', { name: "Change Anil's khata limit" }).click()
  await expect(page).toHaveURL(/\/kirana\/khata\/kc-a$/)
})

test('a khata payment whose answer was lost: opened again, it is the same payment, recorded once', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  const anil = api.kirana.customer({ id: 'kc-a', name: 'Anil', balancePaise: 45000 })
  await page.goto('/kirana/khata/kc-a')
  await page.getByRole('button', { name: 'They paid' }).click()
  await page.getByLabel('Amount (₹)').fill('200')
  await page.getByRole('button', { name: 'UPI' }).click()
  api.failOnce.set('/payments', { status: 502, code: 'BAD_GATEWAY', message: 'The server had a problem.' })
  await page.getByRole('button', { name: 'Save the payment' }).click()
  await expect(page.getByText("We couldn't tell if the payment was saved.", { exact: false })).toBeVisible()
  // Closed and opened again: the same payment, locked
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'They paid' }).click()
  await expect(page.getByLabel('Amount (₹)')).toHaveValue('200')
  await expect(page.getByLabel('Amount (₹)')).toBeDisabled()
  await page.getByRole('button', { name: 'Save the payment' }).click()
  await expect(page.getByText('Owes ₹250').first()).toBeVisible()
  const refs = posts(api, '/kirana/khata/kc-a/payments').map((c) => (c.body as { clientRef: string; method: string }))
  expect(refs).toHaveLength(2)
  expect(refs[0].clientRef).toBe(refs[1].clientRef)
  expect(refs[1].method).toBe('UPI')
  expect(anil.balancePaise).toBe(25000)
})

test('a stock count whose answer was lost is kept until it is settled, and "It wasn\'t saved" lets it change', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  api.kirana.product({ id: 'soap', name: 'Lux Soap 100 g', pricePaise: 3500, stock: 40 })
  await page.goto('/kirana/products/soap')
  await page.getByRole('button', { name: 'Came in' }).click()
  await page.getByLabel('How many came in (pieces)').fill('12')
  api.failOnce.set('/stock', { status: 502, code: 'BAD_GATEWAY', message: 'The server had a problem.' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText("We couldn't tell if the stock that came in was saved.", { exact: false })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Came in' }).click()
  await expect(page.getByLabel('How many came in (pieces)')).toBeDisabled()
  await page.getByRole('button', { name: /It wasn't saved/ }).click()
  await page.getByLabel('How many came in (pieces)').fill('24')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('In stock: 64 pcs')).toBeVisible()
  expect(api.kirana.products[0].stock).toBe(64)
})

test('a bill with items brought back: refunded at its discounted share, and how it was paid stays', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  await page.getByRole('button', { name: 'One more Lux Soap 100 g' }).click()
  await page.getByRole('button', { name: 'Add a discount' }).click()
  await page.getByLabel('Amount off (₹)').fill('10')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Cash ₹60' }).click()
  await page.getByRole('link', { name: /Open the bill/ }).click()
  await page.getByRole('button', { name: 'Items brought back' }).click()
  await page.getByLabel(/Lux Soap 100 g \(up to 2/).fill('1')
  await page.getByRole('button', { name: 'Save' }).click()
  // Half of a ₹60 bill comes back: ₹30, not the ₹35 list price
  await expect(page.getByText(/₹30/).first()).toBeVisible()
  expect(api.kirana.bills[0].refundedPaise).toBe(3000)
  await expect(page.getByRole('button', { name: 'Change how it was paid' })).toHaveCount(0)
  await expect(page.getByText('Items came back on this bill, so how it was paid stays as it is.')).toBeVisible()
})

test('items brought back with a tapped reason: saved in English, shown on the bill', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  await page.getByRole('button', { name: 'Cash ₹35' }).click()
  await page.getByRole('link', { name: /Open the bill/ }).click()
  await page.getByRole('button', { name: 'Items brought back' }).click()
  await page.getByLabel(/Lux Soap 100 g \(up to 1/).fill('1')
  await page.getByRole('button', { name: 'Damaged', exact: true }).click()
  await expect(page.getByLabel('Reason (optional)')).toHaveValue('Damaged')
  await page.getByRole('button', { name: 'Save the return' }).click()
  await expect(page.getByText(/· Damaged$/)).toBeVisible()
  expect((api.kirana.bills[0].returns as { reason: string }[])[0].reason).toBe('Damaged')
})

test('a helper of a kirana waiting for the visit bills at the counter, as the owner does', async ({ page, context, api }) => {
  await atCounter(page, context, api, 'HELPER', { status: 'PENDING_VISIT' })
  await addSoap(page)
  await page.getByRole('button', { name: 'Cash ₹35' }).click()
  await expect(page.getByRole('dialog', { name: 'Bill 1 saved' })).toBeVisible()
})

test('a new product whose name is taken: its barcode goes on the one they have; typing survives leaving', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  api.kirana.product({ id: 'soap', name: 'Lux Soap 100 g', pricePaise: 3500, stock: 40 })
  await page.goto('/kirana/products/new?barcode=8906000111222&from=%2Fkirana%2Fproducts')
  await page.getByLabel('Name').fill('Lux Soap 100 g')
  await page.getByLabel('Price of one (₹)').fill('36')
  // Left for a moment (a customer at the counter) and back: the typing is still there
  await page.goto('/kirana/products')
  await page.goto('/kirana/products/new?barcode=8906000111222&from=%2Fkirana%2Fproducts')
  await expect(page.getByLabel('Price of one (₹)')).toHaveValue('36')
  await page.getByRole('button', { name: 'Save the product' }).click()
  await expect(page.getByText('You already have a product called "Lux Soap 100 g".', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Add barcode 8906000111222 to Lux Soap 100 g' }).click()
  await expect(page).toHaveURL(/\/kirana\/products\/soap$/)
  expect((api.kirana.products[0].barcodes as { code: string }[]).map((b) => b.code)).toEqual(['8906000111222'])
  expect(api.kirana.products).toHaveLength(1)
})

test('the owner sets a new khata customer’s limit on the spot; a customer without a mobile offers to add it', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER')
  await page.goto('/kirana/khata')
  await page.getByRole('button', { name: '+ New khata customer' }).click()
  await page.getByLabel('Name').fill('Meena')
  await page.getByLabel('Khata limit (₹)').fill('5000')
  await page.getByRole('button', { name: 'Add to the khata book' }).click()
  await expect(page).toHaveURL(/\/kirana\/khata\/kc\d+$/)
  expect(api.kirana.customers[0]).toMatchObject({ name: 'Meena', creditLimitPaise: 500000 })
  await page.getByRole('button', { name: 'Add mobile for WhatsApp' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Meena' })).toBeVisible()
})

test('a helper adding a khata customer sends no limit (the owner’s to set)', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('HELPER')
  await page.goto('/kirana/khata')
  await page.getByRole('button', { name: '+ New khata customer' }).click()
  await expect(page.getByLabel('Khata limit (₹)')).toHaveCount(0)
  await page.getByLabel('Name').fill('Meena')
  await page.getByRole('button', { name: 'Add to the khata book' }).click()
  const sent = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/kirana/khata')!
  expect(sent.body).toEqual({ name: 'Meena' })
  expect(api.kirana.customers[0].creditLimitPaise).toBe(200000)
})

test('a retry refused for good (a product removed meanwhile) unlocks the bill, and the gone line is marked', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  api.failOnce.set('/kirana/bills', { status: 502, code: 'BAD_GATEWAY', message: 'The server had a problem.' })
  await page.getByRole('button', { name: 'Cash ₹35' }).click()
  await expect(page.getByRole('button', { name: 'Try again: Cash ₹35' })).toBeVisible()
  api.kirana.products.find((p) => p.id === 'soap')!.active = false
  await page.getByRole('button', { name: 'Try again: Cash ₹35' }).click()
  await expect(page.getByText('Removed from your products meanwhile: take it off this bill.')).toBeVisible()
  // A clear refusal: nothing was billed, so the bill can be changed again
  await page.getByRole('button', { name: 'Remove Lux Soap 100 g' }).click()
  await expect(page.getByRole('button', { name: /Try again/ })).toHaveCount(0)
  expect(api.kirana.bills).toHaveLength(0)
})

test('"Change this bill anyway" after a lost answer makes a new bill with a new clientRef', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  api.failOnce.set('/kirana/bills', { status: 502, code: 'BAD_GATEWAY', message: 'The server had a problem.' })
  await page.getByRole('button', { name: 'Cash ₹35' }).click()
  await page.getByRole('button', { name: 'Change this bill anyway' }).click()
  await page.getByRole('button', { name: 'Yes, change it' }).click()
  await page.getByRole('button', { name: 'UPI ₹35' }).click()
  await expect(page.getByRole('dialog', { name: 'Bill 1 saved' })).toBeVisible()
  const refs = posts(api, '/kirana/bills').map((c) => (c.body as { clientRef: string }).clientRef)
  expect(refs).toHaveLength(2)
  expect(refs[0]).not.toBe(refs[1])
})

test('a double tap on Cash bills once', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  await page.getByRole('button', { name: 'Cash ₹35' }).dblclick()
  await expect(page.getByRole('dialog', { name: 'Bill 1 saved' })).toBeVisible()
  expect(posts(api, '/kirana/bills')).toHaveLength(1)
})

test("a helper sees no changes on another helper's bill, even one with his own name", async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('HELPER')
  const now = new Date().toISOString()
  api.kirana.bills.push({
    id: 'kb-x', billNo: 7, subtotalPaise: 3500, discountPaise: 0, totalPaise: 3500, payment: 'CASH', khataCustomer: null, paidNowPaise: null,
    paidNowBy: null, onKhataPaise: 0, refundedPaise: 0, version: 0, createdAt: now, byName: api.user.name, byId: 'someone-else', voidedAt: null,
    voidReason: null, lines: [{ lineNo: 1, productId: null, name: 'Pen', unit: 'PIECE', quantity: 1, pricePaise: 3500, amountPaise: 3500, returnedQuantity: 0 }],
    returns: [], changes: [], writtenOn: null, paperPhotoFileId: null,
  })
  await page.goto('/kirana/bills/kb-x')
  await expect(page.getByText('Only the owner can change this bill now.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Items brought back' })).toHaveCount(0)
})

test('a UPI bill shows its QR again from the bill', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await addSoap(page)
  await page.getByRole('button', { name: 'UPI ₹35' }).click()
  await page.getByRole('button', { name: 'Next bill' }).click()
  await page.goto(`/kirana/bills/${api.kirana.bills[0].id as string}`)
  await page.getByRole('button', { name: 'Show the UPI QR again' }).click()
  await expect(page.getByRole('img', { name: /UPI QR to pay ₹35/ })).toBeVisible()
  expect(api.kirana.bills[0].changes).toEqual([])
})

test('after Submit, "No food" can become "Yes" only with an FSSAI licence', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER', { status: 'PENDING_VISIT', shopVideoFileId: 'fv-video' })
  api.kirana.sellsFood = false
  await page.goto('/kirana/licences')
  await page.getByRole('button', { name: 'Yes, some food' }).click()
  await expect(page.getByText('A shop selling food needs its FSSAI licence', { exact: false })).toBeVisible()
  expect(api.kirana.sellsFood).toBe(false)
})

test('a verified kirana changes its papers only after the phone code', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  api.kiranaShop('OWNER', { addressLocked: true })
  api.editUntil = null
  api.kirana.sellsFood = false
  await page.goto('/kirana/licences')
  await page.getByRole('button', { name: 'Yes, some food' }).click()
  // Refused with EDIT_LOCKED: the code sheet comes up, and nothing changed
  await expect(page.getByRole('dialog', { name: "Confirm it's you" })).toBeVisible()
  expect(api.kirana.sellsFood).toBe(false)
})
