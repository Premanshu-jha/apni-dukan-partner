import { minutesFromNow, MockApi } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

/** Closing a shop and handing it over (backend README, "Closing a shop or handing it over"). */

test('close the shop: the warning, a reason, then no shop: the start screen says so, and the account can be deleted', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const booking = api.addBooking({ startsAt: minutesFromNow(120) })
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Close Shine Unisex Salon' }).click()
  await expect(page.getByText("Closing is for good. It can't be undone.")).toBeVisible()
  await expect(page.getByText('Every upcoming online booking is cancelled, and each customer is told the salon has closed.')).toBeVisible()
  await expect(page.getByText('Your helpers and barbers lose access at once.')).toBeVisible()
  await expect(page.getByText(/register a new shop: a new field visit and a new shop code/)).toBeVisible()
  const closeButton = page.getByRole('button', { name: 'Close Shine Unisex Salon for good' })
  await expect(closeButton).toBeDisabled()
  await page.getByLabel('Why are you closing? (optional)').fill('Moving to Pune')
  await page.getByLabel(/I understand that Shine Unisex Salon closes for good/).check()
  await closeButton.click()

  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('Shine Unisex Salon is closed. Its upcoming bookings were cancelled and the customers told.')).toBeVisible()
  expect(api.calls.find((c) => c.path === '/api/v1/shops/me/close')!.body).toEqual({ version: 3, reason: 'Moving to Pune' })
  // The session was refreshed: a token without the shop
  expect(api.calls.filter((c) => c.path === '/api/v1/auth/refresh').length).toBeGreaterThan(1)
  expect(booking.status).toBe('CANCELLED_BY_SALON')

  // No shop now: deleting the account is offered
  await page.getByRole('link', { name: 'Delete my account' }).click()
  await expect(page.getByRole('button', { name: /^Send code to \+91/ })).toBeVisible()
  await expect(page.getByText(/^This can't be undone\. Any salon bookings/)).toBeVisible()
})

test('closing refused because the shop changed: it is read again and the next try sends the new version', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/shop/close')
  await expect(page.getByLabel(/I understand/)).toBeVisible()
  api.shop = { ...api.shop!, version: 7 }
  await page.getByLabel(/I understand/).check()
  await page.getByRole('button', { name: /for good$/ }).click()
  await expect(page.getByText(/Your shop changed a moment ago/)).toBeVisible()
  await page.getByRole('button', { name: /for good$/ }).click()
  await expect(page).toHaveURL(/\/start$/)
  expect(api.calls.filter((c) => c.path === '/api/v1/shops/me/close').map((c) => (c.body as { version: number }).version)).toEqual([3, 7])
})

test('hand over: the neutral answer, the waiting request with Cancel, and the errors', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Hand over Shine Unisex Salon' }).click()
  const field = page.getByLabel('Their mobile number')

  // Not a mobile number: the button stays off; the owner's own number: said plainly
  await field.fill('12345')
  await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled()
  await field.fill('98480 12345')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText("That's your own number.", { exact: false })).toBeVisible()

  await field.fill('+91 98111 00000')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText("If that number has an Apni Dukan account, they'll see your request.")).toBeVisible()
  await expect(page.getByText('Waiting for an answer')).toBeVisible()
  await expect(page.getByText('+91 98111 00000')).toBeVisible()
  expect(api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/shops/me/handover').at(-1)!.body).toEqual({ phone: '9811100000', version: 3 })

  // Reloading shows the waiting request (GET), and Cancel takes it back (DELETE)
  await page.reload()
  await expect(page.getByText('Waiting for an answer')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel this request' }).click()
  await expect(page.getByLabel('Their mobile number')).toBeVisible()
  expect(api.ownHandover).toBeNull()

  // Another phone of the owner asked someone meanwhile: 409 HANDOVER_PENDING shows that request
  api.ownHandover = { id: 'h99', phone: '9811122222', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString() }
  await page.getByLabel('Their mobile number').fill('9811133333')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('+91 98111 22222')).toBeVisible()
  await expect(page.getByText('You already asked someone to take over this shop. Cancel that request first.')).toBeVisible()

  // 5 a day: the sixth ask is 429 with the backend's words
  api.ownHandover = null
  api.handoverAsks = 5
  await page.getByRole('button', { name: 'Cancel this request' }).click()
  await page.getByLabel('Their mobile number').fill('9811144444')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText('Too many hand-over requests today. Try again tomorrow.')).toBeVisible()
})

