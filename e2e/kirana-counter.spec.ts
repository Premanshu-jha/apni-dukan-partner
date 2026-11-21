import type { Page } from '@playwright/test'
import { expect, signedIn, test } from './helpers'
import type { MockApi } from './mockApi'

async function atCounter(page: Page, context: Parameters<typeof signedIn>[0], api: MockApi, role: 'OWNER' | 'HELPER' = 'OWNER') {
  await signedIn(context, api, null)
  api.kiranaShop(role)
  api.kirana.product({ id: 'salt', name: 'Tata Salt 1 kg', pricePaise: 2800, stock: 5, lowStockAt: 3, barcodes: [{ code: '8901058000017', pack: 1 }, { code: '8901058000999', pack: 12 }] })
  api.kirana.product({ id: 'sugar', name: 'Sugar loose', unit: 'KG', pricePaise: 4800, stock: 20 })
  api.kirana.product({ id: 'soap', name: 'Lux Soap 100 g', pricePaise: 3500, stock: 40 })
  await page.goto('/')
  await expect(page).toHaveURL(/\/kirana\/counter$/)
}

/** A barcode typed into the scanner (the test browser has no camera: the typed digits are the same path). */
async function scan(page: Page, code: string) {
  await page.getByLabel('Or type the digits under the barcode').fill(code)
  await page.getByRole('button', { name: 'Use' }).click()
}

test('a cash bill from scans, a search, loose sugar by amount and an item not in the list, with a discount', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Counter' })).toBeVisible()
  await page.getByRole('button', { name: 'Scan' }).click()
  await scan(page, '8901058000017')
  await expect(page.getByText('Tata Salt 1 kg added')).toBeVisible()
  // A carton's barcode adds its pack
  await scan(page, '8901058000999')
  await expect(page.getByText('Tata Salt 1 kg × 12 added')).toBeVisible()
  await page.getByRole('button', { name: /Done: back to the bill/ }).click()
  await expect(page.getByText('13 pcs × ₹28 each')).toBeVisible()
  await page.getByRole('button', { name: 'One less Tata Salt 1 kg' }).click()
  await expect(page.getByText('12 pcs × ₹28 each')).toBeVisible()

  // Search, then a loose item by the amount asked for
  await page.getByLabel('Search your products').fill('sugar')
  await page.getByRole('button', { name: /Sugar loose/ }).click()
  await page.getByRole('button', { name: 'By amount (₹)' }).click()
  await page.getByLabel('Amount in ₹ the customer asks for').fill('30')
  await expect(page.getByText('= about 0.625 kg')).toBeVisible()
  await page.getByRole('button', { name: 'Add to the bill' }).click()

  // Something not in the list: its name and price
  await page.getByRole('button', { name: 'Item not in list' }).click()
  await page.getByLabel('What is it?').fill('Agarbatti')
  await page.getByLabel('Price of one (₹)').fill('15')
  await page.getByLabel('How many').fill('2')
  await page.getByRole('button', { name: 'Add to the bill' }).click()

  await page.getByRole('button', { name: 'Add a discount' }).click()
  await page.getByLabel('Amount off (₹)').fill('6')
  await page.getByRole('button', { name: 'Save' }).click()
  // 12 × 28 + 30 + 2 × 15 − 6
  await expect(page.getByText('₹390', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cash ₹390' }).click()

  await expect(page.getByRole('dialog', { name: 'Bill 1 saved' })).toBeVisible()
  await expect(page.getByText('Paid by Cash')).toBeVisible()
  await expect(page.getByText(/Running out: Tata Salt 1 kg \(-7 pcs left\)/)).toBeVisible()
  const sent = api.kirana.billCalls[0]
  expect(sent).toMatchObject({
    payment: 'CASH',
    discountPaise: 600,
    lines: [{ productId: 'salt', quantity: 12 }, { productId: 'sugar', amountPaise: 3000 }, { name: 'Agarbatti', amountPaise: 1500, quantity: 2 }],
  })
  await page.getByRole('button', { name: 'Next bill' }).click()
  await expect(page.getByText('Scan a pack, or search for a product above, to start a bill.')).toBeVisible()
})

test('a UPI bill shows the QR to scan; with no UPI ID set it says so', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await page.getByRole('button', { name: 'UPI ₹35' }).click()
  await expect(page.getByRole('img', { name: 'UPI QR to pay ₹35 to Sharma Kirana Store' })).toBeVisible()
  await expect(page.getByText('To Sharma Kirana Store · sharmastore@okhdfcbank')).toBeVisible()
  await page.getByRole('button', { name: 'Next bill' }).click()

  api.kirana.upiId = null
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await page.getByRole('button', { name: 'UPI ₹35' }).click()
  await expect(page.getByText("No QR: the shop's UPI ID isn't set.")).toBeVisible()
  await page.getByRole('link', { name: 'Set it now' }).click()
  await expect(page).toHaveURL(/\/kirana\/upi$/)
})

