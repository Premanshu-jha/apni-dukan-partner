import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Play Store app: this same website inside an Android app (Capacitor). `npm run android` builds the website for
 * the app (APP_BUILD=true, see vite.config.ts) and copies it into android/. Behaviour that differs between the app
 * and the website asks isApp() (src/lib/platform.ts).
 */
const config: CapacitorConfig = {
  appId: 'com.clozest.partner',
  appName: 'Clozest Partner',
  webDir: 'dist',
  // Marks the app's web view (src/lib/platform.ts appShellWithoutBridge): on a phone whose Android System WebView is
  // too old for Capacitor's start-up, the page knows it is the app and asks for that update, instead of running as
  // the website
  appendUserAgent: 'ClozestAndroidApp',
  server: {
    // The app's pages load from its own files under the website's own address, so the backend's CORS list, the
    // Turnstile widget and Razorpay's website check all see partner.clozest.in, as on the website (the backend
    // refuses "localhost" in production). A link to partner.clozest.in inside the app stays in the app.
    hostname: 'partner.clozest.in',
    androidScheme: 'https',
    // Razorpay's checkout (paying in the app) may move the page to Razorpay's own pages: they stay in the app
    // instead of opening the browser. Every other site still opens in the browser.
    allowNavigation: ['api.razorpay.com', 'checkout.razorpay.com'],
  },
  android: {
    // The app's dark background behind the system bars and while it starts
    backgroundColor: '#0b0f26',
  },
  plugins: {
    SystemBars: {
      // Light icons on the dark bars; the app is kept below the status bar (index.html has no viewport-fit=cover in
      // the app's build)
      style: 'DARK',
      insetsHandling: 'css',
    },
    PushNotifications: {
      // Android shows a message itself only while the app is in the background; open, the app refreshes instead
      presentationOptions: [],
    },
    // Screen updates (src/lib/appUpdates.ts, "App updates" in the README): the app asks our backend itself, never
    // Capgo's cloud, and sends nothing anywhere else (no stats). A bundle is installed only if it was signed with our
    // private key (CI's secret); the public key comes from the GitHub variable CAPGO_PUBLIC_KEY when the app is built.
    // Without it the app downloads no screen updates at all.
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      publicKey: process.env.CAPGO_PUBLIC_KEY?.trim() || undefined,
      // New screens that don't start (notifyAppReady not called within 10 s) go back to the previous ones by themselves
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      // A new app from the Play Store starts with its own screens (it may be newer than any downloaded)
      resetWhenUpdate: true,
      shakeMenu: false,
      allowShakeChannelSelector: false,
      allowPreview: false,
    },
  },
}

export default config
