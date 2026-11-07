import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { MockApi, type Role } from './mockApi'

/**
 * Every test gets its own fake backend, attached to the browser context, and fails if the page's
 * Content-Security-Policy blocked anything (`vite preview` sends the production headers, so the tests run under it).
 */
export const test = base.extend<{ api: MockApi; cspClean: void }>({
  api: async ({ context }, use) => {
    const api = new MockApi()
    await api.attach(context)
    await use(api)
  },
  cspClean: [
    async ({ context }, use) => {
      const blocked: string[] = []
      context.on('console', (m) => {
        if (/Content Security Policy/i.test(m.text())) blocked.push(m.text())
      })
      await use()
      expect(blocked, 'blocked by the Content-Security-Policy').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

/** Starts the test already signed in with a complete profile. */
export async function signedIn(context: BrowserContext, api: MockApi) {
  api.user = MockApi.completeUser()
  const session = api.savedSession()
  await context.addInitScript((s) => {
    // Once per test (shared by all its tabs), so a reload or a second tab doesn't put the old token back.
    if (localStorage.getItem('e2e.seeded')) return
    localStorage.setItem('e2e.seeded', '1')
    localStorage.setItem('adp.session', s)
  }, session)
}

/** Signed in as someone in an approved salon, on the day board. */
export async function atSalon(page: Page, context: BrowserContext, api: MockApi, role: Role = 'OWNER') {
  await signedIn(context, api)
  api.approvedSalon(role)
  await page.goto('/salon/day')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
}

/** A tiny real JPEG, for the photo pickers. */
export const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)
