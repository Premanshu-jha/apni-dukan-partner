import { registerPlugin } from '@capacitor/core'

/**
 * The app's own small Android plugin (android/app/src/main/java/com/clozest/partner/AppSettingsPlugin.java), in one
 * place: Capacitor registers a plugin once. Only the Play Store app calls it (the screens ask isApp() first).
 */
interface AppSettingsPlugin {
  openNotifications(): Promise<void>
  dropPushToken(): Promise<void>
  savePicture(options: { data: string; name: string }): Promise<void>
}

export const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings')

/** Opens Android's notification settings for this app (turned off there: one tap instead of a menu path). */
export async function openNotificationSettings(): Promise<void> {
  await AppSettings.openNotifications().catch(() => {})
}

/**
 * Firebase forgets this phone's token, waiting for its answer (Capacitor's own unregister answers before Firebase
 * has). Rejects when Firebase couldn't be reached (offline).
 */
export function dropPushToken(): Promise<void> {
  return AppSettings.dropPushToken()
}
