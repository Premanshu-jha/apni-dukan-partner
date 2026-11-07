import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { refreshSession, whenSessionEnds } from './api/client'
import { ApiError, retryDelay } from './api/errors'
import { claimSubscription, dropBrowserSubscription, registerWorker } from './api/push'
import { App } from './app/App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdatePrompt } from './components/UpdatePrompt'
import { forgetThisPerson } from './features/profile/signOut'
import { refreshSalonWork } from './api/salon'
import { shopKeys } from './api/shop'
import { followOtherTabs, useSession } from './store/session'
import './index.css'

const queryClient: QueryClient = new QueryClient({
  // A salon call saying "no shop" or "not a salon": this person's shop changed (removed as a helper, sign-in taken
  // away, left on another phone). Check the shop again so the gate sends them to the right place.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.queryKey[0] === 'shop') return
      if (error instanceof ApiError && (error.code === 'NO_SHOP' || error.code === 'NOT_A_SALON')) {
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
  // A message arrived while the app is open: refresh the bell, the day and the shop it may be about.
  // Only what the message is about: a booking (SALON_*) → the day in view and one delta of the coming-up list;
  // shop news (SHOP_*) → the shop and hand-over requests. Never every page of every list.
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent<{ kind?: string; type?: string | null }>) => {
    if (e.data?.kind !== 'push') return
    void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    const type = e.data.type ?? ''
    if (!type.startsWith('SHOP_')) refreshSalonWork(queryClient)
    if (!type.startsWith('SALON_')) {
      void queryClient.invalidateQueries({ queryKey: shopKeys.mine, exact: true })
      void queryClient.invalidateQueries({ queryKey: shopKeys.incoming })
    }
  })
}

void start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <UpdatePrompt />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
