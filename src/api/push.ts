import { api } from './client'

/** Browser notifications for booking messages, using the backend's VAPID key. */

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iPhone Safari offers notifications only to an app added to the Home Screen. */
export function needsHomeScreen(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone && !pushSupported()
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

/** The current subscription, if notifications are on for this browser. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export type PushResult = 'on' | 'denied' | 'unsupported' | 'not-configured'

/** Asks for permission, subscribes and tells the backend. */
export async function turnOnPush(): Promise<PushResult> {
  if (!pushSupported()) return 'unsupported'
  const { publicKey } = await api<{ publicKey: string | null }>('GET', '/api/v1/push/public-key')
  if (!publicKey) return 'not-configured'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerWorker())
  if (!reg) return 'unsupported'
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  try {
    await api<void>('POST', '/api/v1/me/push-subscriptions', { body: sub.toJSON() })
  } catch (e) {
    // The backend doesn't have it: drop it here too, so the switch never says On for a dead subscription
    await sub.unsubscribe().catch(() => false)
    throw e
  }
  return 'on'
}

/** Stops notifications for this browser (also called before signing out). Never throws. */
export async function turnOffPush(): Promise<void> {
  try {
    const sub = await currentSubscription()
    if (!sub) return
    await api<void>('DELETE', '/api/v1/me/push-subscriptions', { body: { endpoint: sub.endpoint } }).catch(() => {})
    await sub.unsubscribe()
  } catch {
    /* best effort */
  }
}

/**
 * The browser's subscription belongs to whoever was signed in when it was made. After a sign-in, claim it for
 * this person (the backend moves an existing address to the caller), so nobody gets someone else's messages.
 */
export async function claimSubscription(): Promise<void> {
  try {
    const sub = await currentSubscription()
    if (sub) await api<void>('POST', '/api/v1/me/push-subscriptions', { body: sub.toJSON() })
  } catch {
    /* best effort: the switch on Profile shows the real state */
  }
}

/** The session ended without a sign-out call (refused refresh): drop this browser's subscription. Never throws. */
export async function dropBrowserSubscription(): Promise<void> {
  try {
    await (await currentSubscription())?.unsubscribe()
  } catch {
    /* nothing more to do */
  }
}
