import { create } from 'zustand'
import type { Tokens, User } from '../api/types'
import { storage } from '../lib/storage'

const KEY = 'adp.session'

interface Saved {
  refreshToken: string
  user: User
}

export type SessionStatus = 'starting' | 'signedOut' | 'signedIn'

interface SessionState {
  status: SessionStatus
  user: User | null
  /** Kept in memory only; a reload gets a new one from the refresh token. */
  accessToken: string | null
  refreshToken: string | null
  /** True after a sign-out in this tab, so the page they were on isn't kept for the next person's sign-in. */
  endedHere: boolean
  /** Goes up on every sign-out, so a refresh that finishes afterwards can tell it is too late. */
  generation: number
  signIn: (tokens: Tokens) => void
  setUser: (user: User) => void
  signOut: () => void
  /** Called once at start-up: signed out if nothing was saved, otherwise waits for the first refresh. */
  restore: () => void
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'starting',
  user: null,
  accessToken: null,
  refreshToken: null,
  endedHere: false,
  generation: 0,

  signIn: (tokens) => {
    storage.setJson(KEY, { refreshToken: tokens.refreshToken, user: tokens.user } satisfies Saved)
    set({
      status: 'signedIn',
      user: tokens.user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      endedHere: false,
    })
  },

  setUser: (user) => {
    const { refreshToken } = get()
    if (refreshToken) storage.setJson(KEY, { refreshToken, user } satisfies Saved)
    set({ user })
  },

  signOut: () => {
    storage.remove(KEY)
    set((s) => ({
      status: 'signedOut',
      user: null,
      accessToken: null,
      refreshToken: null,
      endedHere: true,
      generation: s.generation + 1,
    }))
  },

  restore: () => {
    const saved = storage.getJson<Saved>(KEY)
    if (!saved?.refreshToken) {
      set({ status: 'signedOut' })
      return
    }
    // Still 'starting' until the app's first refresh succeeds or fails.
    set({ user: saved.user, refreshToken: saved.refreshToken })
  },
}))

/**
 * The refresh token saved for this browser. Every tab shares it: when one tab swaps it for a new one, the others
 * must use the new one, or the backend sees the old one come back and signs the person out everywhere.
 */
export function savedRefreshToken(): string | null {
  return storage.getJson<Saved>(KEY)?.refreshToken ?? null
}

/** Another tab signed in, refreshed or signed out: follow it. */
export function followOtherTabs() {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    const saved = e.newValue ? (JSON.parse(e.newValue) as Saved) : null
    const state = useSession.getState()
    if (!saved) {
      if (state.status === 'signedIn') {
        useSession.setState((s) => ({
          status: 'signedOut',
          user: null,
          accessToken: null,
          refreshToken: null,
          endedHere: true,
          generation: s.generation + 1,
        }))
      }
      return
    }
    // The other tab's access token isn't shared; the next call here refreshes with the newest refresh token.
    useSession.setState({ refreshToken: saved.refreshToken, user: saved.user, accessToken: null, status: 'signedIn' })
  })
}

/** What the person still has to give before they can use the app. Email first, name last. */
export function missingSteps(user: User | null): Array<'email' | 'name'> {
  if (!user) return []
  const missing: Array<'email' | 'name'> = []
  if (!user.email || !user.emailVerified) missing.push('email')
  if (!user.name || user.name.trim().length < 2) missing.push('name')
  return missing
}
