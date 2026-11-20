import { languageUnsynced, retryLanguageSync, syncLanguage } from './sync'
import type { Lang } from './index'

describe('saving the language on the account', () => {
  beforeEach(() => window.localStorage.clear())

  it('sends it once and forgets it when the backend has it', async () => {
    const send = vi.fn(async () => {})
    await syncLanguage('u1', 'hi', send)
    expect(send.mock.calls).toEqual([['u1', 'hi']])
    expect(languageUnsynced('u1')).toBeNull()
  })

  it('a failure keeps it for the next start, and sends nothing more meanwhile', async () => {
    const send = vi.fn(async () => {
      throw new Error('offline')
    })
    await syncLanguage('u1', 'te', send)
    expect(languageUnsynced('u1')).toBe('te')
    expect(send).toHaveBeenCalledTimes(1)
    // The next start
    const ok = vi.fn(async () => {})
    await retryLanguageSync('u1', ok)
    expect(ok.mock.calls).toEqual([['u1', 'te']])
    expect(languageUnsynced('u1')).toBeNull()
  })

  it('tapping through the languages: one call at a time, the newest last, no storm', async () => {
    const sent: Lang[] = []
    let release!: () => void
    const send = vi.fn((_: string, lang: Lang) => {
      sent.push(lang)
      return sent.length === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve()
    })
    const first = syncLanguage('u1', 'hi', send)
    const others = (['te', 'mr', 'ta', 'kn'] as const).map((l) => syncLanguage('u1', l, send))
    expect(sent).toEqual(['hi'])
    release()
    await Promise.all([first, ...others])
    expect(sent).toEqual(['hi', 'kn'])
    expect(languageUnsynced('u1')).toBeNull()
  })

  it('nothing waiting: nothing sent at start', async () => {
    const send = vi.fn(async () => {})
    await retryLanguageSync('u1', send)
    expect(send).not.toHaveBeenCalled()
  })
})
