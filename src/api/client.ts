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

/** Runs fn with a lock shared by all tabs of this app, so two tabs never swap the same refresh token. */
function acrossTabs<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  return locks ? (locks.request('ad-refresh', fn) as Promise<T>) : fn()
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
    try {
      const tokens = await send<Tokens>('POST', '/api/v1/auth/refresh', {
        body: { refreshToken, device: deviceName() },
        auth: false,
      })
      if (useSession.getState().generation !== started) {
        // Signed out while this was on its way: don't come back to life, and end the new token too.
        void send<void>('POST', '/api/v1/auth/logout', { body: { refreshToken: tokens.refreshToken }, auth: false }).catch(() => {})
        return false
      }
      useSession.getState().signIn(tokens)
      return true
    } catch (e) {
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

async function send<T>(method: string, path: string, opts: Options): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  const form = typeof FormData !== 'undefined' && opts.body instanceof FormData
  // A file upload: the browser sets the multipart Content-Type (with its boundary) itself.
  if (opts.body !== undefined && !form) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false) {
    const token = useSession.getState().accessToken
    if (token) headers.Authorization = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : form ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw ApiError.network()
  }
  if (res.ok) {
    if (res.status === 204 || res.status === 202) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
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
    if (e.code === 'SERVICE_BUSY' && repeatable) {
      await sleep(Math.min(e.retryAfterSeconds ?? 2, 5) * 1000)
      return send<T>(method, path, opts)
    }
    throw e
  }
}
