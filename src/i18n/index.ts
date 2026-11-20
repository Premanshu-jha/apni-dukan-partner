import { useSyncExternalStore } from 'react'
import { storage } from '../lib/storage'

/**
 * The app's languages. English is in the main download and is what any missing text falls back to; each other
 * language is one download of its own, fetched when chosen.
 *
 * Text lives in src/i18n/<language>/<area>.json and is asked for as "area.key":
 *   t('common.save')                         "Save"
 *   t('shop.photosLeft', { count: 3 })       { "one": "{count} photo left", "other": "{count} photos left" }
 *   t('error.WRONG_SIZE', {}, serverText)    the backend's own English when the app has no words for a code
 * Only what the app shows is translated: names people type, and everything saved, stay as they are.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'mr', name: 'मराठी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
] as const

export type Lang = (typeof LANGUAGES)[number]['code']
type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
export type Messages = Record<string, Record<string, string | Plural>>
export type Vars = Record<string, string | number>

const KEY = 'language'
const english: Messages = {}
for (const [path, content] of Object.entries(
  import.meta.glob<Messages[string]>('./en/*.json', { eager: true, import: 'default' }),
)) {
  english[path.slice(5, -5)] = content
}
const loaders = import.meta.glob<{ default: Messages }>('./{hi,te,mr,ta,kn}/index.ts')
const loaded: Partial<Record<Lang, Messages>> = { en: english }

let current: Lang = 'en'
let chosen = false
/** Bumped by each choice: a slower download started earlier never overrides a later choice. */
let choice = 0
const listeners = new Set<() => void>()
const RELOADED = 'language.reloaded'

function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((l) => l.code === value)
}

function show(lang: Lang) {
  current = lang
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((l) => l())
}

async function load(lang: Lang, mayReload = true): Promise<boolean> {
  if (loaded[lang]) return true
  try {
    loaded[lang] = (await loaders[`./${lang}/index.ts`]()).default
    return true
  } catch {
    // Online but the file is gone: a new version was deployed while the app was open (its files have new names).
    // Load the new version, once a session; offline, the app just stays as it is.
    if (mayReload && typeof navigator !== 'undefined' && navigator.onLine) reloadOnce()
    return false
  }
}

/** Reloads the app for a new version, at most once a session (never a loop). */
function reloadOnce(): void {
  try {
    if (sessionStorage.getItem(RELOADED)) return
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    return
  }
  window.location.reload()
}

/**
 * Start-up: the language chosen on this phone before (English until its words arrive). Offline at start: tried again
 * when the phone is back online, unless another language was chosen meanwhile.
 */
export async function restoreLanguage(retry = false): Promise<void> {
  const saved = storage.get(KEY)
  if (!isLang(saved)) return
  chosen = true
  const mine = choice
  // Never reloads when trying again after being offline: the person may be typing
  if (await load(saved, !retry)) {
    if (choice === mine) show(saved)
    return
  }
  if (typeof window === 'undefined') return
  const again = () => {
    window.removeEventListener('online', again)
    if (choice === mine) void restoreLanguage(true)
  }
  window.addEventListener('online', again)
}

/**
 * Changes the language, at once and for next time. False when its words couldn't be downloaded (offline): the app
 * stays in the language it was in.
 */
export async function setLanguage(lang: Lang): Promise<boolean> {
  const mine = ++choice
  if (!(await load(lang))) {
    if (choice === mine) choice-- // a choice that couldn't download doesn't cancel the saved one coming back
    return false
  }
  if (choice !== mine) return true // a later choice was made while this one downloaded
  chosen = true
  storage.set(KEY, lang)
  show(lang)
  return true
}

export function language(): Lang {
  return current
}

/** Whether a language was ever chosen on this phone (else the first screen asks). */
export function languageChosen(): boolean {
  return chosen
}

function lookup(lang: Lang, key: string): string | Plural | undefined {
  const dot = key.indexOf('.')
  return loaded[lang]?.[key.slice(0, dot)]?.[key.slice(dot + 1)]
}

function fill(text: string, vars: Vars | undefined): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name]
    // Numbers print as they are (digits 0-9, no grouping): as on bills, packs and phones
    return v === undefined ? whole : String(v)
  })
}


function pick(entry: string | Plural, vars: Vars | undefined, lang: Lang): string {
  if (typeof entry === 'string') return entry
  const count = typeof vars?.count === 'number' ? vars.count : 0
  return entry[new Intl.PluralRules(lang).select(count)] ?? entry.other
}

/**
 * The text for a key in the current language; in English when the language lacks it; else {@code fallback} (the
 * backend's own message for a code the app doesn't know), else the key itself.
 */
export function t(key: string, vars?: Vars, fallback?: string): string {
  const mine = lookup(current, key)
  if (mine !== undefined) return fill(pick(mine, vars, current), vars)
  const en = lookup('en', key)
  if (en !== undefined) return fill(pick(en, vars, 'en'), vars)
  return fallback ?? key
}

/** A text in English whatever the language: for words saved as data (a tapped reason), shown later via {@link shownAs}. */
export function inEnglish(key: string, vars?: Vars): string {
  const en = lookup('en', key)
  return en === undefined ? key : fill(pick(en, vars, 'en'), vars)
}

/** Saved English words in the current language when they are exactly one of these keys' English, else as saved. */
export function shownAs(saved: string, keys: readonly string[]): string {
  const key = keys.find((k) => inEnglish(k) === saved)
  return key === undefined ? saved : t(key)
}

/** Whether there are words for this key (in English at least). */
export function hasText(key: string): boolean {
  return lookup('en', key) !== undefined
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * In a component: {@code const t = useT()}. The component is drawn again when the language changes; what the person
 * typed stays.
 */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, language, () => 'en' as Lang)
  return t
}

/** The current language, for a component that shows or changes it. */
export function useLanguage(): Lang {
  return useSyncExternalStore(subscribe, language, () => 'en' as Lang)
}

/** Tests only: back to English with nothing chosen. */
export function resetLanguageForTests(): void {
  chosen = false
  choice++
  show('en')
}

/** Tests only: a language's words without a download. */
export function provideForTests(lang: Lang, messages: Messages): void {
  loaded[lang] = messages
}
