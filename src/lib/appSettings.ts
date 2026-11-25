import { registerPlugin } from '@capacitor/core'

/**
 * The app's own small Android plugin (android/app/src/main/java/com/clozest/partner/AppSettingsPlugin.java), in one
 * place: Capacitor registers a plugin once. Only the Play Store app calls it (the screens ask isApp() first).
 */
interface AppSettingsPlugin {
  openNotifications(): Promise<void>
  dropPushToken(): Promise<void>
  savePicture(options: { data: string; name: string }): Promise<void>
  nativeInfo(): Promise<NativeInfo>
}

/** This app's native part, as the update check tells the backend (AppSettingsPlugin.nativeInfo). */
export interface NativeInfo {
  /** android/native-level when it was built */
  nativeLevel: number
  /** The CI run that built it (versionCode): the screens it came with are that run's */
  versionCode: number
  /** A test APK (debug build), not the Play Store's */
  debug: boolean
  /** Built with the public key screen updates must be signed with: without it, none are downloaded */
  updatesSigned: boolean
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
