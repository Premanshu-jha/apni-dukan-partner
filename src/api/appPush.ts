import { PushNotifications, type ActionPerformed, type PushNotificationSchema, type Token } from '@capacitor/push-notifications'
import { dropPushToken } from '../lib/appSettings'
import { storage } from '../lib/storage'
import { api } from './client'
import type { PushResult } from './push'

/**
 * Notifications in the Play Store app, through Firebase Cloud Messaging (an Android app can't use Web Push). The
 * website keeps Web Push (push.ts, which sends every call here when isApp()). The backend sends the same messages
 * to both: `POST /me/push-devices {token}` saves this phone, `DELETE` removes it.
 *
 * The token saved for this phone is kept in storage, so "is it on?" needs no call and sign-out knows what to remove.
 */

/** The FCM token this phone last saved with the backend (the switch is On while it is here). */
export const APP_TOKEN = 'adp.appPushToken'
/**
 * Firebase couldn't be told to drop this phone's token at sign-out (offline): tried again at the next start, so the
 * person who signed out gets nothing more on a phone someone else now uses.
 */
export const UNREGISTER_LATER = 'adp.appPushUnregisterLater'

/** The Android channel the messages go to (the backend's FcmSender sends on it); its name shows in Android's settings. */
export const CHANNEL = 'clozest'

/** Built with Firebase's app file (google-services.json): without it, asking Firebase for a token would crash the app. */
export function appPushBuilt(): boolean {
  return import.meta.env.VITE_APP_PUSH === 'true'
}

/** The token Firebase gives this phone after register(); rejects on Firebase's error or after 20 s. */
function nextToken(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const handles: Promise<{ remove: () => Promise<void> }>[] = []
    const done = () => {
      clearTimeout(timer)
      for (const h of handles) void h.then((x) => x.remove())
    }
    const timer = setTimeout(() => {
      done()
      reject(new Error('push-timeout'))
    }, 20_000)
    handles.push(
      PushNotifications.addListener('registration', (t: Token) => {
        done()
        resolve(t.value)
      }),
    )
    handles.push(
      PushNotifications.addListener('registrationError', () => {
        done()
        reject(new Error('push-registration'))
      }),
    )
    void PushNotifications.register().catch((e: unknown) => {
      done()
      reject(e instanceof Error ? e : new Error('push-registration'))
    })
  })
}

/** Whether the phone allows this app's notifications (Android 13+ asks; older phones always allow). */
async function allowed(): Promise<boolean> {
  try {
    return (await PushNotifications.checkPermissions()).receive === 'granted'
  } catch {
    return false
  }
}

/** On for this phone: a token is saved and Android still allows the notifications. */
export async function appPushOn(): Promise<boolean> {
  if (!appPushBuilt() || !storage.get(APP_TOKEN)) return false
  return allowed()
}

/** Asks Android's permission, gets this phone's token and saves it with the backend. */
export async function turnOnAppPush(): Promise<PushResult> {
  if (!appPushBuilt()) return 'not-configured'
  const { appPush } = await api<{ appPush?: boolean }>('GET', '/api/v1/push/public-key')
  if (!appPush) return 'not-configured'
  let permission = (await PushNotifications.checkPermissions()).receive
  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    permission = (await PushNotifications.requestPermissions()).receive
  }
  if (permission !== 'granted') return 'denied'
  await PushNotifications.createChannel({ id: CHANNEL, name: 'Clozest', importance: 5, vibration: true }).catch(() => {})
  const token = await nextToken()
  await api<void>('POST', '/api/v1/me/push-devices', { body: { token } })
  storage.set(APP_TOKEN, token)
  return 'on'
}

/**
 * Stops notifications on this phone (the switch, and sign-out): the backend forgets the token and Firebase drops it,
 * so nothing more arrives here even if the backend call didn't get through. Never throws.
 */
export async function turnOffAppPush(): Promise<void> {
  const token = storage.get(APP_TOKEN)
  storage.remove(APP_TOKEN)
  if (!token) return
  await api<void>('DELETE', '/api/v1/me/push-devices', { body: { token } }).catch(() => {})
  await unregister()
}

/** Firebase drops this phone's token; if it can't now (offline), the next start tries again. */
async function unregister(): Promise<void> {
  try {
    await dropPushToken()
    storage.remove(UNREGISTER_LATER)
  } catch {
    storage.set(UNREGISTER_LATER, '1')
  }
}

/** At start: a token sign-out couldn't drop is dropped now (unless notifications were turned on again since). */
export async function finishUnregister(): Promise<void> {
  if (!appPushBuilt() || !storage.get(UNREGISTER_LATER)) return
  if (storage.get(APP_TOKEN)) {
    storage.remove(UNREGISTER_LATER)
    return
  }
  await unregister()
}

/** Whether an error from turning notifications on means the phone got no token from Firebase (no Google services). */
export function noTokenError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : ''
  return message === 'push-timeout' || message === 'push-registration'
}

/** Opens Android's notification settings for this app (Notifications.tsx imports it from here). */
export { openNotificationSettings } from '../lib/appSettings'

/**
 * After a sign-in (or at start, signed in): if notifications were on here, save this phone's current token for the
 * person now signed in (Firebase may have renewed it; the backend moves a known token to the caller). Never throws.
 */
export async function claimAppPush(): Promise<void> {
  if (!appPushBuilt() || !storage.get(APP_TOKEN) || !(await allowed())) return
  try {
    const token = await nextToken()
    await api<void>('POST', '/api/v1/me/push-devices', { body: { token } })
    storage.set(APP_TOKEN, token)
  } catch {
    /* best effort: the switch on More shows the real state */
  }
}

/** The session ended without a sign-out call (refused refresh): Firebase drops the token, so nothing more arrives. */
export async function dropAppPush(): Promise<void> {
  storage.remove(APP_TOKEN)
  if (!appPushBuilt()) return
  await unregister()
}

/** Clears this app's notifications from the phone's tray (sign-out: the next person mustn't read them). */
export async function clearAppNotifications(): Promise<void> {
  if (!appPushBuilt()) return
  await PushNotifications.removeAllDeliveredNotifications().catch(() => {})
}

/** What a message carries for the app: its type and the screen a tap opens (the backend's data {type, url}). */
export interface AppMessage {
  type: string
  url: string | null
}

function messageOf(n: PushNotificationSchema): AppMessage {
  const data = (n.data ?? {}) as Record<string, unknown>
  return { type: typeof data.type === 'string' ? data.type : '', url: typeof data.url === 'string' ? data.url : null }
}

/**
 * Listens for messages: `onMessage` for one that arrives while the app is open (Android shows nothing then: the app
 * refreshes what it is about), `onTap` when one is tapped in the tray (the app opens on its screen, also from closed:
 * Capacitor keeps the tap until this listener is added).
 */
export function listenForAppMessages(onMessage: (m: AppMessage) => void, onTap: (m: AppMessage) => void): void {
  if (!appPushBuilt()) return
  void PushNotifications.addListener('pushNotificationReceived', (n: PushNotificationSchema) => onMessage(messageOf(n)))
  void PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) => onTap(messageOf(a.notification)))
}
