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

/**
 * Starts the test already signed in with a complete profile. `registering`: what "What do you run?" was answered
 * with on this phone (a salon unless said otherwise, as the salon tests start at step 1; null: not answered yet).
 */
export async function signedIn(
  context: BrowserContext,
  api: MockApi,
  registering: 'SALON' | 'KIRANA' | null = 'SALON',
  /** "Before you start" already answered "I'm at my shop" (the tests that start at step 1); false: not yet. */
  ready = registering !== null,
) {
  api.user = MockApi.completeUser()
  const session = api.savedSession()
  await context.addInitScript(([s, kind, userId, atShop]) => {
    // Once per test (shared by all its tabs), so a reload or a second tab doesn't put the old token back.
    if (localStorage.getItem('e2e.seeded')) return
    localStorage.setItem('e2e.seeded', '1')
    localStorage.setItem('adp.session', s as string)
    if (kind) localStorage.setItem('adp.registerKind', JSON.stringify({ userId, kind }))
    if (atShop) localStorage.setItem('adp.registerReady', JSON.stringify({ userId }))
  }, [session, registering, api.user.id, ready] as const)
}

/**
 * A language already chosen on this phone (English), so the language offer at the top of the tabs isn't open: what a
 * returning person sees. Without it, the offer is the first thing on Today and the guide's cards wait for it.
 */
export async function languageKept(context: BrowserContext) {
  await context.addInitScript(() => {
    if (!localStorage.getItem('language')) localStorage.setItem('language', 'en')
  })
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

/**
 * The browser reads a picked video's length from its file; the tests' videos are only a header, so the length is
 * stubbed: any video given a blob: address reports `seconds` (window.__videoSeconds, changeable mid-test).
 */
export async function stubVideoLength(context: BrowserContext, seconds = 30) {
  await context.addInitScript((s) => {
    const w = window as unknown as { __videoSeconds: number }
    w.__videoSeconds = s
    const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      get() {
        return src.get!.call(this)
      },
      set(value: string) {
        if (typeof value === 'string' && value.startsWith('blob:')) {
          Object.defineProperty(this, 'duration', { configurable: true, get: () => w.__videoSeconds })
          // NaN: a file whose length can't be read (the browser gives up with an error)
          const event = Number.isNaN(w.__videoSeconds) ? 'error' : 'loadedmetadata'
          setTimeout(() => (this as HTMLMediaElement).dispatchEvent(new Event(event)), 0)
          return
        }
        src.set!.call(this, value)
      },
    })
  }, seconds)
}

/** A video file's first bytes as a phone's MP4 starts (an "ftyp" box); the rest doesn't matter to the tests. */
export function fakeMp4(size = 4096): Buffer {
  const bytes = Buffer.alloc(size, 7)
  bytes.writeUInt32BE(0x20, 0)
  bytes.write('ftypisom', 4, 'latin1')
  return bytes
}

/**
 * A stand-in for Razorpay's checkout (window.Razorpay, which the app uses before loading the real script): a dialog
 * showing the name, description and colour it was opened with, and buttons to approve (signs the answer as the fake
 * backend expects: "sig:<payment>|<subscription>"), make the payment fail, or close it. The options it was opened
 * with are kept in window.__rzpOpened.
 */
export async function fakeRazorpay(context: BrowserContext) {
  await context.addInitScript(() => {
    type Options = Record<string, unknown> & { subscription_id: string; handler: (a: unknown) => void; modal: { ondismiss: () => void }; theme: { color: string } }
    const w = window as unknown as { Razorpay: unknown; __rzpOpened: Options[] }
    w.__rzpOpened = []
    w.Razorpay = class {
      private failed: Array<(e: unknown) => void> = []
      constructor(private o: Options) {}
      on(event: string, fn: (e: unknown) => void) {
        if (event === 'payment.failed') this.failed.push(fn)
      }
      open() {
        w.__rzpOpened.push(this.o)
        const box = document.createElement('div')
        box.setAttribute('role', 'dialog')
        box.setAttribute('aria-label', 'Razorpay checkout')
        box.dataset.color = this.o.theme.color
        const title = document.createElement('p')
        title.textContent = `${String(this.o.name)} · ${String(this.o.description)}`
        box.appendChild(title)
        const button = (label: string, fn: () => void) => {
          const b = document.createElement('button')
          b.textContent = label
          b.onclick = fn
          box.appendChild(b)
        }
        button('Approve with UPI PIN', () => {
          box.remove()
          this.o.handler({ razorpay_payment_id: 'pay_e2e', razorpay_subscription_id: this.o.subscription_id, razorpay_signature: `sig:pay_e2e|${this.o.subscription_id}` })
        })
        button('Make it fail', () => this.failed.forEach((fn) => fn({ error: { description: 'Your bank declined it.' } })))
        button('Close checkout', () => {
          box.remove()
          this.o.modal.ondismiss()
        })
        document.body.appendChild(box)
      }
    }
  })
}
