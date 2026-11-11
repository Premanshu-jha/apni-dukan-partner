import { deviceName } from '../lib/device'
import { savedRefreshToken, useSession } from '../store/session'
import { ApiError } from './errors'
import type { ErrorBody, Tokens } from './types'

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8080'

interface Options {
  body?: unknown
  /** Send the access token (default true). */
  auth?: boolean
  headers?: Record<string, string>
  signal?: AbortSignal
  /**
   * Keep this read's answer for If-None-Match (default true). False for reads whose address changes every time (a
   * day board delta's `since`): nothing to ask "changed since?" about, and it would only push other answers out.
   */
  keep?: boolean
}

/** One refresh at a time: requests that hit an expired token together share it. */
let refreshing: Promise<boolean> | null = null

/** Called when the backend ends the session (a refused refresh), to tidy up this browser. Set by the app. */
let onSessionEnded: () => void = () => {}
export function whenSessionEnds(fn: () => void) {
  onSessionEnded = fn
}

/** Resolves once any refresh in flight has finished (sign-out waits for it, so it signs out the newest token). */
export function refreshSettled(): Promise<unknown> {
  return refreshing ?? Promise.resolve()
}

/** A call on its way that replaces this session's tokens (changing the phone number), if any. */
let replacing: Promise<unknown> | null = null

/**
 * Runs a call that ends every token of this account and answers a new pair (changing the phone number), then saves
 * the pair. A refresh already on its way finishes first; one refused while this is on its way (its token was just
 * ended by it) waits for the new pair instead of signing the person out. Other tabs pick the new pair up from
 * storage when their refresh is refused the same way.
 */
export async function replacingSession(fn: () => Promise<Tokens>): Promise<Tokens> {
  await refreshSettled()
  const call = fn()
  replacing = call
  try {
    const tokens = await call
    useSession.getState().signIn(tokens)
    return tokens
  } finally {
    if (replacing === call) replacing = null
  }
}

/** Runs fn with a lock shared by all tabs of this app, so two tabs never swap the same refresh token. */
function acrossTabs<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  return locks ? (locks.request('ad-refresh', fn) as Promise<T>) : fn()
}

/** How long a refresh answered 409 TRY_AGAIN waits for the other tab to save its new pair, if it hasn't yet. */
export const NEWER_TOKEN_WAIT_MS = 1000

/** The refresh token saved for this browser if it is newer than `used`, looking twice (now, then after a moment). */
async function newerSavedToken(used: string): Promise<string | null> {
  for (const wait of [0, NEWER_TOKEN_WAIT_MS]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    const saved = savedRefreshToken()
    if (saved && saved !== used) return saved
  }
  return null
}

/** Swap the refresh token for a new pair. false when the session is over (the person must sign in again). */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = acrossTabs(async () => {
    const started = useSession.getState().generation
    // Read the token only now, inside the lock: another tab may just have replaced it.
    const refreshToken = savedRefreshToken() ?? useSession.getState().refreshToken
    if (!refreshToken) {
      useSession.getState().signOut()
      onSessionEnded()
      return false
    }
    /** The token last sent (the saved one, or a newer pair's from another tab after 409 TRY_AGAIN). */
    let used = refreshToken
    const swap = (token: string) =>
      send<Tokens>('POST', '/api/v1/auth/refresh', { body: { refreshToken: token, device: deviceName() }, auth: false })
    try {
      let tokens: Tokens
      try {
        tokens = await swap(refreshToken)
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409 && e.code === 'TRY_AGAIN')) throw e
        // 409 TRY_AGAIN: another tab or request swapped this same token a moment ago, and its new pair is the live
        // one. Use the pair it saved (give its answer a moment to arrive), once: no newer one, or a second 409, keeps
        // the session for the next call. Never a loop.
        const newer = await newerSavedToken(refreshToken)
        if (!newer) return false
        used = newer
        tokens = await swap(newer)
      }
      // A newer pair was saved while this was on its way (the phone number changed, which ended the token this one
      // was swapped for too): keep the newer one
      const savedNow = savedRefreshToken()
      if (savedNow && savedNow !== used && savedNow !== tokens.refreshToken) return true
      if (useSession.getState().generation !== started) {
        // Signed out while this was on its way: don't come back to life, and end the new token too.
        void send<void>('POST', '/api/v1/auth/logout', { body: { refreshToken: tokens.refreshToken }, auth: false }).catch(() => {})
        return false
      }
      useSession.getState().signIn(tokens)
      return true
    } catch (e) {
      // The token was replaced meanwhile (the phone number changed, here or in another tab, which ends every old
      // token and saves a new pair): the session goes on with the new one. Changing here: wait for its answer
      // (at most 15 s: never stuck behind a call that is itself waiting for this refresh)
      if (replacing) await Promise.race([replacing.catch(() => {}), new Promise((r) => setTimeout(r, 15_000))])
      const saved = savedRefreshToken()
      if (saved && saved !== used && useSession.getState().generation === started) return true
      // Only a definite "no" ends the session; a network blip keeps the saved session for the next try.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 400)) {
        if (useSession.getState().generation === started) {
          useSession.getState().signOut()
          onSessionEnded()
        }
      }
      return false
    }
  }).finally(() => {
    refreshing = null
  })
  return refreshing
}