test('the owner note on Delete account links to hand over and close', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/profile/delete')
  await expect(page.getByText('Close or hand over your shop first. Then you can delete your account.')).toBeVisible()
  await page.getByRole('link', { name: 'Hand over Shine Unisex Salon' }).click()
  await expect(page).toHaveURL(/\/shop\/handover$/)
  await page.goto('/profile/delete')
  await page.getByRole('link', { name: 'Close Shine Unisex Salon' }).click()
  await expect(page).toHaveURL(/\/shop\/close$/)
})

test('someone without a shop is asked: the request on the start screen, Accept makes them the owner', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offerHandover()
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('Take over Royal Cuts?')).toBeVisible()
  await expect(page.getByText(/Suresh Rao, the owner of Royal Cuts \(shop code 10777, Sector 18, Noida\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByText(/Suresh Rao leaves the shop/)).toBeVisible()
  await page.getByRole('button', { name: 'Accept and become the owner' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('Royal Cuts')).toBeVisible()
  // The session was refreshed after accepting, so the token carries the shop as OWNER
  const accept = api.calls.findIndex((c) => c.path.endsWith('/accept'))
  expect(api.calls.slice(accept).some((c) => c.path === '/api/v1/auth/refresh')).toBe(true)
  await page.getByRole('link', { name: 'More' }).click()
  await expect(page.getByText(/You are the owner/)).toBeVisible()
})

test('decline, and a request gone meanwhile (cancelled, closed): it leaves the list with the reason', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offerHandover()
  const second = api.offerHandover({ id: 'shop8', name: 'Style Point', ownerName: 'Meena' })
  await page.goto('/start')
  await expect(page.getByText('Take over Royal Cuts?')).toBeVisible()
  await page.getByText('Take over Royal Cuts?').locator('..').getByRole('button', { name: 'Decline' }).click()
  await expect(page.getByText('You declined. Suresh Rao has been told.')).toBeVisible()
  await expect(page.getByText('Take over Royal Cuts?')).toHaveCount(0)

  // The shop closed before the answer: 409 HANDOVER_GONE { status: CLOSED }
  api.incoming.find((h) => h.view.id === second.id)!.status = 'CLOSED'
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.getByRole('button', { name: 'Accept and become the owner' }).click()
  await expect(page.getByText('The shop has been closed, so it can no longer be handed over.')).toBeVisible()
  await expect(page.getByText('Take over Style Point?')).toHaveCount(0)
  await expect(page).toHaveURL(/\/start$/)
})

test('a helper of another salon: ALREADY_IN_A_SHOP says to leave it first; the request shows on the day board and via the message', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  api.offerHandover()
  // From the message (it points at /handover)
  await page.goto('/notifications')
  await page.getByText('A shop for you').click()
  await expect(page).toHaveURL(/\/handover$/)
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.getByRole('button', { name: 'Accept and become the owner' }).click()
  await expect(page.getByText('You work in another shop. Leave it first, then accept. You can leave Shine Unisex Salon from More.')).toBeVisible()
  await page.goto('/salon/day')
  await expect(page.getByText('Take over Royal Cuts?')).toBeVisible()
})

test('a helper asked to take over his own salon is promoted to owner', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  api.offerHandover({ id: 'shop1', name: 'Shine Unisex Salon', ownerName: 'Old Owner', shopCode: 10234 })
  await page.reload()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByText('You stay in it, as the owner now.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Accept and become the owner' }).click()
  await expect(page.getByText('Take over Shine Unisex Salon?')).toHaveCount(0)
  await page.getByRole('link', { name: 'More' }).click()
  await expect(page.getByText(/You are the owner/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Close Shine Unisex Salon' })).toBeVisible()
})

test('the inbox shows the hand-over messages with their own icons', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  for (const [type, title] of [
    ['SHOP_HANDOVER_ACCEPTED', 'Shop handed over'],
    ['SHOP_HANDOVER_DECLINED', 'Hand-over declined'],
    ['SHOP_HANDOVER_DONE', 'The shop is yours'],
  ]) {
    api.inbox.unshift({ id: `n-${type}`, type, title, body: '…', url: '/shops/me', sentAt: new Date().toISOString(), read: false })
  }
  await page.goto('/notifications')
  for (const t of ['Shop handed over', 'Hand-over declined', 'The shop is yours']) await expect(page.getByText(t)).toBeVisible()
  await page.getByText('The shop is yours').click()
  await expect(page).toHaveURL(/\/salon\/day$/)
})

