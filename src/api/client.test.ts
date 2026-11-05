import { useSession } from '../store/session'
import { api, refreshSession } from './client'
import { ApiError } from './errors'
import type { Tokens } from './types'

const user = { id: 'u1', phone: '9848012345', name: 'Riya', email: 'r@x.in', emailVerified: true, admin: false }
const tokens = (n: number): Tokens => ({
  accessToken: `access-${n}`,
  accessExpiresAt: '2030-01-01T00:00:00Z',
  refreshToken: `refresh-${n}`,
  refreshExpiresAt: '2030-01-01T00:00:00Z',
  user,
  newUser: false,
})

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear()
    useSession.getState().signIn(tokens(1))
  })
  afterEach(() => vi.restoreAllMocks())

  it('refreshes once for two requests that both find the token expired, then retries both', async () => {
    let refreshes = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = String(url)
      const auth = (init?.headers as Record<string, string>)?.Authorization
      if (u.endsWith('/auth/refresh')) {
        refreshes++
        return json(200, tokens(2))
      }
      return auth === 'Bearer access-2' ? json(200, { ok: true }) : json(401, { code: 'TOKEN_EXPIRED', message: 'x' })
    })
    const [a, b] = await Promise.all([api('GET', '/a'), api('GET', '/b')])
    expect(a).toEqual({ ok: true })
    expect(b).toEqual({ ok: true })
    expect(refreshes).toBe(1)
    expect(useSession.getState().refreshToken).toBe('refresh-2')
  })

  it('signs out when the refresh token is refused', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/auth/refresh')
        ? json(401, { code: 'INVALID_REFRESH', message: 'x' })
        : json(401, { code: 'TOKEN_EXPIRED', message: 'x' }),
    )
    await expect(api('GET', '/a')).rejects.toBeInstanceOf(ApiError)
    expect(useSession.getState().status).toBe('signedOut')
  })

  it('keeps the backend error code and message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(409, { code: 'SLOT_TAKEN', message: 'That time was just booked', details: {} }),
    )
    const err = (await api('POST', '/api/v1/bookings', { body: {} }).catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('SLOT_TAKEN')
    expect(err.message).toBe('That time was just booked')
  })

  it('tries a read once more when the backend is busy', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(503, { code: 'SERVICE_BUSY', message: 'busy' }, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(json(200, [1]))
    const p = api('GET', '/x')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(p).resolves.toEqual([1])
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('does not repeat a write without an idempotency key when busy', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(503, { code: 'SERVICE_BUSY', message: 'busy' }))
    await expect(api('POST', '/x', { body: {} })).rejects.toMatchObject({ code: 'SERVICE_BUSY' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('turns a failed connection into a NETWORK error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api('GET', '/x')).rejects.toMatchObject({ code: 'NETWORK', status: 0 })
  })

  it('refreshes with the token another tab saved, not the one this tab remembers', async () => {
    // Another tab swapped refresh-1 for refresh-9 and saved it.
    localStorage.setItem('adp.session', JSON.stringify({ refreshToken: 'refresh-9', user }))
    let sent = ''
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) {
        sent ||= JSON.parse(String(init?.body)).refreshToken
        return json(200, tokens(10))
      }
      return json(401, { code: 'TOKEN_EXPIRED', message: 'x' })
    })
    useSession.setState({ accessToken: null })
    await api('GET', '/a').catch(() => {})
    expect(sent).toBe('refresh-9')
  })

  it('stays signed out when a refresh finishes after signing out, and ends the new token', async () => {
    let release: (r: Response) => void = () => {}
    const calls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const u = String(url)
      calls.push(u.replace(/^.*\/api\/v1/, '') + (init?.body ? ' ' + String(init.body) : ''))
      if (u.endsWith('/auth/refresh')) return new Promise<Response>((r) => (release = r))
      return Promise.resolve(json(204, {}))
    })
    const pending = refreshSession()
    await Promise.resolve()
    useSession.getState().signOut()
    release(json(200, tokens(2)))
    await expect(pending).resolves.toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(useSession.getState().status).toBe('signedOut')
    expect(localStorage.getItem('adp.session')).toBeNull()
    expect(calls.some((c) => c.startsWith('/auth/logout') && c.includes('refresh-2'))).toBe(true)
  })
})