test('khata: a new customer on the spot, the limit, and part paid now', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  api.kirana.customer({ id: 'kc-a', name: 'Anil', note: 'Tower B 1204', creditLimitPaise: 5000 })
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await page.getByRole('button', { name: 'One more Lux Soap 100 g' }).click()
  await page.getByRole('button', { name: 'Khata ₹70' }).click()
  await page.getByLabel('Search the khata book').fill('1204')
  await page.getByRole('button', { name: /Anil/ }).click()
  await page.getByRole('button', { name: "Put ₹70 on Anil's khata" }).click()
  await expect(page.getByText('Anil can buy ₹50 more on khata', { exact: false })).toBeVisible()
  // Part paid now: only the rest goes on the khata
  await page.getByLabel('Paid now (optional, ₹)').fill('20')
  await page.getByRole('button', { name: 'UPI' }).last().click()
  await page.getByRole('button', { name: "Put ₹50 on Anil's khata" }).click()
  await expect(page.getByText('On khata (₹20 paid now by UPI)')).toBeVisible()
  await expect(page.getByRole('img', { name: /UPI QR to pay ₹20/ })).toBeVisible()
  await expect(page.getByText('Anil: owes ₹50 now · can buy ₹0 more')).toBeVisible()
  await page.getByRole('button', { name: 'Next bill' }).click()

  // A new customer added from the counter
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await page.getByRole('button', { name: 'Khata ₹35' }).click()
  await page.getByRole('button', { name: '+ New khata customer' }).click()
  await page.getByLabel('Name').fill('Sunita')
  await page.getByLabel('Mobile (optional)').fill('98480 11111')
  await page.getByRole('button', { name: 'Add to the khata book' }).click()
  await page.getByRole('button', { name: "Put ₹35 on Sunita's khata" }).click()
  await expect(page.getByText('Sunita: owes ₹35 now')).toBeVisible()
})

test('a Save whose answer never came: only the same bill can be tried again, and it is billed once', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  api.failOnce.set('/kirana/bills', { status: 502, code: 'BAD_GATEWAY', message: 'The server had a problem.' })
  await page.getByRole('button', { name: 'Cash ₹35' }).click()
  await expect(page.getByText("We couldn't tell if the bill was saved. Try again: it is never billed twice.", { exact: false })).toBeVisible()
  // The bill can't be changed meanwhile (a change would be billed as the first try), and only the same payment is offered
  await expect(page.getByRole('button', { name: 'Scan' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove Lux Soap 100 g' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'UPI ₹35' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Add it as a product' })).toHaveCount(0)
  // Survives a reload
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove Lux Soap 100 g' })).toBeDisabled()
  await page.getByRole('button', { name: 'Try again: Cash ₹35' }).click()
  await expect(page.getByRole('dialog', { name: 'Bill 1 saved' })).toBeVisible()
  const refs = api.calls.filter((c) => c.path === '/api/v1/kirana/bills' && c.method === 'POST').map((c) => (c.body as { clientRef: string }).clientRef)
  expect(refs).toHaveLength(2)
  expect(refs[0]).toBe(refs[1])
  expect(api.kirana.bills).toHaveLength(1)
})

test('the bill being made stays on this phone, and the next person signed in never gets it', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await page.reload()
  await expect(page.getByText('This bill (1 item)')).toBeVisible()
  await page.goto('/more')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('adp.kiranaCart')))).toEqual([])
})

test('a helper can take up to ₹10 off; more is the owner’s', async ({ page, context, api }) => {
  await atCounter(page, context, api, 'HELPER')
  await page.getByLabel('Search your products').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await page.getByRole('button', { name: 'Add a discount' }).click()
  await expect(page.getByText('Up to ₹10, to round off. The owner can give more.')).toBeVisible()
  await page.getByLabel('Amount off (₹)').fill('15')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('A helper can take up to ₹10 off. Ask the owner for more.')).toBeVisible()
  await page.getByLabel('Amount off (₹)').fill('5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('−₹5')).toBeVisible()
  // No Team, no UPI ID in More for a helper
  await page.goto('/more')
  await expect(page.getByRole('link', { name: "Day's totals" })).toBeVisible()
  await expect(page.getByRole('link', { name: /Team/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /UPI ID/ })).toHaveCount(0)
})

test('an unknown barcode: added as a new product from the counter, it goes onto the bill', async ({ page, context, api }) => {
  await atCounter(page, context, api)
  await page.getByRole('button', { name: 'Scan' }).click()
  await scan(page, '8906000111222')
  await expect(page.getByText("Barcode 8906000111222 isn't in your products yet")).toBeVisible()
  await page.getByRole('button', { name: 'Add a new product' }).click()
  await expect(page).toHaveURL(/\/kirana\/products\/new\?/)
  await expect(page.getByLabel('Barcode (optional)')).toHaveValue('8906000111222')
  await page.getByLabel('Name').fill('Parle-G 250 g')
  await page.getByLabel('Price of one (₹)').fill('25')
  await page.getByRole('button', { name: 'Save the product' }).click()
  await expect(page).toHaveURL(/\/kirana\/counter$/)
  await expect(page.getByText('Parle-G 250 g')).toBeVisible()
  // It scans as that product from now on
  await page.getByRole('button', { name: 'Scan' }).click()
  await scan(page, '8906000111222')
  await expect(page.getByText('Parle-G 250 g added')).toBeVisible()

  // An unknown one linked to a product already there
  await scan(page, '8906000999888')
  await page.getByRole('button', { name: "It's a product I already have" }).click()
  await page.getByLabel('Search for the product').fill('lux')
  await page.getByRole('button', { name: /Lux Soap/ }).click()
  await expect(page.getByText('Lux Soap 100 g added (barcode saved)')).toBeVisible()
  expect((api.kirana.products.find((p) => p.name === 'Lux Soap 100 g')!.barcodes as { code: string }[]).map((b) => b.code)).toContain('8906000999888')
})
