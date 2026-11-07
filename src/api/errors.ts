import type { ErrorBody } from './types'

/** Every failed call becomes one of these. `code` is the backend's error code, or NETWORK / UNKNOWN. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>
  readonly retryAfterSeconds: number | null

  constructor(status: number, body: Partial<ErrorBody>, retryAfterSeconds: number | null = null) {
    super(body.message || 'Something went wrong. Please try again.')
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

/** The words to show a person for any error. The backend's messages are already written for people. */
export function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message
  return 'Something went wrong. Please try again.'
}

/** VALIDATION_FAILED details map field names to messages; this picks one field's message. */
export function fieldError(e: unknown, field: string): string | undefined {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return undefined
  const value = e.details[field]
  return typeof value === 'string' ? value : undefined
}

/**
 * The words for an error, with the backend's field reasons spelled out for VALIDATION_FAILED (its message alone,
 * "Some fields are not valid", doesn't say what to fix).
 */
export function explain(e: unknown): string {
  if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
    const reasons = Object.entries(e.details)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => `${FIELD_NAMES[k] ?? k} ${v}`)
    if (reasons.length) return `${reasons.join('. ')}.`
  }
  return messageOf(e)
}

const FIELD_NAMES: Record<string, string> = {
  staffId: 'The barber:',
  serviceIds: 'The services:',
  name: 'The name',
  reason: 'The reason',
  endAt: 'The end',
  startAt: 'The start',
  until: 'The pause',
  date: 'The date',
  durationMinutes: 'The duration',
  pricePaise: 'The price',
  phone: 'That number',
}
