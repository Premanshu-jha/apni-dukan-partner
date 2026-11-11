import { followOtherTabs, useSession } from '../store/session'
import { api, refreshSession, replacingSession } from './client'
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

  it('never repeats a photo upload answered 503 PHOTOS_BUSY, even with an idempotency key, and keeps its message', async () => {
    const message = 'Lots of photos are being sent right now. Try again in a minute.'
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json(503, { code: 'PHOTOS_BUSY', message }, { 'Retry-After': '60' }))
    const form = new FormData()
    form.append('file', new Blob(['x'], { type: 'image/jpeg' }), 'shop.jpg')
    await expect(api('POST', '/api/v1/files?purpose=SHOP_PHOTO', { body: form })).rejects.toMatchObject({ code: 'PHOTOS_BUSY', status: 503, message })
    await expect(api('POST', '/x', { body: {}, headers: { 'Idempotency-Key': 'k1' } })).rejects.toMatchObject({ code: 'PHOTOS_BUSY' })
    expect(fetch).toHaveBeenCalledTimes(2)
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

  it('a refresh refused because the phone change just ended its token waits for the new pair and stays signed in', async () => {
    let answerChange: (t: Tokens) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url)
      if (u.endsWith('/auth/me/phone')) {
        return new Promise<Response>((done) => {
          answerChange = (t) => done(json(200, t))
        })
      }
      // The change has already ended every old token on the backend
      if (u.endsWith('/auth/refresh')) return json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'Sign in again.' })
      return json(401, { code: 'SIGNED_OUT', message: 'x' })
    })
    const change = replacingSession(() => api<Tokens>('POST', '/api/v1/auth/me/phone', { body: {} }))
    await Promise.resolve()
    const refreshed = refreshSession()
    answerChange({ ...tokens(7), user: { ...user, phone: '9700000003' } })
    await change
    expect(await refreshed).toBe(true)
    expect(useSession.getState().status).toBe('signedIn')
    expect(useSession.getState().refreshToken).toBe('refresh-7')
    expect(useSession.getState().user?.phone).toBe('9700000003')
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

