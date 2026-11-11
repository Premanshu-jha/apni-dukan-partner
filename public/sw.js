// Service worker: shows the salon's messages the backend sends by Web Push and opens the right screen on tap, and
// shows a small "You're offline" page when the app is opened without a connection.
// One account can also be a customer: a customer message (its url is a customer-app page) opens the day board.
// The backend's payload is {"type","title","body","url"}.
// A new version of this file installs and then waits: the app shows "New version available — Reload", and only that
// button switches over (never in the middle of a walk-in or a booking change).

// Change the name when offline.html, offline.css or the icon change, so a new version stores them again
const OFFLINE_CACHE = 'offline-v2'
const OFFLINE_PAGE = '/offline.html'
const OFFLINE_FILES = [OFFLINE_PAGE, '/offline.css', '/icon.svg']

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
  // The offline page's own CSS and icon; everything else (the app, the API) goes to the network untouched
  const url = new URL(request.url)
  if (url.origin === self.location.origin && OFFLINE_FILES.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(url.pathname, { cacheName: OFFLINE_CACHE })))
  }
})

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
      data: { url: data.url || '/salon/day' },
    })]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/salon/day', self.location.origin)
  // Only open this app's own pages (the day board, shop news, hand-over requests, invitations), never another site or a customer-app page.
  const ours =
    target.origin === self.location.origin &&
    (target.pathname.startsWith('/salon/') || target.pathname.startsWith('/shops/') || target.pathname === '/handover' || target.pathname === '/invites')
  const url = ours ? (target.pathname.startsWith('/shops/') ? self.location.origin + '/' : target.href) : self.location.origin + '/salon/day'
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