test('a draft\'s owner can hand it over or close it from registration; then delete the account from Start', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/register$/)
  await page.getByRole('link', { name: 'Hand it over' }).click()
  await expect(page).toHaveURL(/\/shop\/handover$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await page.getByRole('link', { name: 'close it' }).click()
  await page.getByLabel(/I understand/).check()
  await page.getByRole('button', { name: /for good$/ }).click()
  await expect(page).toHaveURL(/\/start$/)
  await page.getByRole('link', { name: 'Delete my account' }).click()
  await expect(page.getByRole('button', { name: /^Send code to \+91/ })).toBeVisible()
})

test('staff of a salon not live yet can delete their account from the waiting screen', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('HELPER')
  api.shop = { ...api.shop!, status: 'PENDING_VISIT' }
  await page.goto('/')
  await expect(page.getByText("Your salon isn't live yet")).toBeVisible()
  await page.getByRole('link', { name: 'Delete my account' }).click()
  await expect(page.getByRole('button', { name: /^Send code to \+91/ })).toBeVisible()
  await page.getByRole('button', { name: 'Keep my account' }).click()
  await expect(page.getByText("Your salon isn't live yet")).toBeVisible()
})

test('closing after a hand-over was accepted first (the race): 404 NO_SHOP says so and the app moves to Start', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/shop/close')
  await expect(page.getByLabel(/I understand/)).toBeVisible()
  // Someone accepted the hand-over a moment ago: this person owns nothing now
  api.shop = null
  await page.getByLabel(/I understand/).check()
  await page.getByRole('button', { name: /for good$/ }).click()
  // The refusal reads the shop again: none, so the gate moves to Start, which says why
  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText("You're no longer the owner of Shine Unisex Salon: it was handed over or closed already.")).toBeVisible()
  expect(api.calls.filter((c) => c.path === '/api/v1/shops/me/close')).toHaveLength(1)
})

test('accepting with an out-of-date profile (403 PROFILE_INCOMPLETE): the missing step, then back to the request', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offerHandover()
  await page.goto('/start')
  await expect(page.getByText('Take over Royal Cuts?')).toBeVisible()
  api.user = { ...api.user, emailVerified: false }
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.getByRole('button', { name: 'Accept and become the owner' }).click()
  await expect(page).toHaveURL(/\/welcome\/email$/)
  expect(api.calls.some((c) => c.method === 'GET' && c.path === '/api/v1/auth/me')).toBe(true)
  // Verify the email: back to the request, and accepting now works
  await page.getByLabel('Email').fill('ravi@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page).toHaveURL(/\/handover$/)
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.getByRole('button', { name: 'Accept and become the owner' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
})

test('accepted, but the sign-in can\'t be renewed: tried twice, then a note with Try again opens the shop', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offerHandover()
  await page.goto('/start')
  await expect(page.getByText('Take over Royal Cuts?')).toBeVisible()
  api.refreshDown = 4 // more than the two tries the app makes
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.getByRole('button', { name: 'Accept and become the owner' }).click()
  await expect(page.getByText("You're the owner now, but this phone couldn't renew its sign-in.", { exact: false })).toBeVisible()
  expect(api.refreshDown).toBe(2)
  api.refreshDown = 0
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('Royal Cuts')).toBeVisible()
})

test('a photo link refused with 403 SHOP_REQUIRED (a token from before a hand-over) renews the sign-in once and shows the photo', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  api.staleFileTokenOnce = true
  await page.goto('/register/photos')
  // Three links on this page (two photos and the salon video): the refused one renews the sign-in, then is asked again
  await expect.poll(() => api.calls.filter((c) => c.path.endsWith('/link')).length).toBeGreaterThanOrEqual(4)
  const firstLink = api.calls.findIndex((c) => c.path.endsWith('/link'))
  await expect.poll(() => api.calls.slice(firstLink).some((c) => c.path === '/api/v1/auth/refresh')).toBe(true)
  await expect(page.locator('img[src*="blob.png"]')).toHaveCount(2)
})
