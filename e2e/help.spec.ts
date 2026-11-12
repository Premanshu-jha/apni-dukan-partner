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
  expect(api.tickets).toEqual([{ app: 'PARTNER', subject: 'Payout', message: 'My payout for last week has not arrived yet.' }])
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
