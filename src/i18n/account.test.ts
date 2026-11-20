import {
  browserLanguage,
  forgetDownloadsForTests,
  keepShownLanguage,
  language,
  languageChosen,
  onAccountLanguage,
  resetLanguageForTests,
  restoreLanguage,
  setAccount,
  setLanguage,
  t,
  turnstileLanguage,
  type Lang,
} from './index'

function setBrowserLanguages(list: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: list, configurable: true })
}

describe('each account its own language, kept texts, the phone language', () => {
  let saved: Array<[string, Lang]>
  beforeEach(() => {
    window.localStorage.clear()
    resetLanguageForTests()
    saved = []
    onAccountLanguage((userId, lang) => saved.push([userId, lang]))
    setBrowserLanguages(['en-US'])
  })
  afterEach(() => onAccountLanguage(null))

  it('a language tapped on the sign-in screen is the signing-in account\'s, and saved on it', async () => {
    await setLanguage('hi')
    expect(saved).toEqual([]) // nobody signed in: nothing to save on an account yet
    await setAccount('u1', null)
    expect(language()).toBe('hi')
    expect(window.localStorage.getItem('language:u1')).toBe('hi')
    expect(saved).toEqual([['u1', 'hi']])
  })

  it('not saved again when the account already has it', async () => {
    await setLanguage('hi')
    await setAccount('u1', 'hi')
    expect(saved).toEqual([])
  })

  it('on a shared phone each account gets its own language back at sign-in', async () => {
    await setAccount('asha', null)
    await setLanguage('hi')
    await setAccount(null)
    await setAccount('ravi', null)
    await setLanguage('te')
    await setAccount(null)
    // The sign-in screen shows the phone's last choice
    expect(language()).toBe('te')
    await setAccount('asha', 'hi')
    expect(language()).toBe('hi')
    expect(t('language.title')).toBe('भाषा')
    await setAccount(null)
    await setAccount('ravi', 'te')
    expect(language()).toBe('te')
    // Ravi, new here, first took the language showing (saved on his account), then chose his own
    expect(saved).toEqual([['asha', 'hi'], ['ravi', 'hi'], ['ravi', 'te']])
  })

  it('an account new to this phone takes the language saved on the account (from another phone)', async () => {
    await setAccount('u1', 'kn')
    expect(language()).toBe('kn')
    expect(languageChosen()).toBe(true)
    expect(window.localStorage.getItem('language')).toBe('kn')
    expect(saved).toEqual([])
  })

  it('a change while signed in is saved for the account and on it', async () => {
    await setAccount('u1', null)
    expect(saved).toEqual([]) // nothing chosen anywhere: nothing to save
    await setLanguage('mr')
    expect(window.localStorage.getItem('language:u1')).toBe('mr')
    expect(saved).toEqual([['u1', 'mr']])
  })

  it('a cold start shows the kept texts at once, then the download', async () => {
    await setLanguage('ta')
    const kept = JSON.parse(window.localStorage.getItem('language.texts')!) as { lang: string; messages: Record<string, Record<string, string>> }
    expect(kept.lang).toBe('ta')
    expect(kept.messages.language.title).toBe(t('language.title'))
    // A cold start: only English in the app; the kept copy says something the download will replace
    kept.messages.language.title = 'kept copy'
    window.localStorage.setItem('language.texts', JSON.stringify(kept))
    resetLanguageForTests()
    forgetDownloadsForTests()
    const restoring = restoreLanguage()
    // Before the download: already Tamil, from the copy kept on the phone (no English first)
    expect(language()).toBe('ta')
    expect(t('language.title')).toBe('kept copy')
    await restoring
    expect(t('language.title')).not.toBe('kept copy')
    expect(t('language.title')).not.toBe('Language')
  })

  it('English keeps no copy', async () => {
    await setLanguage('hi')
    await setLanguage('en')
    expect(window.localStorage.getItem('language.texts')).toBeNull()
  })

  it('first open: the phone\'s own language when the app has it, not yet chosen', async () => {
    setBrowserLanguages(['te-IN', 'en-IN'])
    expect(browserLanguage()).toBe('te')
    await restoreLanguage()
    expect(language()).toBe('te')
    expect(languageChosen()).toBe(false)
    expect(window.localStorage.getItem('language')).toBeNull()
  })

  it('first open on a phone in a language the app lacks, or English first: English', async () => {
    setBrowserLanguages(['fr-FR', 'en-GB', 'hi-IN'])
    expect(browserLanguage()).toBe('en')
    await restoreLanguage()
    expect(language()).toBe('en')
  })

  it('first start after the update: the phone\'s saved choice, never the English showing while its words download', async () => {
    // Hindi chosen on this phone by an older version: no kept texts, no language:<id> yet
    window.localStorage.setItem('language', 'hi')
    window.localStorage.removeItem('language.texts')
    forgetDownloadsForTests()
    const restoring = restoreLanguage()
    expect(language()).toBe('en') // Hindi still downloading
    await setAccount('u1', null)
    await restoring
    expect(language()).toBe('hi')
    expect(window.localStorage.getItem('language:u1')).toBe('hi')
    expect(window.localStorage.getItem('language')).toBe('hi')
    expect(saved).toEqual([['u1', 'hi']])
  })

  it('the account\'s saved language wins over a choice still downloading', async () => {
    window.localStorage.setItem('language', 'hi')
    window.localStorage.removeItem('language.texts')
    forgetDownloadsForTests()
    const restoring = restoreLanguage()
    await setAccount('u1', 'en')
    await restoring
    expect(language()).toBe('en')
    expect(window.localStorage.getItem('language')).toBe('en')
    expect(saved).toEqual([])
  })

  it('two phones: this phone\'s older per-account language yields to the account\'s, nothing sent', async () => {
    // This phone last had Hindi for u1; another phone has since saved Telugu on the account
    window.localStorage.setItem('language', 'hi')
    window.localStorage.setItem('language:u1', 'hi')
    await restoreLanguage()
    await setAccount('u1', 'te')
    expect(language()).toBe('te')
    expect(window.localStorage.getItem('language:u1')).toBe('te')
    // The next start on this phone: still nothing sent, no flip-flop
    resetLanguageForTests()
    await restoreLanguage()
    await setAccount('u1', 'te')
    expect(language()).toBe('te')
    expect(saved).toEqual([])
  })

  it('a tap at sign-in that is already the account\'s drops an older choice still waiting to be sent', async () => {
    window.localStorage.setItem('language.unsynced:u1', 'ta') // chosen offline earlier, never sent, then signed out
    await setLanguage('te')
    await setAccount('u1', 'te')
    expect(language()).toBe('te')
    expect(window.localStorage.getItem('language.unsynced:u1')).toBeNull()
    expect(saved).toEqual([])
  })

  it('a choice on this phone not yet saved on the account stays over the account\'s older one', async () => {
    window.localStorage.setItem('language', 'mr')
    window.localStorage.setItem('language:u1', 'mr')
    window.localStorage.setItem('language.unsynced:u1', 'mr')
    await restoreLanguage()
    await setAccount('u1', 'te')
    expect(language()).toBe('mr')
    // Sent by the sync's retry, not a second time from here
    expect(saved).toEqual([])
  })

  it('an account with no language yet gets this phone\'s, once', async () => {
    window.localStorage.setItem('language:u1', 'kn')
    await setAccount('u1', null)
    expect(language()).toBe('kn')
    expect(saved).toEqual([['u1', 'kn']])
  })

  it('the phone\'s own language showing at sign-in is kept: saved on the phone and on the account', async () => {
    setBrowserLanguages(['ta-IN'])
    await restoreLanguage()
    expect(languageChosen()).toBe(false)
    keepShownLanguage()
    expect(languageChosen()).toBe(true)
    // The offline page and the next start read it
    expect(window.localStorage.getItem('language')).toBe('ta')
    await setAccount('u1', null)
    expect(language()).toBe('ta')
    expect(saved).toEqual([['u1', 'ta']])
  })

  it('the phone\'s own language kept at sign-in yields to the account\'s own (only a tap overrides it)', async () => {
    setBrowserLanguages(['ta-IN'])
    await restoreLanguage()
    keepShownLanguage()
    await setAccount('u1', 'hi')
    expect(language()).toBe('hi')
    expect(window.localStorage.getItem('language')).toBe('hi')
    expect(saved).toEqual([])
  })

  it('a language tapped on the sign-in screen overrides the account\'s', async () => {
    await setLanguage('kn')
    await setAccount('u1', 'hi')
    expect(language()).toBe('kn')
    expect(saved).toEqual([['u1', 'kn']])
  })

  it('the robot check speaks Hindi; English for the languages Cloudflare lacks', () => {
    expect(turnstileLanguage('hi')).toBe('hi')
    for (const lang of ['en', 'te', 'mr', 'ta', 'kn'] as const) expect(turnstileLanguage(lang)).toBe('en')
  })
})
