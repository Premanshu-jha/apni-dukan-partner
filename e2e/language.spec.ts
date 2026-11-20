import { readFileSync } from 'node:fs'
import { atSalon, expect, test } from './helpers'

const hi = (area: string) => JSON.parse(readFileSync(`src/i18n/hi/${area}.json`, 'utf8')) as Record<string, string>
const te = (area: string) => JSON.parse(readFileSync(`src/i18n/te/${area}.json`, 'utf8')) as Record<string, string>

test('the sign-in screen offers every language in its own script, and the choice stays after a reload', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
  await page.getByRole('textbox').first().fill('98480')
  await page.getByRole('button', { name: 'हिन्दी' }).click()
  await expect(page.getByRole('button', { name: hi('auth').phoneSendCode })).toBeVisible()
  await expect(page.getByRole('textbox').first()).toHaveValue('98480') // what was typed stays
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
  await expect(page.getByText(hi('auth').phoneHint)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: hi('auth').phoneSendCode })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible()
})

test('someone signed in before is offered the languages once; later it is under More', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const offer = page.getByRole('region', { name: 'Use the app in your language' })
  await expect(offer).toBeVisible()
  await offer.getByRole('button', { name: 'Keep English' }).click()
  await expect(offer).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Use the app in your language' })).toBeHidden()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await atSalonProfile(page)
  await page.getByRole('button', { name: 'తెలుగు' }).click()
  await expect(page.getByText(te('language').title, { exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: te('app').navMain })
  await expect(nav.getByRole('link', { name: te('app').tabToday })).toBeVisible() // the tabs follow at once
  await expect(page.getByText(te('language').profileHint)).toBeVisible()
  await expect(page.getByRole('button', { name: 'తెలుగు' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByText('Language', { exact: true })).toBeVisible()
})

async function atSalonProfile(page: import('@playwright/test').Page) {
  await page.goto('/more')
  await expect(page.getByRole('group', { name: 'Choose your language' })).toBeVisible()
}
