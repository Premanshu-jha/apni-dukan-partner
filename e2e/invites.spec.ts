import { atSalon, expect, signedIn, test } from './helpers'

test('the owner invites a helper: the neutral answer, the waiting list with Cancel, and the refusals', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/team')
  await page.getByLabel("Helper's mobile number").fill('99999 00001')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText("Invitation sent. They'll see it in Apni Dukan when they sign in with this number.")).toBeVisible()
  const waiting = page.getByRole('region', { name: 'Invitations waiting' })
  await expect(waiting.getByText('+91 99999 00001')).toBeVisible()
  await expect(waiting.getByText(/^Helper · open until/)).toBeVisible()
  // Nobody joined
  expect(api.members.some((m) => m.phone === '9999900001')).toBe(false)
  await waiting.getByRole('button', { name: 'Cancel' }).click()
  await expect(waiting).toHaveCount(0)
  expect(api.calls.some((c) => c.method === 'DELETE' && /\/shops\/me\/invites\/i\d+$/.test(c.path))).toBe(true)

  api.members.push({ userId: 'u7', name: 'Sunil', phone: '9999900002', role: 'HELPER', staffId: null, walkInAccess: false })
  await page.getByLabel("Helper's mobile number").fill('9999900002')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText('This number already works in your shop.')).toBeVisible()

  api.shopInvites = Array.from({ length: 9 }, (_, i) => ({ id: `w${i}`, phone: `98000000${String(i).padStart(2, '0')}`, role: 'HELPER', staffId: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString() }))
  await page.getByLabel("Helper's mobile number").fill('9999900003')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText(/A shop can have up to 10 helpers, counting invitations still waiting/)).toBeVisible()
})

test('a barber’s sign-in is an invitation: shown while it waits, cancelled from his page; one phone, one invitation', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/staff/st1')
  await page.getByLabel('His mobile number').fill('9999900005')
  await page.getByRole('button', { name: 'Invite him to sign in' }).click()
  await expect(page.getByText(/Invited: \+91 99999 00005, waiting for him to accept/)).toBeVisible()
  expect(api.staff[0].loginPhone).toBeNull()
  await page.goto('/team')
  await expect(page.getByRole('region', { name: 'Invitations waiting' }).getByText(/^Barber · open until/)).toBeVisible()

  // The same phone for another barber: 409 INVITE_PENDING
  await page.goto('/setup/staff/st2')
  await page.getByRole('button', { name: 'Remove his sign-in' }).click()
  await page.getByLabel('His mobile number').fill('9999900005')
  await page.getByRole('button', { name: 'Invite him to sign in' }).click()
  await expect(page.getByText('This number already has an invitation to your shop waiting. Cancel it first.')).toBeVisible()

  await page.goto('/setup/staff/st1')
  await page.getByRole('button', { name: 'Cancel the invitation' }).click()
  await expect(page.getByText('Invitation cancelled.')).toBeVisible()
  await expect(page.getByLabel('His mobile number')).toBeVisible()
  expect(api.shopInvites).toEqual([])
})

test('someone without a shop accepts an invitation and opens the salon as its helper', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offerInvite('HELPER')
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('Join Style Point?')).toBeVisible()
  await expect(page.getByText(/Style Point \(shop code 10555, Sector 15, Noida\) invited you to join as a helper/)).toBeVisible()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('Style Point')).toBeVisible()
  const accept = api.calls.findIndex((c) => c.path.endsWith('/accept'))
  expect(api.calls.slice(accept).some((c) => c.path === '/api/v1/auth/refresh')).toBe(true)
})

test('declining, an invitation gone meanwhile, and the message that opens the invitations', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.offerInvite('BARBER')
  const second = api.offerInvite('HELPER', { id: 'shop7', name: 'Hair Studio', ownerName: 'Kiran' })
  await page.goto('/start')
  await page.getByText('Join Style Point?').locator('..').getByRole('button', { name: 'Decline' }).click()
  await expect(page.getByText('You declined the invitation from Style Point. The owner has been told.')).toBeVisible()
  await expect(page.getByText('Join Style Point?')).toHaveCount(0)

  api.incomingInvites.find((v) => v.view.id === second.id)!.status = 'CANCELLED'
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByText('The owner cancelled this invitation.')).toBeVisible()
  await expect(page.getByText('Join Hair Studio?')).toHaveCount(0)

  // "I work at a salon": no invitation now
  await page.getByRole('button', { name: 'I work at a salon' }).click()
  await page.getByRole('button', { name: "I've been invited, check again" }).click()
  await expect(page.getByText('No invitation for this number yet.')).toBeVisible()

  // A new one arrives: its message (and the push) points at /invites, which opens without a shop
  const third = api.offerInvite('HELPER', { id: 'shop6', name: 'Cut Above' })
  expect(api.inbox[0]).toMatchObject({ type: 'SHOP_INVITE', url: '/invites' })
  await page.goto('/invites')
  await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible()
  await expect(page.getByText('Join Cut Above?')).toBeVisible()
  api.incomingInvites.find((v) => v.view.id === third.id)!.status = 'DECLINED'
  await page.reload()
  await expect(page.getByText('No invitations waiting')).toBeVisible()
})

test('a helper of one salon invited to another must leave first', async ({ page, context, api }) => {
  api.offerInvite('HELPER')
  await atSalon(page, context, api, 'HELPER')
  await expect(page.getByText('Join Style Point?')).toBeVisible()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.getByText('You work in another shop. Leave it first, then accept. You can leave Shine Unisex Salon from More.')).toBeVisible()
})
