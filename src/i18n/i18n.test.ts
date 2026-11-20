import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANGUAGES, provideForTests, resetLanguageForTests, setLanguage, t, type Messages } from './index'

const root = join(process.cwd(), 'src/i18n')
function read(lang: string): Messages {
  const out: Messages = {}
  for (const f of readdirSync(join(root, lang)).filter((f) => f.endsWith('.json'))) {
    out[f.slice(0, -5)] = JSON.parse(readFileSync(join(root, lang, f), 'utf8')) as Messages[string]
  }
  return out
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const texts = (e: unknown): string[] => (typeof e === 'string' ? [e] : Object.values(e as Record<string, string>))

describe('languages', () => {
  const en = read('en')
  const others = LANGUAGES.map((l) => l.code).filter((c) => c !== 'en')

  it.each(others)('%s has every text English has, with the same blanks to fill', (lang) => {
    const mine = read(lang)
    const problems: string[] = []
    for (const [area, entries] of Object.entries(en)) {
      for (const [key, value] of Object.entries(entries)) {
        const theirs = mine[area]?.[key]
        if (theirs === undefined) {
          problems.push(`${lang}/${area}.json lacks "${key}"`)
          continue
        }
        if (typeof theirs !== 'string' && !('other' in theirs)) problems.push(`${lang}/${area}.${key} lacks "other"`)
        const want = placeholders(texts(value).join(' ')).split(',').filter(Boolean)
        for (const text of texts(theirs)) {
          if (!text.trim()) problems.push(`${lang}/${area}.${key} is empty`)
          for (const p of placeholders(text).split(',').filter(Boolean)) {
            if (!want.includes(p)) problems.push(`${lang}/${area}.${key} has an unknown blank {${p}}`)
          }
        }
        const other = typeof theirs === 'string' ? theirs : theirs.other
        const enOther = typeof value === 'string' ? value : value.other
        if (placeholders(other) !== placeholders(enOther)) {
          problems.push(`${lang}/${area}.${key} blanks differ: {${placeholders(other)}} vs {${placeholders(enOther)}}`)
        }
      }
    }
    for (const [area, entries] of Object.entries(mine)) {
      for (const key of Object.keys(entries)) {
        if (en[area]?.[key] === undefined) problems.push(`${lang}/${area}.json has "${key}" that English doesn't`)
      }
    }
    expect(problems).toEqual([])
  })

  it('fills blanks, picks plurals, and falls back to English, then to the given text', async () => {
    resetLanguageForTests()
    provideForTests('hi', { language: { title: 'भाषा' }, demo: { left: { one: '{count} बचा', other: '{count} बचे' } } })
    provideForTests('en', { ...en, demo: { left: { one: '{count} left', other: '{count} left' }, only: 'Only {name}' } })
    expect(t('demo.left', { count: 1200 })).toBe('1200 left')
    await setLanguage('hi')
    expect(t('language.title')).toBe('भाषा')
    expect(t('demo.left', { count: 1 })).toBe('1 बचा')
    expect(t('demo.left', { count: 5 })).toBe('5 बचे')
    expect(t('demo.only', { name: 'Asha' })).toBe('Only Asha') // English when Hindi lacks it
    expect(t('error.NEW_CODE', {}, 'From the server')).toBe('From the server')
    expect(t('nothing.here')).toBe('nothing.here')
    expect(document.documentElement.lang).toBe('hi')
    resetLanguageForTests()
  })
})
