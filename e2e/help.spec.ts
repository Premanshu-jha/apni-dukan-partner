import { atSalon, expect, signedIn, test } from './helpers'

test('More → Write to support: the message becomes a ticket, kept while typed, sent once', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More' }).click()
  await expect(page.getByRole('link', { name: 'support@example.com' })).toHaveAttribute('href', 'mailto:support@example.com')
  await page.getByRole('link', { name: 'Write to support' }).click()
  await expect(page.getByRole('heading', { name: 'Need help' })).toBeVisible()
  await page.getByLabel('Your message').fill('help')
  await expect(page.getByText('Tell us a little more (at least 10 characters).')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send to support' })).toBeDisabled()
  await page.getByLabel("What's it about? (optional)").fill('Payout')
  await page.getByLabel('Your message').fill('My payout for last week has not arrived yet.')
  await page.reload()
  await expect(page.getByLabel('Your message')).toHaveValue('My payout for last week has not arrived yet.')
  await page.getByRole('button', { name: 'Send to support' }).dblclick()
  await expect(page.getByRole('heading', { name: 'Sent: ticket CLZ-1001' })).toBeVisible()
  expect(api.tickets.map(({ app, subject, message }) => ({ app, subject, message }))).toEqual([{ app: 'PARTNER', subject: 'Payout', message: 'My payout for last week has not arrived yet.' }])
  await page.goto('/help')
  await expect(page.getByLabel('Your message')).toHaveValue('')   // sent: the draft is gone
})

test('the email stopped being verified elsewhere: Send reads the profile again and goes to the email step, then back', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/help?about=Payout')
  await page.getByLabel('Your message').fill('My payout for last week has not arrived yet.')
  api.user = { ...api.user, emailVerified: false }
  await page.getByRole('button', { name: 'Send to support' }).click()
  await expect(page).toHaveURL(/\/welcome\/email$/)
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page).toHaveURL(/\/help\?about=Payout$/)
  await expect(page.getByLabel('Your message')).toHaveValue('My payout for last week has not arrived yet.')
})

test('a registering owner can reach Need help from every step', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await page.getByRole('link', { name: 'Need help? Write to support' }).click()
  await expect(page.getByRole('heading', { name: 'Need help' })).toBeVisible()
})

test('My requests: from More or Need help; support replies show; adding sends it back; a resolved one opens again', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const t = api.newTicket('PARTNER', 'Payout', 'My payout for last week has not arrived yet.')
  api.supportReplies(t, 'It goes out on Monday. Sorry for the wait.')
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: /My requests/ }).click()
  await expect(page.getByText('We replied')).toBeVisible()
  await page.getByText('Payout').click()
  await expect(page.getByText('It goes out on Monday. Sorry for the wait.')).toBeVisible()
  await expect(page.getByText(/Clozest support · Neha/)).toBeVisible()
  await page.getByLabel('Add to your request').fill('Thanks, got it.')
  await page.getByRole('button', { name: 'Send' }).dblclick()
  await expect(page.getByText('Sent. Our support team will read it and reply.')).toBeVisible()
  expect(t.messages.filter((m) => !m.fromSupport)).toHaveLength(2)

  t.status = 'RESOLVED'
  await page.reload()
  await page.getByLabel('Write again (opens it again)').fill('It did not come on Monday.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('With our support team')).toBeVisible()

  await page.goto('/help')
  await page.getByRole('link', { name: 'Asked before? See My requests and our replies' }).click()
  await expect(page).toHaveURL(/\/help\/requests$/)
})

test('after sending, "See it in My requests"; someone else\'s request is never shown', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/help')
  await page.getByLabel('Your message').fill('The app shows the wrong opening hours.')
  await page.getByRole('button', { name: 'Send to support' }).click()
  await page.getByRole('button', { name: 'See it in My requests' }).click()
  await expect(page.getByText('The app shows the wrong opening hours.')).toBeVisible()
  const other = api.addOthersTicket()
  await page.goto(`/help/requests/${other.id}`)
  await expect(page.getByText('Request not found')).toBeVisible()
})

test('the arrows never go round: after sending, the request ← list ← Home', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/help')
  await page.getByLabel('Your message').fill('The app shows the wrong opening hours.')
  await page.getByRole('button', { name: 'Send to support' }).click()
  await page.getByRole('button', { name: 'See it in My requests' }).click()
  await expect(page).toHaveURL(/\/help\/requests\/t1001$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/help\/requests$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).not.toHaveURL(/\/help/)
})
