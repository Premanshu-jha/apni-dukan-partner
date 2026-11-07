import { addDays, todayIst } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

test('the owner adds a helper, gives walk-in access and removes the helper', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Team and walk-in access' }).click()
  await page.getByLabel("Helper's mobile number").fill('+91 99999 00001')
  await page.getByRole('button', { name: 'Add helper' }).click()
  await expect(page.getByText('+91 99999 00001')).toBeVisible()
  expect(api.calls.find((c) => c.path === '/api/v1/shops/me/helpers')!.body).toEqual({ phone: '9999900001' })

  await page.getByRole('switch', { name: /can add walk-ins/ }).click()
  await expect(page.getByRole('switch', { name: /can add walk-ins/ })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('+91 99999 00001')).toBeHidden()

  await page.getByLabel("Helper's mobile number").fill('9848012345')
  await page.getByRole('button', { name: 'Add helper' }).click()
  await expect(page.getByText('This person already works in a shop.')).toBeVisible()
})

test('messages: the salon’s news, opened on the right day', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const day = addDays(todayIst(), 2)
  api.inbox = [
    { id: 'n2', type: 'SALON_BOOKING_CANCELLED', title: 'Booking cancelled, 4:30 PM', body: 'Riya cancelled.', url: `/salon/day?date=${day}`, sentAt: new Date().toISOString(), read: true },
    { id: 'n1', type: 'SALON_NEW_BOOKING', title: 'New booking, 4:30 PM', body: 'Riya booked Haircut with Ravi.', url: `/salon/day?date=${day}`, sentAt: new Date().toISOString(), read: false },
  ]
  await page.goto('/salon/day')
  await page.getByRole('link', { name: 'Messages, 1 unread' }).click()
  await page.getByText('New booking, 4:30 PM').click()
  await expect(page).toHaveURL(new RegExp(`date=${day}$`))
  await expect.poll(() => api.calls.find((c) => c.path.startsWith('/api/v1/me/notifications/read'))?.body).toEqual({ ids: ['n1'] })
  expect(api.calls.find((c) => c.path.startsWith('/api/v1/me/notifications?'))!.path).toContain('app=partner')
})

test('a helper leaves the salon and is signed out', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Leave Shine Unisex Salon' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL(/\/signin$/)
})

test('the owner has no "leave", and signs out on this device', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More' }).click()
  await expect(page.getByText('Shop code 10234 · You are the owner')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Leave/ })).toBeHidden()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await page.goto('/salon/day')
  await expect(page).toHaveURL(/\/signin$/)
})

test('an expired session refreshes once for calls made together, in two tabs too', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const second = await context.newPage()
  await second.goto('/setup')
  await expect(second.getByText('Services and prices')).toBeVisible()
  api.expireAccess()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await second.reload()
  await expect(second.getByText('Services and prices')).toBeVisible()
  // Never the same refresh token twice (the backend would sign out everywhere)
  const sent = api.calls.filter((c) => c.path === '/api/v1/auth/refresh').map((c) => (c.body as { refreshToken: string }).refreshToken)
  expect(new Set(sent).size).toBe(sent.length)
})

test('the history shows totals per outcome for the owner', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.addBooking({ startsAt: new Date(Date.now() - 3 * 3600_000).toISOString(), status: 'COMPLETED' })
  api.addBooking({ startsAt: new Date(Date.now() - 2 * 3600_000).toISOString(), status: 'NO_SHOW', customerName: 'Ghost' })
  await page.getByRole('link', { name: 'Bookings' }).click()
  await expect(page.getByText('No bookings coming up')).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByText('₹200', { exact: true })).toBeVisible()   // the completed haircut, at list price
  await expect(page.getByText('No-show: 1')).toBeVisible()
  await expect(page.getByText('Ghost')).toBeVisible()
})

test('a barber deletes their account with the SMS code: signed out, "Your account has been deleted."', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Delete my account' }).click()
  await expect(page.getByText(/This can't be undone\. You leave Shine Unisex Salon/)).toBeVisible()
  await page.getByRole('button', { name: /^Send code to \+91/ }).click()
  await page.getByLabel('SMS code').fill('111111')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByText('That code is not correct')).toBeVisible()

  await page.getByLabel('SMS code').fill('123456')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText('Your account has been deleted.')).toBeVisible()
  expect(api.calls.filter((c) => c.path.startsWith('/api/v1/auth/me/delete')).map((c) => [c.path, c.body])).toEqual([
    ['/api/v1/auth/me/delete-code', undefined],
    ['/api/v1/auth/me/delete', { code: '111111' }],
    ['/api/v1/auth/me/delete', { code: '123456' }],
  ])
  // Nothing of the old session comes back
  await page.goto('/salon/day')
  await expect(page).toHaveURL(/\/signin$/)
})

test('a helper with a booking starting within the hour is told to wait (BOOKING_SOON); a booking pause (BOOKING_BLOCKED) too', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  api.failOnce.set('/auth/me/delete-code', {
    status: 409,
    code: 'BOOKING_SOON',
    message: "You have a booking starting within the hour or in progress (AD-1234). Cancel it or wait until it's over, then delete your account.",
  })
  await page.goto('/profile/delete')
  await page.getByRole('button', { name: /^Send code to \+91/ }).click()
  await expect(page.getByText(/You have a booking starting within the hour or in progress \(AD-1234\)/)).toBeVisible()
  await expect(page.getByLabel('SMS code')).toBeHidden()

  // Later: the code is sent, but a booking pause from no-shows refuses the deletion (the code still works afterwards)
  await page.getByRole('button', { name: /^Send code to \+91/ }).click()
  api.failOnce.set('/auth/me/delete', {
    status: 409,
    code: 'BOOKING_BLOCKED',
    message: 'You can delete your account after your booking pause ends on 14 Nov.',
  })
  await page.getByLabel('SMS code').fill('123456')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByText('You can delete your account after your booking pause ends on 14 Nov.')).toBeVisible()
  await expect(page).toHaveURL(/\/profile\/delete$/)
  await page.getByRole('button', { name: 'Keep my account' }).click()
  await expect(page).toHaveURL(/\/more$/)
})

test('the owner has no delete: "close or hand over your shop first", on More and on the screen itself', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More' }).click()
  await expect(page.getByText('To delete your account, close or hand over your shop first.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Delete my account' })).toBeHidden()
  await page.goto('/profile/delete')
  await expect(page.getByText('Close or hand over your shop first. Then you can delete your account.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Send code/ })).toBeHidden()
  expect(api.calls.some((c) => c.path.startsWith('/api/v1/auth/me/delete'))).toBe(false)
})

test('made the owner meanwhile: the backend refuses (SHOP_OWNER) and the screen follows', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.goto('/profile/delete')
  await expect(page.getByRole('button', { name: /^Send code to \+91/ })).toBeVisible()
  api.role = 'OWNER'
  api.shop = { ...api.shop!, myRole: 'OWNER' }
  await page.getByRole('button', { name: /^Send code to \+91/ }).click()
  await expect(page.getByText('Close or hand over your shop first. Then you can delete your account.')).toBeVisible()
})
