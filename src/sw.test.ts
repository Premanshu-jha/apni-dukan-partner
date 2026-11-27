import source from '../public/sw.js?raw'
import { FIX_SCREEN, KIRANA_SCREENS, MESSAGE_SCREENS, SHOP_NEWS_SCREEN, messageScreen, noScreenTarget } from './lib/messageLinks'

/**
 * public/sw.js, run against a stand-in for the browser's service worker globals: notifications, the offline page
 * and the wait for "Reload".
 */
const ORIGIN = 'https://app.test'

type Handler = (event: Record<string, unknown>) => void

function loadWorker() {
  const handlers: Record<string, Handler> = {}
  const stored = new Map<string, Response>()
  const self = {
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: vi.fn(),
    location: { origin: ORIGIN },
    registration: { showNotification: vi.fn(async () => {}), navigationPreload: { enable: vi.fn(async () => {}) } },
    clients: { matchAll: vi.fn(async () => []), claim: vi.fn(async () => {}), openWindow: vi.fn() },
  }
  const caches = {
    open: vi.fn(async (_name: string) => ({
      addAll: async (requests: Array<{ url: string }>) => {
        for (const r of requests) stored.set(new URL(r.url).pathname, new Response(`kept ${new URL(r.url).pathname}`))
      },
    })),
    keys: async () => ['offline-v1', 'offline-v2', 'offline-v3', 'offline-v4'],
    delete: vi.fn(async () => true),
    match: async (path: string) => stored.get(path)?.clone(),
  }
  class WorkerRequest {
    url: string
    constructor(url: string) {
      this.url = new URL(url, ORIGIN).href
    }
  }
  const network = vi.fn<(request: unknown) => Promise<Response>>()
  new Function('self', 'caches', 'fetch', 'Request', source)(self, caches, network, WorkerRequest)

  /** Fires an event; resolves with what it passed to waitUntil / respondWith. */
  async function fire(type: string, event: Record<string, unknown> = {}) {
    const waits: Array<Promise<unknown>> = []
    let response: Promise<Response> | undefined
    handlers[type]({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (response = p) })
    await Promise.all(waits)
    return { response }
  }
  return { self, caches, network, fire }
}

describe('service worker', () => {
  it('a tap opens this app\'s pages only: the day board, the start for shop news, the hand-over requests', async () => {
    const { self, fire } = loadWorker()
    const tap = (url: string) => fire('notificationclick', { notification: { close: vi.fn(), data: { url } } })
    await tap('/handover')
    await tap('/shops/me')
    await tap('https://evil.example/handover')
    await tap('/invites')
    await tap('/help/requests/0f8b2a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b')
    expect(self.clients.openWindow.mock.calls.map(([u]) => u)).toEqual([
      `${ORIGIN}/handover`,
      `${ORIGIN}/more`,
      `${ORIGIN}/`,
      `${ORIGIN}/invites`,
      `${ORIGIN}/help/requests/0f8b2a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b`,
    ])
  })

  it('two messages of the same type are two notifications (no tag replaces the first)', async () => {
    const { self, fire } = loadWorker()
    const booking = { type: 'SALON_NEW_BOOKING', title: 'New booking, 4:30 PM', body: 'Riya booked Haircut', url: '/salon/day?date=2026-11-08' }
    await fire('push', { data: { json: () => booking } })
    await fire('push', { data: { json: () => ({ ...booking, url: '/salon/day?date=2026-11-09' }) } })
    const shown = self.registration.showNotification.mock.calls as unknown as Array<[string, Record<string, unknown>]>
    expect(shown).toHaveLength(2)
    for (const [, options] of shown) expect(options).not.toHaveProperty('tag')
    expect(shown.map(([, o]) => (o.data as { url: string }).url)).toEqual(['/salon/day?date=2026-11-08', '/salon/day?date=2026-11-09'])
  })

  it('installs without taking over; only the app\'s "Reload" makes it skip waiting', async () => {
    const { self, fire } = loadWorker()
    await fire('install')
    expect(self.skipWaiting).not.toHaveBeenCalled()
    await fire('message', { data: { kind: 'something else' } })
    expect(self.skipWaiting).not.toHaveBeenCalled()
    await fire('message', { data: { kind: 'skip-waiting' } })
    expect(self.skipWaiting).toHaveBeenCalledOnce()
  })

  it('installing stores the offline page, its CSS, its script (its words in the saved language) and the icon in the new offline-v4 store', async () => {
    const { caches, fire } = loadWorker()
    await fire('install')
    expect(caches.open).toHaveBeenCalledWith('offline-v4')
    for (const file of ['/offline.html', '/offline.css', '/offline.js', '/icon.svg']) expect(await caches.match(file), file).toBeDefined()
  })

  it('on activating, drops older offline copies and takes control', async () => {
    const { self, caches, fire } = loadWorker()
    await fire('activate')
    expect(caches.delete).toHaveBeenCalledWith('offline-v1')
    expect(caches.delete).toHaveBeenCalledWith('offline-v2')
    expect(caches.delete).toHaveBeenCalledWith('offline-v3')
    expect(caches.delete).not.toHaveBeenCalledWith('offline-v4')
    expect(self.clients.claim).toHaveBeenCalled()
  })

  it('opening a page without a connection shows the offline page', async () => {
    const { network, fire } = loadWorker()
    await fire('install')
    network.mockRejectedValue(new TypeError('Failed to fetch'))
    const { response } = await fire('fetch', {
      request: { mode: 'navigate', url: `${ORIGIN}/salon/day` },
      preloadResponse: Promise.resolve(undefined),
    })
    expect(await (await response!).text()).toBe('kept /offline.html')
  })

  it('opening a page with a connection gets the page from the network (the preloaded answer first)', async () => {
    const { network, fire } = loadWorker()
    await fire('install')
    const preloaded = await fire('fetch', {
      request: { mode: 'navigate', url: `${ORIGIN}/` },
      preloadResponse: Promise.resolve(new Response('the app, preloaded')),
    })
    expect(await (await preloaded.response!).text()).toBe('the app, preloaded')
    network.mockResolvedValue(new Response('the app'))
    const fetched = await fire('fetch', { request: { mode: 'navigate', url: `${ORIGIN}/` }, preloadResponse: Promise.resolve(undefined) })
    expect(await (await fetched.response!).text()).toBe('the app')
  })

  it('leaves API calls and the app\'s own files to the network; the offline page\'s CSS comes from its copy offline', async () => {
    const { network, fire } = loadWorker()
    await fire('install')
    const api = await fire('fetch', { request: { mode: 'cors', url: 'https://api.example.com/api/v1/salon/day' } })
    expect(api.response).toBeUndefined()
    const asset = await fire('fetch', { request: { mode: 'no-cors', url: `${ORIGIN}/assets/index-abc.js` } })
    expect(asset.response).toBeUndefined()
    network.mockRejectedValue(new TypeError('Failed to fetch'))
    const css = await fire('fetch', { request: { mode: 'no-cors', url: `${ORIGIN}/offline.css` } })
    expect(await (await css.response!).text()).toBe('kept /offline.css')
  })
})

