import type { Tokens } from '../api/types'
import { language, onAccountLanguage, resetLanguageForTests, setLanguage } from '../i18n'
import { useSession } from '../store/session'
import { followAccountLanguage } from './accountLanguage'

const user = { id: 'u1', phone: '9848012345', name: 'Riya', email: 'r@x.in', emailVerified: true, admin: false, language: null }
const tokens = (u: typeof user | Record<string, unknown>): Tokens =>
  ({ accessToken: 'access-1', accessExpiresAt: '2030-01-01T00:00:00Z', refreshToken: 'refresh-1', refreshExpiresAt: '2030-01-01T00:00:00Z', user: u, newUser: false }) as Tokens

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const settle = () => new Promise((r) => setTimeout(r, 20))

describe('the language saved on the account (PATCH /me)', () => {
  let patches: Array<{ auth: string | undefined; body: unknown }>
  let answer: (body: Record<string, unknown>) => Response
  beforeEach(() => {
    localStorage.clear()
    resetLanguageForTests()
    useSession.setState({ status: 'signedOut', user: null, accessToken: null, refreshToken: null })
    patches = []
    answer = (body) => json(200, { ...user, ...body })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).endsWith('/api/v1/auth/me') && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>
        patches.push({ auth: (init.headers as Record<string, string>)?.Authorization, body })
        return answer(body)
      }
      return json(404, { code: 'NOT_FOUND', message: 'x' })
    })
    followAccountLanguage()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    onAccountLanguage(null)
  })

  it('the language picked on the sign-in screen is sent once after sign-in, with only the language', async () => {
    await setLanguage('hi')
    expect(patches).toEqual([])
    useSession.getState().signIn(tokens(user))
    await settle()
    expect(patches).toEqual([{ auth: 'Bearer access-1', body: { language: 'hi' } }])
    expect(useSession.getState().user?.language).toBe('hi')
    expect(useSession.getState().user?.name).toBe('Riya')
  })

  it('a change in Profile is sent; the account already having it sends nothing', async () => {
    useSession.getState().signIn(tokens({ ...user, language: 'te' }))
    await vi.waitFor(() => expect(language()).toBe('te'))
    await settle()
    expect(patches).toEqual([])
    await setLanguage('kn')
    await settle()
    expect(patches.map((p) => p.body)).toEqual([{ language: 'kn' }])
  })

  it('a failed send waits on the phone and goes at the next start', async () => {
    answer = () => json(503, { code: 'SERVICE_BUSY', message: 'busy' })
    useSession.getState().signIn(tokens(user))
    await settle()
    await setLanguage('mr')
    await settle()
    expect(localStorage.getItem('language.unsynced:u1')).toBe('mr')
    const tries = patches.length
    // The next start: signed in again from the saved session
    answer = (body) => json(200, { ...user, ...body })
    resetLanguageForTests()
    useSession.setState({ status: 'starting' })
    useSession.setState({ status: 'signedIn' })
    await settle()
    expect(patches.length).toBeGreaterThan(tries)
    expect(patches.at(-1)!.body).toEqual({ language: 'mr' })
    expect(localStorage.getItem('language.unsynced:u1')).toBeNull()
  })

  it('two phones: a start never sends this phone\'s older language over the account\'s', async () => {
    localStorage.setItem('language', 'hi')
    localStorage.setItem('language:u1', 'hi')
    useSession.getState().signIn(tokens({ ...user, language: 'te' }))
    await vi.waitFor(() => expect(language()).toBe('te'))
    await settle()
    expect(patches).toEqual([])
    expect(localStorage.getItem('language:u1')).toBe('te')
  })

  it('never sent for an account that signed out meanwhile (it would go with the next person\'s token)', async () => {
    useSession.getState().signIn(tokens(user))
    await settle()
    useSession.getState().signOut()
    await settle()
    localStorage.setItem('language.unsynced:u1', 'ta')
    useSession.getState().signIn(tokens({ ...user, id: 'u2' }))
    await settle()
    expect(patches.every((p) => (p.body as { language: string }).language !== 'ta')).toBe(true)
    expect(localStorage.getItem('language.unsynced:u1')).toBe('ta')
  })
})
