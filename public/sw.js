// Service worker: shows the salon's messages the backend sends by Web Push and opens the right screen on tap.
// One account can also be a customer: a customer message (its url is a customer-app page) opens the day board.
// The backend's payload is {"type","title","body","url"}.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Apni Dukan', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Apni Dukan'
  // Tell open app windows, so the bell and the day board refresh at once.
  const tellApp = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windows) => windows.forEach((w) => w.postMessage({ kind: 'push', type: data.type || null })))
  event.waitUntil(
    Promise.all([tellApp, self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: data.type || undefined,
      data: { url: data.url || '/salon/day' },
    })]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/salon/day', self.location.origin)
  // Only open this app's own pages (the day board, shop news), never another site or a customer-app page.
  const ours = target.origin === self.location.origin && (target.pathname.startsWith('/salon/') || target.pathname.startsWith('/shops/'))
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
