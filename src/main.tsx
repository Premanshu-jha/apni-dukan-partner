import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TestBuildMark } from './components/TestBuildMark'
import { KIRANA_TEST_BUILD } from './lib/config'
import { BrowserRouter } from 'react-router'
import { refreshSession, whenSessionEnds } from './api/client'
import { ApiError, retryDelay } from './api/errors'
import { finishUnregister, listenForAppMessages } from './api/appPush'
import { claimSubscription, dropBrowserSubscription, registerWorker } from './api/push'
import { App } from './app/App'
import { NativeBridge } from './app/NativeBridge'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdatePrompt } from './components/UpdatePrompt'
import { forgetThisPerson } from './features/profile/signOut'
import { refreshSalonWork } from './api/salon'
import { shopKeys } from './api/shop'
import { helpKeys } from './api/help'
import { restoreLanguage } from './i18n'
import { startKiranaTexts } from './i18n/kirana'
import { LanguageToast } from './i18n/LanguageToast'
import { followAccountLanguage } from './lib/accountLanguage'
import { linkTarget, notificationTarget, openInApp } from './lib/appEvents'
import { BUSINESS } from './lib/business'
import { appShellWithoutBridge, isApp } from './lib/platform'
import { UpdateWebView } from './app/UpdateWebView'
import { AppUpdateGate } from './app/AppUpdate'
import { startAppUpdates, switchScreensAtStart } from './lib/appUpdates'
import { App as CapApp } from '@capacitor/app'
import { followOtherTabs, useSession } from './store/session'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './index.css'

const queryClient: QueryClient = new QueryClient({
  // A salon or kirana call saying "no shop", "not a salon" or "not a kirana": this person's shop changed (removed as a helper, sign-in taken
  // away, left on another phone). Check the shop again so the gate sends them to the right place.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.queryKey[0] === 'shop') return
      if (error instanceof ApiError && (error.code === 'NO_SHOP' || error.code === 'NOT_A_SALON' || error.code === 'NOT_A_KIRANA')) {
        void queryClient.invalidateQueries({ queryKey: ['shop'] })
      }
      // 403 SHOP_REQUIRED (a file link): the token names no shop, or one the database no longer agrees with (taken
      // over, closed, removed). Renew the sign-in once and read again; the shop gate follows if the shop changed.
      if (error instanceof ApiError && error.code === 'SHOP_REQUIRED') void renewForShop(query.queryKey)
    },
  }),
  defaultOptions: {
    queries: {
      // Retry network blips, never answers the backend meant (a 4xx is final).
      retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
      // Waits as long as the backend's Retry-After asks (SERVICE_BUSY), else 1 s, 2 s
      retryDelay,
      refetchOnWindowFocus: true,
      // Try even when the phone says it is offline: a failed try shows "you're offline" (and the board keeps what
      // it had, with a note), instead of waiting silently with old data or a spinner that never ends.
      networkMode: 'always',
    },
    mutations: { networkMode: 'always' },
  },
})

/** Query keys already re-read once after a renewal for SHOP_REQUIRED: never a loop. */
const renewedFor = new Set<string>()
async function renewForShop(key: readonly unknown[]) {
  const id = JSON.stringify(key)
  if (renewedFor.has(id)) return
  renewedFor.add(id)
  if (await refreshSession()) {
    void queryClient.invalidateQueries({ queryKey: shopKeys.mine })
    void queryClient.invalidateQueries({ queryKey: key, exact: true })
  }
  setTimeout(() => renewedFor.delete(id), 60_000)
}

// The backend ended the session (expired, signed out everywhere, account deleted elsewhere): tidy this browser.
whenSessionEnds(() => {
  void dropBrowserSubscription()
  forgetThisPerson(queryClient)
})

// Each new sign-in claims this browser's notification address for the person now signed in.
useSession.subscribe((now, before) => {
  if (now.status === 'signedIn' && before.status !== 'signedIn') void claimSubscription()
})

followOtherTabs(() => forgetThisPerson(queryClient))

/** Start-up: pick up a saved session by swapping its refresh token for a fresh access token. */
async function start() {
  const session = useSession.getState()
  session.restore()
  if (useSession.getState().status === 'starting') {
    const ok = await refreshSession()
    // A network blip at start keeps the saved user; the next call tries the refresh again.
    if (!ok && useSession.getState().refreshToken) useSession.setState({ status: 'signedIn' })
  }
  void registerWorker()
  // A message arrived while the app is open (the website: from the service worker; the Play Store app: from Firebase)
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent<{ kind?: string; type?: string | null }>) => {
    if (e.data?.kind !== 'push') return
    refreshForMessage(e.data.type ?? '')
  })
  if (isApp()) {
    // Which screens to use from the next start, and whether this app is too old (lib/appUpdates.ts)
    startAppUpdates()
    // A sign-out that couldn't tell Firebase (offline) finishes now
    void finishUnregister()
    // A tap on a notification opens its screen (by the service worker's rule); a link to the website opens in the app
    listenForAppMessages(
      (m) => refreshForMessage(m.type),
      (m) => openInApp(notificationTarget(m.url, m.type, m.title)),
    )
    void CapApp.addListener('appUrlOpen', ({ url }) => {
      const path = linkTarget(url, new URL(BUSINESS.website).host)
      if (path) openInApp(path)
    })
  }
}

/**
 * A message arrived while the app is open: refresh the bell, the day and the shop it may be about.
 * Only what the message is about: a booking (SALON_*) → the day in view and one delta of the coming-up list;
 * shop news (SHOP_*) → the shop and hand-over requests; support's reply (PARTNERHELP_*) → My requests (one read,
 * shared by Help's dot). Never every page of every list.
 */
function refreshForMessage(type: string) {
  void queryClient.invalidateQueries({ queryKey: ['inbox'] })
  // Support replied (PARTNERHELP_*): My requests, so Help's dot shows on a counter phone left open all day; that
  // one list only (the day and the shop aren't what it is about)
  if (type.startsWith('PARTNERHELP_')) {
    void queryClient.invalidateQueries({ queryKey: helpKeys.mine, exact: true })
    return
  }
  if (!type.startsWith('SHOP_')) refreshSalonWork(queryClient)
  if (!type.startsWith('SALON_')) {
    void queryClient.invalidateQueries({ queryKey: shopKeys.mine, exact: true })
    void queryClient.invalidateQueries({ queryKey: shopKeys.incoming })
  }
}

// With the kirana switch on, the kiranas' words too (their own downloads; first, so a language comes with them)
startKiranaTexts()
// The language chosen on this phone before (shown at once from the texts kept on the phone)
void restoreLanguage()
// Then each account's own language, saved on the account too
followAccountLanguage()
if (appShellWithoutBridge()) {
  // The Play Store app on a too-old Android System WebView: only the screen asking for its update
  createRoot(document.getElementById('root')!).render(<UpdateWebView />)
} else {
  // The Play Store app first switches to the screens it downloaded last time, if any (it reloads into them, so
  // nothing else starts); the website starts at once
  void switchScreensAtStart().then((reloading) => {
    if (reloading) return
    void start()
    createRoot(document.getElementById('root')!).render(<Root />)
  })
}

function Root() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary>
            <AppUpdateGate>
              <App />
            </AppUpdateGate>
          </ErrorBoundary>
          <UpdatePrompt />
          <NativeBridge />
          <LanguageToast />
          <TestBuildMark on={KIRANA_TEST_BUILD} />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  )
}
