import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { refreshSession, whenSessionEnds } from './api/client'
import { ApiError } from './api/errors'
import { claimSubscription, dropBrowserSubscription, registerWorker } from './api/push'
import { App } from './app/App'
import { forgetReturn } from './features/auth/flow'
import { followOtherTabs, useSession } from './store/session'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry network blips, never answers the backend meant (a 4xx is final).
      retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
      refetchOnWindowFocus: true,
    },
  },
})

// The backend ended the session (expired, signed out everywhere, account deleted elsewhere): tidy this browser.
whenSessionEnds(() => {
  void dropBrowserSubscription()
  forgetReturn()
  queryClient.clear()
})

// Each new sign-in claims this browser's notification address for the person now signed in.
useSession.subscribe((now, before) => {
  if (now.status === 'signedIn' && before.status !== 'signedIn') void claimSubscription()
})

followOtherTabs()

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
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent<{ kind?: string }>) => {
    if (e.data?.kind !== 'push') return
    void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    void queryClient.invalidateQueries({ queryKey: ['salon'] })
    void queryClient.invalidateQueries({ queryKey: ['shop'] })
  })
}

void start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
