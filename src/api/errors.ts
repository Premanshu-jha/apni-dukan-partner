import { hasText, language, t } from '../i18n'
import { rupees } from '../lib/money'
import type { ErrorBody } from './types'

/** Every failed call becomes one of these. `code` is the backend's error code, or NETWORK / UNKNOWN. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>
  readonly retryAfterSeconds: number | null

  constructor(status: number, body: Partial<ErrorBody>, retryAfterSeconds: number | null = null) {
    super(body.message || t('error.UNKNOWN'))
    this.name = 'ApiError'
    this.status = status
    this.code = body.code || 'UNKNOWN'
    this.details = body.details ?? {}
    this.retryAfterSeconds = retryAfterSeconds
  }

  static network(): ApiError {
    return new ApiError(0, { code: 'NETWORK', message: "You're offline or the server can't be reached. Try again." })
  }
}

/**
 * How long TanStack Query waits before trying a failed read again: what the backend asked for in Retry-After when it
 * sent one (SERVICE_BUSY: 5 s; at most 30 s), else 1 s, 2 s, 4 s… up to 30 s. The client has already waited and tried
 * once more for SERVICE_BUSY, so a busy backend gets a call every 5 s at most, never a burst.
 */
export function retryDelay(attempt: number, error: unknown): number {
  if (error instanceof ApiError && error.retryAfterSeconds) return Math.min(error.retryAfterSeconds, 30) * 1000
  return Math.min(1000 * 2 ** attempt, 30_000)
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code)
}

/**
 * The words to show a person for any error, in their language: the app's own words for the backend's exact message
 * (server.json: the most precise, as one code can have several messages); else, in another language than English, the
 * words for the backend's code (error.json, its blanks filled from the details: for a message the backend built with
 * names or amounts); else the backend's message as it came (English, written for people: in English it says more than
 * the code's words, the names in it included).
 */
export function messageOf(e: unknown): string {
  // 429 TRY_LATER (sign-in codes): this network has to wait before the next try; Retry-After says how long
  if (e instanceof ApiError && e.code === 'TRY_LATER') return tryLaterText(e.retryAfterSeconds)
  if (e instanceof ApiError) {
    if (e.code === 'NETWORK') return t('error.NETWORK')
    if (hasText(`server.${e.message}`)) return serverText(e.message)
    if (language() !== 'en' && hasText(`error.${e.code}`)) return t(`error.${e.code}`, textVars(e.details))
    return e.message
  }
  return t('error.UNKNOWN')
}

/** A message the backend wrote, in the person's language when the app has words for exactly that message. */
export function serverText(message: string): string {
  return t(`server.${message}`, undefined, message)
}

/**
 * The details that can fill a message's blanks (numbers and words; never lists or objects). An amount in paise also
 * fills the blank without "Paise" in rupees: availablePaise 25050 → {available} "₹250.50".
 */
function textVars(details: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(details)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
    if (typeof v === 'number' && k.endsWith('Paise') && k.length > 5) out[k.slice(0, -5)] = rupees(v)
  }
  return out
}

/** VALIDATION_FAILED details map field names to messages; this picks one field's message. */
export function fieldError(e: unknown, field: string): string | undefined {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return undefined
  const value = e.details[field]
  return typeof value === 'string' ? serverText(value) : undefined
}

/**
 * The words for an error, with the backend's field reasons spelled out for VALIDATION_FAILED (its message alone,
 * "Some fields are not valid", doesn't say what to fix).
 */
export function explain(e: unknown): string {
  if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
    const reasons = Object.entries(e.details)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => `${hasText(`field.${k}`) ? t(`field.${k}`) : k} ${serverText(v as string)}`)
    if (reasons.length) return `${reasons.join('. ')}.`
  }
  return messageOf(e)
}

/** "Too many tries from this network. Try again in 4 minutes." (from Retry-After; at least a minute). */
export function tryLaterText(seconds: number | null): string {
  const minutes = Math.max(1, Math.ceil((seconds ?? 60) / 60))
  return t('error.TRY_LATER', { count: minutes })
}
