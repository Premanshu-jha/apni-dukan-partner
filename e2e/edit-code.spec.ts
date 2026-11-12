import { addDays, todayIst } from './mockApi'
import { atSalon, expect, test } from './helpers'

test('a verified salon is edited after a code to the owner’s phone; one code opens every edit for 15 minutes', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.editUntil = null
  await page.goto('/more')
  // More's Edit asks for the code straight away
  await page.getByRole('link', { name: 'Edit salon details' }).click()
  const sheet = page.getByRole('dialog', { name: "Confirm it's you" })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('lets you change everything for 15 minutes', { exact: false })).toBeVisible()
  // Not now: the details stay on screen to read; the bar offers the code again
  await sheet.getByRole('button', { name: 'Not now' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByLabel('Salon name')).toBeVisible()
  await page.getByRole('button', { name: 'Start editing' }).click()
  await sheet.getByRole('button', { name: 'Send code' }).click()
  await expect.poll(() => api.editCodesSent).toBe(1)
  await expect(sheet.getByRole('button', { name: 'Sent. You can send again after 30 seconds' })).toBeDisabled()
  await sheet.getByLabel('SMS code').fill('000000')
  await sheet.getByRole('button', { name: 'Start editing' }).click()
  await expect(sheet.getByText('That code is not correct')).toBeVisible()
  await sheet.getByLabel('SMS code').fill('123456')
  await sheet.getByRole('button', { name: 'Start editing' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText(/Editing is on until .* \(15 min left\)/)).toBeVisible()

  await page.getByLabel('Salon name').fill('Shine Salon & Spa')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.shop!.name).toBe('Shine Salon & Spa')

  // The other edit screens are open too, with no second code
  await page.goto('/setup/photos')
  await expect(page.getByText(/Editing is on until/)).toBeVisible()
  await page.goto('/setup/document')
  await expect(page.getByText(/Editing is on until/)).toBeVisible()

  // The time runs out while typing: the save asks again; closing the sheet keeps what was typed
  await page.goto('/setup/details')
  await page.getByLabel('Salon name').fill('Shine Unisex Salon')
  api.editUntil = null
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByLabel('Salon name')).toHaveValue('Shine Unisex Salon')
  await page.getByRole('button', { name: 'Start editing' }).click()
  await sheet.getByRole('button', { name: 'Send code' }).click()
  await sheet.getByLabel('SMS code').fill('123456')
  await sheet.getByRole('button', { name: 'Start editing' }).click()
  await expect(page.getByLabel('Salon name')).toHaveValue('Shine Unisex Salon')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.shop!.name).toBe('Shine Unisex Salon')

  // Done: off at once, still on the page
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible()
  await expect(page).toHaveURL(/\/setup\/details$/)
  await expect.poll(() => api.editUntil).toBeNull()
})

test('a salon still registering asks for no code', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.editUntil = null
  api.shop = { ...api.shop!, addressLocked: false }
  await page.goto('/setup/details')
  await expect(page.getByLabel('Salon name')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start editing' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: "Confirm it's you" })).toHaveCount(0)
})

test('the owner asks the field team for a new address; the salon keeps the old one until they approve', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const oldAddress = api.shop!.addressLine as string
  await page.goto('/more')
  await page.getByRole('link', { name: 'Request address change' }).click()
  await expect(page.getByRole('heading', { name: 'Request address change' })).toBeVisible()
  // Only the address and the pin here, typed and moved again
  await expect(page.getByLabel('Salon name')).toHaveCount(0)
  await expect(page.getByLabel('Shop number, building, street')).not.toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible()

  // The same address: said under the field
  await page.getByRole('button', { name: 'Send to the field team' }).click()
  await expect(page.getByText('is the address you have now', { exact: false })).toBeVisible()

  await page.getByLabel('Shop number, building, street').fill('Shop 12, Sector 18 Market')
  await page.getByRole('button', { name: 'Send to the field team' }).click()
  // Said next to the button too
  await expect(page.getByText('Sent to our field team. Your salon keeps its address until they approve it.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send the changed request' })).toBeVisible()
  await expect(page.getByText('New address: Shop 12, Sector 18 Market', { exact: false })).toBeVisible()
  expect(api.addressRequests.at(-1)!.status).toBe('PENDING')
  expect(api.shop!.addressLine).toBe(oldAddress)
  expect(api.shop!.status).toBe('APPROVED')
  // More says it waits
  await page.goto('/more')
  await expect(page.getByText('New address waiting for our field team: Shop 12, Sector 18 Market', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'See the request' }).click()
  await expect(page.getByText('Waiting for our field team')).toBeVisible()
  // The form starts from the request, to change it
  await expect(page.getByLabel('Shop number, building, street')).toHaveValue('Shop 12, Sector 18 Market')

  // Taken back
  await page.getByRole('button', { name: 'Cancel the request' }).click()
  await expect(page.getByText('Waiting for our field team')).toHaveCount(0)
  expect(api.addressRequests.at(-1)!.status).toBe('CANCELLED')
  expect(api.shop!.recheckSince).toBeNull()   // nothing else was waiting for a check

  // Declined: the reason shows, and a new one can be sent
  await page.getByLabel('Shop number, building, street').fill('Shop 14, Sector 18 Market')
  await page.getByRole('button', { name: 'Send to the field team' }).click()
  await expect(page.getByText('Sent to our field team', { exact: true })).toBeVisible()
  api.decideAddressRequest(false, 'The board at the new place shows another salon.')
  await page.reload()
  await expect(page.getByText("wasn't approved: “The board at the new place shows another salon.”", { exact: false })).toBeVisible()

  // Approved: the salon's address is the new one
  await page.getByLabel('Shop number, building, street').fill('Shop 15, Sector 18 Market')
  await page.getByRole('button', { name: 'Send to the field team' }).click()
  await expect(page.getByText('Sent to our field team', { exact: true })).toBeVisible()
  api.decideAddressRequest(true)
  await page.goto('/more')
  await expect(page.getByText('Shop 15, Sector 18 Market', { exact: false })).toBeVisible()
})

test('a barber sees the salon’s hours, services and offers, read only', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  api.offers = [{
    offer: { id: 'of1', percentOff: 20, allServices: true, serviceIds: [], startsOn: todayIst(), endsOn: addDays(todayIst(), 2), from: null, until: null },
    createdAt: new Date().toISOString(),
    endedAt: null,
    notified: 3,
    bookings: 1,
  }]
  await page.goto('/more')
  await page.getByRole('link', { name: 'Salon info: hours, services, offers' }).click()
  await expect(page.getByRole('heading', { name: 'Salon info' })).toBeVisible()
  await expect(page.getByText('20% off')).toBeVisible()
  await expect(page.getByText('Running', { exact: true })).toBeVisible()
  await expect(page.getByText('All services', { exact: false })).toBeVisible()
  await expect(page.getByText('Haircut', { exact: false }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Opening hours' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Save|Edit|Add/ })).toHaveCount(0)
})
