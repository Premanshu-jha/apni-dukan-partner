import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Messages } from './index'

/**
 * The kiranas' words come only with the kirana switch on (src/i18n/kirana.ts): off, neither English (in the main
 * download) nor any other language's download has one; on, they are added to every language, the kirana error codes
 * under `error` and the kirana backend messages under `server`, as before.
 */
const root = join(process.cwd(), 'src/i18n')
const INTO: Record<string, string> = { kiranaErrors: 'error', kiranaServer: 'server' }
/** Every kirana key of a language as it is asked for ("kiranaCounter.title", "error.KHATA_LIMIT"), with its text. */
function kiranaKeys(lang: string): [string, Messages[string][string]][] {
  return readdirSync(join(root, lang))
    .filter((f) => /^kirana.*\.json$/.test(f))
    .flatMap((f) => {
      const name = f.slice(0, -5)
      const entries = JSON.parse(readFileSync(join(root, lang, f), 'utf8')) as Messages[string]
      return Object.entries(entries).map(([k, v]) => [`${INTO[name] ?? name}.${k}`, v] as [string, Messages[string][string]])
    })
}
const text = (v: Messages[string][string]) => (typeof v === 'string' ? v : v.other)

/** The app's i18n as at a cold start of a build with the switch on or off (the test setup's kirana words left out). */
async function fresh(on: boolean) {
  vi.resetModules()
  vi.doMock('../lib/config', async (orig) => ({ ...(await orig<typeof import('../lib/config')>()), kiranaOn: () => on }))
  const i18n = await import('./index')
  const kirana = await import('./kirana')
  kirana.startKiranaTexts()
  await kirana.kiranaTextsReady()
  return i18n
}

afterEach(() => {
  vi.doUnmock('../lib/config')
  vi.resetModules()
  localStorage.clear()
})

describe("the kiranas' words", () => {
  it('are nowhere with the switch off: not in English, not in a language download', async () => {
    const i18n = await fresh(false)
    const en = kiranaKeys('en')
    expect(en.length).toBeGreaterThan(600)
    expect(en.filter(([key]) => i18n.hasText(key)).map(([key]) => key)).toEqual([])
    // A salon word and a shared backend message are there
    expect(i18n.hasText('error.UNKNOWN')).toBe(true)
    expect(i18n.hasText('server.is required')).toBe(true)
    for (const lang of ['hi', 'te', 'mr', 'ta', 'kn']) {
      const download = (await import(`./${lang}/index.ts`)) as { default: Messages }
      expect(Object.keys(download.default).filter((area) => area.startsWith('kirana')), lang).toEqual([])
      const has = (key: string) => {
        const dot = key.indexOf('.')
        return download.default[key.slice(0, dot)]?.[key.slice(dot + 1)] !== undefined
      }
      expect(kiranaKeys(lang).filter(([key]) => has(key)).map(([key]) => key), lang).toEqual([])
    }
    expect(await i18n.setLanguage('hi')).toBe(true)
    expect(i18n.t('kiranaCounter.title')).toBe('kiranaCounter.title')
    expect(i18n.t('error.KHATA_LIMIT', {}, 'From the server')).toBe('From the server')
    // Shared backend messages a salon meets stay with the salon's words (the helper limit: shops/ShopInvitesService)
    for (const shared of [
      'A shop can have up to 10 helpers, counting invitations still waiting. Remove or cancel one first.',
      'Only the shop owner can add the shop video.',
      'This shop uploaded 100 files today. Try again tomorrow.',
    ]) {
      expect(i18n.t(`server.${shared}`, {}, 'missing'), shared).not.toBe('missing')
      expect(i18n.t(`server.${shared}`), shared).not.toBe(shared)
    }
  })

  it('are there with the switch on: English at start-up, another language with its own download, and kept with it', async () => {
    const i18n = await fresh(true)
    const en = kiranaKeys('en')
    expect(en.filter(([key]) => !i18n.hasText(key)).map(([key]) => key)).toEqual([])
    // Each plain text as written (the codes' words under error, the messages under server)
    for (const [key, value] of en) if (typeof value === 'string' && !value.includes('{')) expect(i18n.t(key), key).toBe(value)
    expect(i18n.t('error.UNKNOWN')).toBe(JSON.parse(readFileSync(join(root, 'en/error.json'), 'utf8')).UNKNOWN)

    expect(await i18n.setLanguage('hi')).toBe(true)
    const hi = new Map(kiranaKeys('hi'))
    for (const key of ['kiranaCounter.title', 'kiranaBills.billsTitle', 'kiranaProducts.each', 'error.BILL_CHANGED']) {
      expect(i18n.t(key), key).toBe(text(hi.get(key)!))
    }
    // A kirana backend message (server.json's area) and a salon one, both in Hindi
    const message = 'Add your products first: everything you sell, with how many are on the shelf.'
    expect(i18n.t(`server.${message}`)).toBe(text(hi.get(`server.${message}`)!))
    const salon = JSON.parse(readFileSync(join(root, 'hi/error.json'), 'utf8')) as Messages[string]
    expect(i18n.t('error.UNKNOWN')).toBe(salon.UNKNOWN)
    // The copy kept on the phone for the next cold start has them too (no English flash on a kirana screen)
    const kept = JSON.parse(localStorage.getItem('language.texts') ?? '{}') as { messages?: Messages }
    expect(kept.messages?.kiranaCounter?.title).toBe(text(hi.get('kiranaCounter.title')!))
    expect(kept.messages?.error?.BILL_CHANGED).toBe(text(hi.get('error.BILL_CHANGED')!))
  })
})