describe('the screens a tapped message opens', () => {
  it('pay, setup, licence and photos messages open their screens; the list is the app\'s own (lib/messageLinks.ts)', async () => {
    const { self, fire } = loadWorker()
    const tap = (url: string) => fire('notificationclick', { notification: { close: vi.fn(), data: { url } } })
    for (const url of MESSAGE_SCREENS) await tap(url)
    await tap('/subscription?from=push')
    await tap('/setup/staff')
    expect(self.clients.openWindow.mock.calls.map(([u]) => u)).toEqual([
      ...MESSAGE_SCREENS.map((p) => `${ORIGIN}${messageScreen(p)}`),
      `${ORIGIN}/subscription?from=push`,
      `${ORIGIN}/`,
    ])
    // The same rule as Messages and the Play Store app (the kirana switch on: kiranas' messages are only sent then)
    const typed = { url: '/kirana/online', type: 'KIRANA_PAYOUT_FAILED' }
    for (const m of [...MESSAGE_SCREENS, ...KIRANA_SCREENS, '/shops/me', '/salon/day?date=2026-11-27', '/kirana/online', '/kirana/shop-orders/o1', typed]) {
      const { url, type } = typeof m === 'string' ? { url: m, type: null } : m
      self.clients.openWindow.mockClear()
      await fire('notificationclick', { notification: { close: vi.fn(), data: { url, type } } })
      expect(self.clients.openWindow.mock.calls[0][0], url).toBe(ORIGIN + messageScreen(url, type, true))
    }
  })

  it('a message with no screen opens the start, which says what it was about', async () => {
    const { self, fire } = loadWorker()
    await fire('push', { data: { json: () => ({ type: 'NEW_KIND', title: 'A new kind of message', body: '…', url: '/somewhere' }) } })
    const [, options] = (self.registration.showNotification.mock.calls as unknown as Array<[string, { data: unknown }]>)[0]
    await fire('notificationclick', { notification: { close: vi.fn(), data: options.data } })
    expect(self.clients.openWindow.mock.calls[0][0]).toBe(`${ORIGIN}${noScreenTarget('A new kind of message')}`)
  })

  it('sw.js keeps the same list as the app', () => {
    const copy = source.match(/const MESSAGE_SCREENS = (\[[^\]]*\])/)![1].replace(/'/g, '"')
    expect(JSON.parse(copy)).toEqual([...MESSAGE_SCREENS])
    const kirana = source.match(/const KIRANA_SCREENS = (\[[^\]]*\])/)![1].replace(/'/g, '"')
    expect(JSON.parse(kirana)).toEqual([...KIRANA_SCREENS])
    expect(source).toContain(`const SHOP_NEWS_SCREEN = '${SHOP_NEWS_SCREEN}'`)
    expect(source).toContain(`const FIX_SCREEN = '${FIX_SCREEN}'`)
  })
})
