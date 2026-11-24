import { Capacitor } from '@capacitor/core'

/**
 * Whether this is the Play Store app (the same app inside Capacitor's Android shell) rather than the website in a
 * browser. Everything that differs between the two asks this one question: notifications (FCM in the app, Web Push
 * on the website), the service worker and its "New version" prompt (website only: the app updates through the Play
 * Store), paying the subscription (website only, Google Play's rules), sharing (Android's share sheet in the app) and
 * the phone's Back button (app only).
 */
export function isApp(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * The Play Store app's web view, but Capacitor's bridge didn't start: the phone's Android System WebView is too old
 * to add it before the page's own scripts, and the app's page rules (no inline scripts) refuse it added later. The
 * app then asks for that update rather than run as the website (Back, notifications and paying would be wrong).
 */
export function appShellWithoutBridge(): boolean {
  return !isApp() && typeof navigator !== 'undefined' && navigator.userAgent.includes('ClozestAndroidApp')
}