/**
 * The last answer to each read (GET), in memory only: the backend marks its answers no-store, so a shared phone keeps
 * nothing in the browser's cache after sign-out, and the browser never asks "changed since?" by itself. The next read
 * of the same address sends the kept ETag as If-None-Match; 304 ("nothing changed", no body) returns the kept data, so
 * a screen refreshed every minute downloads nothing. Kept per signed-in person, at most KEPT_MAX addresses (the least
 * recently used goes first), and forgotten on sign-out and when another person signs in.
 */
const kept = new Map<string, { etag: string; data: unknown }>()
const KEPT_MAX = 200

function keep(key: string, etag: string, data: unknown) {
  kept.delete(key)
  kept.set(key, { etag, data })
  if (kept.size > KEPT_MAX) kept.delete(kept.keys().next().value as string)
}

// Sign-out (here, in another tab, or the backend ending the session) and a different person both forget everything
useSession.subscribe((now, before) => {
  if (now.generation !== before.generation || now.user?.id !== before.user?.id) kept.clear()
})

/** @param fresh ask for the whole answer: no If-None-Match, and past any cache on the way */
async function send<T>(method: string, path: string, opts: Options, fresh = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  const form = typeof FormData !== 'undefined' && opts.body instanceof FormData
  // A file upload: the browser sets the multipart Content-Type (with its boundary) itself.
  if (opts.body !== undefined && !form) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false) {
    const token = useSession.getState().accessToken
    if (token) headers.Authorization = `Bearer ${token}`
  }
  // A read asks "changed since?" with the ETag of the answer kept for it (see `kept`)
  const { generation, user } = useSession.getState()
  const key = method === 'GET' && opts.keep !== false ? `${user?.id ?? ''} ${path}` : null
  const last = key && !fresh ? kept.get(key) : undefined
  if (last) headers['If-None-Match'] = last.etag
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : form ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
      ...(fresh ? { cache: 'no-store' as const } : {}),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw ApiError.network()
  }
  // 304: nothing changed since the kept answer. Not an error, so never retried.
  if (res.status === 304 && last && key && kept.get(key) === last) {
    keep(key, last.etag, last.data)
    return last.data as T
  }
  // A 304 with nothing kept for it (a cache or proxy on the way, or the person signed out or changed while it was on
  // its way): ask once more for the whole answer, for whoever is signed in now
  if (res.status === 304 && method === 'GET' && !fresh) return send<T>(method, path, opts, true)
  if (res.ok) {
    if (res.status === 204) return undefined as T
    // 202 may carry a body (a hand-over request's message) or none (a code sent)
    const text = await res.text()
    const data = (text ? JSON.parse(text) : undefined) as T
    const etag = key ? res.headers.get('ETag') : null
    // Not kept if the person signed out (or someone else signed in) while it was on its way
    const now = useSession.getState()
    if (key && etag && now.generation === generation && now.user?.id === user?.id) keep(key, etag, data)
    return data
  }
  let body: Partial<ErrorBody> = {}
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    /* not JSON: keep the default message */
  }
  const retry = Number(res.headers.get('Retry-After'))
  throw new ApiError(res.status, body, Number.isFinite(retry) && retry > 0 ? retry : null)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Calls the backend. Refreshes the session once on a 401, and waits and tries once more when the backend
 * says SERVICE_BUSY (only for reads and for calls that carry an Idempotency-Key, which are safe to repeat).
 */
export async function api<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const auth = opts.auth !== false
  if (auth && !useSession.getState().accessToken && useSession.getState().refreshToken) {
    await refreshSession()
  }
  try {
    return await send<T>(method, path, opts)
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    if (auth && e.status === 401) {
      if (await refreshSession()) return send<T>(method, path, opts)
      // Still signed in here: the refresh itself failed (offline, server busy), so say that rather than "expired".
      if (useSession.getState().refreshToken) throw ApiError.network()
      throw e
    }
    const repeatable = method === 'GET' || Boolean(opts.headers?.['Idempotency-Key'])
    // Only SERVICE_BUSY is a short blip. 503 PHOTOS_BUSY (many photos being cleaned at once) lasts about a minute:
    // never repeated here, its message ("Try again in a minute") goes to the screen.
    if (e.code === 'SERVICE_BUSY' && repeatable) {
      await sleep(Math.min(e.retryAfterSeconds ?? 2, 5) * 1000)
      return send<T>(method, path, opts)
    }
    throw e
  }
}