describe('api client: ETags (the last answer of each read, kept in memory)', () => {
  const sent: Array<{ method: string; path: string; ifNoneMatch: string | undefined }> = []
  /** A backend that fingerprints its answers like the real one and answers 304 when nothing changed. */
  function backend(answers: Record<string, unknown>) {
    sent.length = 0
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '')
      const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.['If-None-Match']
      sent.push({ method: init?.method ?? 'GET', path, ifNoneMatch })
      if (init?.method !== 'GET') return new Response(null, { status: 204 })
      const etag = `"0${JSON.stringify(answers[path]).length}-${path}"`
      if (ifNoneMatch === etag) return new Response(null, { status: 304, headers: { ETag: etag } })
      return json(200, answers[path], { ETag: etag })
    })
  }

  beforeEach(() => {
    // A sign-out and a new sign-in: each test starts with nothing kept
    useSession.getState().signOut()
    useSession.getState().signIn(tokens(1))
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends the kept ETag as If-None-Match and gives the kept data on 304, which is not an error and not retried', async () => {
    const fetch = backend({ '/a': { name: 'Gupta' } })
    const first = await api('GET', '/a')
    const second = await api('GET', '/a')
    expect(second).toEqual({ name: 'Gupta' })
    expect(second).toBe(first)   // the same data: nothing to redraw
    expect(sent[0].ifNoneMatch).toBeUndefined()
    expect(sent[1].ifNoneMatch).toMatch(/^"0/)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps nothing for a read with keep: false (a day board delta), and sends no If-None-Match for it', async () => {
    backend({ '/day?since=1': { full: false } })
    await api('GET', '/day?since=1', { keep: false })
    await api('GET', '/day?since=1', { keep: false })
    expect(sent.map((x) => x.ifNoneMatch)).toEqual([undefined, undefined])
  })

  it('takes the new answer when it changed, and keeps nothing for writes', async () => {
    const answers: Record<string, unknown> = { '/a': { name: 'Gupta' } }
    backend(answers)
    await api('GET', '/a')
    answers['/a'] = { name: 'Gupta Store' }
    await expect(api('GET', '/a')).resolves.toEqual({ name: 'Gupta Store' })
    await api('POST', '/a', { body: {} })
    expect(sent[2].ifNoneMatch).toBeUndefined()
    await expect(api('GET', '/a')).resolves.toEqual({ name: 'Gupta Store' })
    expect(sent[3].ifNoneMatch).toBeDefined()
    expect(sent[3].ifNoneMatch).not.toBe(sent[1].ifNoneMatch)   // the new answer's fingerprint
  })

  it('forgets everything on sign-out, and when another person signs in', async () => {
    backend({ '/a': [1] })
    await api('GET', '/a')
    useSession.getState().signOut()
    useSession.getState().signIn(tokens(2))
    await api('GET', '/a')
    expect(sent[1].ifNoneMatch).toBeUndefined()

    // Another tab signed someone else in (no sign-out here): their reads start from nothing too
    await api('GET', '/a')
    expect(sent[2].ifNoneMatch).toBeDefined()
    useSession.setState({ user: { ...user, id: 'u2' } })
    await api('GET', '/a')
    expect(sent[3].ifNoneMatch).toBeUndefined()
  })

  it('does not keep an answer that arrives after sign-out', async () => {
    let release: (r: Response) => void = () => {}
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise<Response>((r) => (release = r)))
    const pending = api('GET', '/a')
    await Promise.resolve()
    useSession.getState().signOut()
    useSession.getState().signIn(tokens(2))
    release(json(200, [1], { ETag: '"0x"' }))
    await pending
    fetch.mockResolvedValueOnce(json(200, [1], { ETag: '"0x"' }))
    await api('GET', '/a')
    expect((fetch.mock.calls[1][1]?.headers as Record<string, string> | undefined)?.['If-None-Match']).toBeUndefined()
  })

  it('asks once more for the whole answer when a 304 comes for something not kept (a proxy on the way)', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(json(200, { name: 'Gupta' }, { ETag: '"0a"' }))
    await expect(api('GET', '/a')).resolves.toEqual({ name: 'Gupta' })
    expect(fetch).toHaveBeenCalledTimes(2)
    const again = fetch.mock.calls[1][1]
    expect(again?.cache).toBe('no-store')
    expect((again?.headers as Record<string, string> | undefined)?.['If-None-Match']).toBeUndefined()
  })

  it('throws as usual when the second ask is a 304 too (only once more)', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 304 }))
    await expect(api('GET', '/a')).rejects.toMatchObject({ status: 304 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('a 304 arriving after sign-out and a new sign-in gives the new person the whole answer, not the kept one', async () => {
    backend({ '/a': { name: 'Gupta' } })
    await api('GET', '/a')
    let release: (r: Response) => void = () => {}
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise<Response>((r) => (release = r)))
      .mockResolvedValueOnce(json(200, { name: 'Riya' }, { ETag: '"0b"' }))
    fetch.mockClear()   // the same spy as backend()'s: count from here
    const pending = api('GET', '/a')
    await Promise.resolve()
    useSession.getState().signOut()
    useSession.getState().signIn(tokens(2))
    release(new Response(null, { status: 304 }))
    await expect(pending).resolves.toEqual({ name: 'Riya' })
    expect(fetch.mock.calls[1][1]?.cache).toBe('no-store')
    expect((fetch.mock.calls[1][1]?.headers as Record<string, string> | undefined)?.Authorization).toBe('Bearer access-2')
  })

  it('a 304 arriving after another person signed in (another tab) is asked again too', async () => {
    backend({ '/a': { name: 'Gupta' } })
    await api('GET', '/a')
    let release: (r: Response) => void = () => {}
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise<Response>((r) => (release = r)))
      .mockResolvedValueOnce(json(200, { name: 'Asha' }))
    fetch.mockClear()
    const pending = api('GET', '/a')
    await Promise.resolve()
    useSession.setState({ user: { ...user, id: 'u2' } })
    release(new Response(null, { status: 304 }))
    await expect(pending).resolves.toEqual({ name: 'Asha' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('forgets everything when another tab signs out (the storage event)', async () => {
    followOtherTabs()
    backend({ '/a': [1] })
    await api('GET', '/a')
    await api('GET', '/a')
    expect(sent[1].ifNoneMatch).toBeDefined()
    localStorage.removeItem('adp.session')
    window.dispatchEvent(new StorageEvent('storage', { key: 'adp.session', newValue: null }))
    expect(useSession.getState().status).toBe('signedOut')
    useSession.getState().signIn(tokens(2))
    await api('GET', '/a')
    expect(sent[2].ifNoneMatch).toBeUndefined()
  })

  it('keeps at most 200 addresses, dropping the least recently used', async () => {
    const answers: Record<string, unknown> = {}
    for (let i = 0; i <= 200; i++) answers[`/p${i}`] = i
    backend(answers)
    await api('GET', '/p0')
    for (let i = 1; i < 200; i++) await api('GET', `/p${i}`)
    await api('GET', '/p0')   // used again: now the most recent
    await api('GET', '/p200') // the 201st: /p1 goes
    sent.length = 0
    await api('GET', '/p0')
    await api('GET', '/p1')
    expect(sent.map((s) => s.ifNoneMatch !== undefined)).toEqual([true, false])
  })
})

describe('api client: a refresh answered 409 TRY_AGAIN (another tab or request swapped the same token first)', () => {
  const refreshBodies: string[] = []
  beforeEach(() => {
    localStorage.clear()
    refreshBodies.length = 0
    useSession.getState().signIn(tokens(1))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** The backend: refresh answers by token; the call works only with access-8. */
  function backend(refresh: (token: string) => Response) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) {
        const token = JSON.parse(String(init?.body)).refreshToken as string
        refreshBodies.push(token)
        return refresh(token)
      }
      const auth = (init?.headers as Record<string, string>)?.Authorization
      return auth === 'Bearer access-8' ? json(200, { ok: true }) : json(401, { code: 'TOKEN_EXPIRED', message: 'x' })
    })
  }
  const tryAgain = () => json(409, { code: 'TRY_AGAIN', message: 'This sign-in was just renewed by another request. Use the newest one.' })
  const otherTabSaves = (token: string) => localStorage.setItem('adp.session', JSON.stringify({ refreshToken: token, user }))

  it('uses the pair the other tab saved, then retries the call once with it', async () => {
    backend((token) => {
      if (token === 'refresh-1') {
        otherTabSaves('refresh-7')
        return tryAgain()
      }
      return token === 'refresh-7' ? json(200, tokens(8)) : json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'x' })
    })
    await expect(api('GET', '/a')).resolves.toEqual({ ok: true })
    expect(refreshBodies).toEqual(['refresh-1', 'refresh-7'])
    expect(useSession.getState()).toMatchObject({ status: 'signedIn', accessToken: 'access-8', refreshToken: 'refresh-8' })
  })

  it('waits a moment for the other tab to save its pair, then uses it', async () => {
    vi.useFakeTimers()
    backend((token) => (token === 'refresh-7' ? json(200, tokens(8)) : tryAgain()))
    const call = api('GET', '/a')
    await vi.advanceTimersByTimeAsync(500)
    expect(refreshBodies).toEqual(['refresh-1'])
    otherTabSaves('refresh-7')
    await vi.advanceTimersByTimeAsync(500)
    await expect(call).resolves.toEqual({ ok: true })
    expect(refreshBodies).toEqual(['refresh-1', 'refresh-7'])
  })

  it('nothing newer saved: keeps the session, fails this call, and never loops', async () => {
    vi.useFakeTimers()
    backend(() => tryAgain())
    const call = api('GET', '/a').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await call).toBeInstanceOf(ApiError)
    expect(refreshBodies).toEqual(['refresh-1'])
    expect(useSession.getState().status).toBe('signedIn')
    expect(JSON.parse(localStorage.getItem('adp.session')!).refreshToken).toBe('refresh-1')
  })

  it('a second 409 with the newer token ends there: two refreshes, still signed in', async () => {
    backend((token) => {
      if (token === 'refresh-1') otherTabSaves('refresh-7')
      return tryAgain()
    })
    await expect(api('GET', '/a')).rejects.toBeInstanceOf(ApiError)
    expect(refreshBodies).toEqual(['refresh-1', 'refresh-7'])
    expect(useSession.getState().status).toBe('signedIn')
  })

  it('the newer token refused (401): signed out, as any refused refresh', async () => {
    backend((token) => {
      if (token === 'refresh-1') {
        otherTabSaves('refresh-7')
        return tryAgain()
      }
      return json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'Sign in again.' })
    })
    await expect(api('GET', '/a')).rejects.toBeInstanceOf(ApiError)
    expect(refreshBodies).toEqual(['refresh-1', 'refresh-7'])
    expect(useSession.getState().status).toBe('signedOut')
  })
})
