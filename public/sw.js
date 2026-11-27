// Service worker: shows the salon's messages the backend sends by Web Push and opens the right screen on tap, and
// shows a small "You're offline" page when the app is opened without a connection.
// One account can also be a customer: a customer message (its url is a customer-app page) opens the day board.
// The backend's payload is {"type","title","body","url"}.
// A new version of this file installs and then waits: the app shows "New version available — Reload", and only that
// button switches over (never in the middle of a walk-in or a booking change).

// Change the name when offline.html, offline.css, offline.js or the icon change, so a new version stores them again
const OFFLINE_CACHE = 'offline-v4'
const OFFLINE_PAGE = '/offline.html'
const OFFLINE_FILES = [OFFLINE_PAGE, '/offline.css', '/offline.js', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_FILES.map((f) => new Request(f, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) => Promise.all(names.filter((n) => n !== OFFLINE_CACHE).map((n) => caches.delete(n)))),
      // Pages load while the worker starts up, not after it
      self.registration.navigationPreload ? self.registration.navigationPreload.enable() : null,
      self.clients.claim(),
    ]),
  )
})

// The app's "Reload" button: this waiting version takes over
self.addEventListener('message', (event) => {
  if (event.data && event.data.kind === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Opening a page: the network as always; without a connection, the offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request))
        } catch {
          return (await caches.match(OFFLINE_PAGE, { cacheName: OFFLINE_CACHE })) || Response.error()
        }
      })(),
    )
    return
  }
  // The offline page's own CSS, script and icon; everything else (the app, the API) goes to the network untouched
  const url = new URL(request.url)
  if (url.origin === self.location.origin && OFFLINE_FILES.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(url.pathname, { cacheName: OFFLINE_CACHE })))
  }
})

// The screens a message may open: a copy of MESSAGE_SCREENS and KIRANA_SCREENS in src/lib/messageLinks.ts (sw.test.ts
// checks they agree). A kirana's are sent only when the backend's kirana switch is on, which goes with the app's.
const MESSAGE_SCREENS = ['/subscription', '/setup', '/setup/document', '/setup/address', '/register/photos', '/handover', '/invites']
const KIRANA_SCREENS = ['/kirana/licences', '/register/licences']
const SHOP_NEWS_SCREEN = '/more'
const FIX_SCREEN = '/setup?fix=1'

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Clozest', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Clozest'
  // Tell open app windows, so the bell and the day board refresh at once.
  const tellApp = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windows) => windows.forEach((w) => w.postMessage({ kind: 'push', type: data.type || null })))
  event.waitUntil(
    Promise.all([tellApp, self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      // One notification per message (the same type must not silently replace an earlier booking)
      data: { url: data.url || '/salon/day', type: data.type || null, title: data.title || null },
    })]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/salon/day', self.location.origin)
  // Only open this app's own pages (the same rule as the app: src/lib/messageLinks.ts), never another site or a
  // customer-app page: the day board and the salon's screens, paying, the screens a fix or a licence message points
  // to, hand-over requests, invitations, a support request; shop news on More
  const type = event.notification.data?.type || null
  let path = null
  if (target.origin === self.location.origin) {
    const p = target.pathname
    if (p.startsWith('/salon/')) path = p + target.search + target.hash
    // A fix asked for: marked, so a kirana's opens More (FIX_SCREEN in messageLinks.ts)
    else if (p === '/setup' && !target.search) path = FIX_SCREEN
    else if (MESSAGE_SCREENS.includes(p) || KIRANA_SCREENS.includes(p)) path = p + target.search
    else if (/^\/help\/requests\/[0-9A-Za-z-]{1,64}$/.test(p)) path = p
    else if (p.startsWith('/shops/')) path = SHOP_NEWS_SCREEN
    // A kirana's messages with no screen of their own here: the nearest one (kiranaNearest in messageLinks.ts)
    else if (p === '/kirana/online') path = type === 'KIRANA_PAYOUT_FAILED' ? '/kirana/upi' : '/kirana/licences'
    else if (/^\/kirana\/shop-orders\/[0-9A-Za-z-]{1,64}$/.test(p)) path = '/kirana/bills'
  }
  // No screen here: the start, which says what the message was about (noScreenTarget in messageLinks.ts)
  const title = String(event.notification.data?.title || '').trim().slice(0, 200)
  if (!path) path = title ? '/?message=' + encodeURIComponent(title) : '/'
  const url = self.location.origin + path
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          // navigate() refuses a window this worker doesn't control yet: then open a fresh one
          return w
            .focus()
            .then((f) => f.navigate(url))
            .catch(() => self.clients.openWindow(url))
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
