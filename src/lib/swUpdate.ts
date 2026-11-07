import { useSyncExternalStore } from 'react'

/**
 * A new version of the app: its service worker installs and then waits (sw.js never switches over by itself), and
 * the app offers "New version available — Reload". Reload lets it take over, then loads the page again with it.
 */

let waiting: ServiceWorker | null = null
const listeners = new Set<() => void>()
const watched = new WeakSet<ServiceWorkerRegistration>()

function offer(worker: ServiceWorker | null) {
  // The very first install has nothing to replace (no worker controls the page yet): nothing to offer
  if (!worker || !navigator.serviceWorker.controller) return
  // Replaced by a newer version meanwhile: that one is offered when it is ready
  worker.addEventListener('statechange', () => {
    if (worker.state === 'redundant' && waiting === worker) set(null)
  })
  set(worker)
}

function set(worker: ServiceWorker | null) {
  waiting = worker
  listeners.forEach((l) => l())
}

/** Watches the app's service worker registration for a new version. Called each time it is registered. */
export function watchForUpdates(reg: ServiceWorkerRegistration) {
  if (watched.has(reg)) return
  watched.add(reg)
  offer(reg.waiting)
  reg.addEventListener('updatefound', () => {
    const next = reg.installing
    next?.addEventListener('statechange', () => {
      if (next.state === 'installed') offer(next)
    })
  })
  // The app stays open for days on a phone: look for a new version whenever it comes back to the screen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {})
  })
}

let reloading = false

/** "Reload": the waiting version takes over (sw.js skipWaiting), then the page loads again under it. */
export function reloadToUpdate() {
  const worker = waiting
  if (!worker) return
  // Another tab already let it take over: just load the page again
  if (worker.state === 'activated') {
    window.location.reload()
    return
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
  worker.postMessage({ kind: 'skip-waiting' })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True while a new version waits for "Reload". */
export function useUpdateWaiting(): boolean {
  return useSyncExternalStore(subscribe, () => waiting !== null)
}

/** For tests: forget the offer. */
export function resetUpdateOffer() {
  waiting = null
  reloading = false
}
