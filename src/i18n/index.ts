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
/** The chosen language's texts, kept on the phone: a cold start shows them at once (no English first). */
const TEXTS = 'language.texts'
/** Each account's own language on a shared phone. */
const accountKey = (userId: string) => `language:${userId}`
/** A language chosen on this phone for an account and not yet saved on the account (sent by ./sync). */
export const unsyncedKey = (userId: string) => `language.unsynced:${userId}`
const english: Messages = {}
for (const [path, content] of Object.entries(
  // Not the areas some builds add ({@link addAreas}: kirana*.json, only with the kirana switch on)
  import.meta.glob<Messages[string]>(['./en/*.json', '!./en/kirana*.json'], { eager: true, import: 'default' }),
)) {
  english[path.slice(5, -5)] = content
}
const loaders = import.meta.glob<{ default: Messages }>('./{hi,te,mr,ta,kn}/index.ts')
const loaded: Partial<Record<Lang, Messages>> = { en: english }

/**
 * The texts of areas only some builds have (a part of the app behind a build-time switch), for one language: area →
 * texts. An area the app already has (error, server) gets these keys added to its own.
 */
export type AreaLoader = (lang: Lang) => Promise<Messages>
/** Set by {@link addAreas}: null in a build that adds none. */
let extraAreas: AreaLoader | null = null
/** English's added areas: downloading or in (null: not asked for yet, or the download failed). */
let englishAreas: Promise<void> | null = null

function merge(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base }
  for (const [area, entries] of Object.entries(extra)) out[area] = { ...base[area], ...entries }
  return out
}

/**
 * Adds areas to every language, from their own downloads (call it at start-up, before {@link restoreLanguage}):
 * English's start downloading at once; each other language's come in the same load as the language (so a language is
 * shown with them or not at all, and its copy kept on the phone has them too). Resolves when English's are in.
 */
export function addAreas(loader: AreaLoader): Promise<void> {
  extraAreas = loader
  englishAreas = null
  return areasReady()
}

/**
 * Resolves once the added areas' English texts are in (at once when none were added): awaited before a screen that
 * uses them is drawn, so it never shows a key. Rejects when they couldn't download; asking again tries again.
 */
export function areasReady(): Promise<void> {
  const loader = extraAreas
  if (!loader) return Promise.resolve()
  englishAreas ??= loader('en').then(
    (extra) => {
      loaded.en = merge(loaded.en ?? english, extra)
      show(current)
    },
    (error: unknown) => {
      englishAreas = null
      throw error
    },
  )
  return englishAreas
}

/** Languages whose texts came from this version's download (not only the copy kept on the phone). */
const downloaded = new Set<Lang>(['en'])

let current: Lang = 'en'
/** Goes up on every show: the same language's fresher texts (the download after the kept copy) redraw too. */
let shown = 0
let chosen = false
/** Bumped by each choice: a slower download started earlier never overrides a later choice. */
let choice = 0
/** Choices still downloading. */
let changing = 0
const listeners = new Set<() => void>()
const RELOADED = 'language.reloaded'

/** The account signed in on this phone (null: nobody), set by {@link setAccount}. */
let account: string | null = null
/**
 * The language chosen on this phone while signed out (the first screen, sign-in's Change, About), left for the next
 * account to sign in: it is the phone's, and the account gets it only when it has no language of its own yet (the
 * account's own language wins: a helper setting up the phone, or someone before on a shared phone, doesn't change
 * it). Once signed in, a change is the account's ({@link setLanguage}).
 */
let pickedSignedOut: 'shown' | null = null
/** Told when the signed-in account's language changes (to save it on the account: {@link onAccountLanguage}). */
let accountListener: ((userId: string, lang: Lang) => void) | null = null

export function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((l) => l.code === value)
}

function show(lang: Lang) {
  current = lang
  shown++
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  listeners.forEach((l) => l())
}

async function load(lang: Lang, mayReload = true): Promise<boolean> {
  if (downloaded.has(lang)) return true
  try {
    const [own, extra] = await Promise.all([loaders[`./${lang}/index.ts`](), extraAreas?.(lang)])
    loaded[lang] = extra ? merge(own.default, extra) : own.default
    downloaded.add(lang)
    return true
  } catch {
    // Online but the file is gone: a new version was deployed while the app was open (its files have new names).
    // Load the new version, once a session; offline, the app just stays as it is.
    if (mayReload && typeof navigator !== 'undefined' && navigator.onLine) reloadOnce()
    // The copy kept on the phone will do until the download works
    return loaded[lang] !== undefined
  }
}

/** Keeps the shown language's downloaded texts on the phone for the next cold start (English is in the app). */
function keepTexts(lang: Lang): void {
  if (lang === 'en') storage.remove(TEXTS)
  else if (downloaded.has(lang)) storage.setJson(TEXTS, { lang, messages: loaded[lang] })
}

function keptTexts(lang: Lang): Messages | null {
  const kept = storage.getJson<{ lang?: unknown; messages?: unknown }>(TEXTS)
  return kept?.lang === lang && kept.messages && typeof kept.messages === 'object' ? (kept.messages as Messages) : null
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

/** The phone's own language when the app has it (first open, nothing chosen yet): "hi-IN" → Hindi. */
export function browserLanguage(): Lang | null {
  if (typeof navigator === 'undefined') return null
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of wanted) {
    const code = (tag ?? '').toLowerCase().split('-')[0]
    if (isLang(code)) return code
  }
  return null
}

/**
 * Start-up: the language chosen on this phone before, shown at once from the texts kept on the phone (then refreshed
 * by the download). Offline at start with nothing kept: tried again when the phone is back online, unless another
 * language was chosen meanwhile. Nothing chosen yet: the phone's own language if the app has it (the sign-in screen
 * still offers the others, and keeps the one showing).
 */
export async function restoreLanguage(retry = false): Promise<void> {
  const saved = storage.get(KEY)
  const mine = choice
  if (!isLang(saved)) {
    const guess = retry ? null : browserLanguage()
    if (guess && guess !== 'en' && (await load(guess, false)) && choice === mine && !chosen) show(guess)
    return
  }
  chosen = true
  if (!retry && saved !== 'en') {
    const kept = keptTexts(saved)
    if (kept && !loaded[saved]) {
      loaded[saved] = kept
      show(saved)
    }
  }
  // Never reloads when trying again after being offline: the person may be typing
  if (await load(saved, !retry)) {
    if (choice === mine) {
      show(saved)
      keepTexts(saved)
    }
    if (downloaded.has(saved)) return
  }
  if (typeof window === 'undefined') return
  const again = () => {
    window.removeEventListener('online', again)
    if (choice === mine) void restoreLanguage(true)
  }
  window.addEventListener('online', again)
}

/**
 * Downloads and shows a language and keeps it as this phone's choice: 'failed' when it couldn't be downloaded,
 * 'later' when another choice was made while it downloaded (that one stands).
 */
async function change(lang: Lang): Promise<'done' | 'failed' | 'later'> {
  const mine = ++choice
  changing++
  const ok = await load(lang).finally(() => changing--)
  if (!ok) {
    // A choice that couldn't download doesn't cancel the saved one coming back; but an earlier choice still
    // downloading stays cancelled (the person tapped past it)
    if (choice === mine && changing === 0) choice--
    return 'failed'
  }
  if (choice !== mine) return 'later'
  chosen = true
  storage.set(KEY, lang)
  show(lang)
  keepTexts(lang)
  return 'done'
}

/**
 * Changes the language, at once and for next time: on this phone and, signed in, for this account (the account's
 * own choice on a shared phone, and saved on the account so its messages come in it). False when its words couldn't
 * be downloaded (offline): the app stays in the language it was in.
 */
export async function setLanguage(lang: Lang): Promise<boolean> {
  const done = await change(lang)
  if (done !== 'done') return done === 'later'
  if (account) {
    storage.set(accountKey(account), lang)
    accountListener?.(account, lang)
  } else {
    pickedSignedOut = 'shown'
  }
  return true
}

/**
 * Signing in with the phone's own language showing (nothing chosen yet): that language is kept as this phone's
 * choice now (the next start and the offline page show it), and the account signing in gets it unless it already
 * has a language of its own. Nothing happens when a language was already chosen.
 */
export function keepShownLanguage(): void {
  if (chosen) return
  choice++ // a guess still downloading doesn't replace what was on screen
  chosen = true
  storage.set(KEY, current)
  keepTexts(current)
  if (!account) pickedSignedOut = 'shown'
}

/**
 * Who is signed in on this phone (null: signed out); call it on every sign-in and at start-up. Which language the
 * account gets, first that applies:
 *  1. one chosen on this phone for this account and not yet saved on it (`language.unsynced:<id>`): it stays, and
 *     ./sync sends it;
 *  2. the one saved on the account ({@code saved}, from /me): the account's truth, also over this phone's own
 *     `language:<id>` (stale when it was changed on another phone since); nothing is sent;
 *  3. the account has none yet: the language chosen on this phone while signed out just now, else this account's
 *     last one on this phone, else the phone's choice (the saved choice, never what happens to show while its words
 *     still download). It is saved on the account, once: after that the account has one.
 * Nothing chosen anywhere: nothing changes and nothing is sent. {@link onAccountLanguage} is told only for 3, so
 * two phones with different languages never send theirs back and forth at every start.
 */
export async function setAccount(userId: string | null, saved?: string | null): Promise<void> {
  if (userId === account) return
  account = userId
  const picked = pickedSignedOut
  pickedSignedOut = null
  if (!userId) return
  const server = isLang(saved) ? saved : null
  const pending = storage.get(unsyncedKey(userId))
  const own = storage.get(accountKey(userId))
  const phone = storage.get(KEY)
  let lang: Lang
  let send = false
  if (isLang(pending)) {
    lang = pending
  } else if (server) {
    lang = server
  } else if (picked === 'shown') {
    lang = current
    send = true
  } else if (isLang(own)) {
    lang = own
    send = true
  } else if (chosen && isLang(phone)) {
    lang = phone
    send = true
  } else {
    return
  }
  // Also when it is the one showing: a saved choice still downloading must not replace it afterwards
  if ((await change(lang)) !== 'done' || account !== userId) return
  storage.set(accountKey(userId), lang)
  if (send) accountListener?.(userId, lang)
}

/** The signed-in account's language changed (or was never saved on it): save it there. One listener. */
export function onAccountLanguage(listener: ((userId: string, lang: Lang) => void) | null): void {
  accountListener = listener
}

export function language(): Lang {
  return current
}

/**
 * The check's own words in the app's language where Cloudflare has it (Hindi), else English: never the browser's
 * guess ("auto"), which could be a language the person didn't choose. Telugu, Marathi, Tamil and Kannada aren't
 * offered by Turnstile (developers.cloudflare.com/turnstile/reference/supported-languages).
 */
export function turnstileLanguage(lang: Lang): string {
  return lang === 'hi' ? 'hi' : 'en'
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

/**
 * The space between a link or a bold value and the text after it: none when that text starts with punctuation (a
 * Hindi "।" or a "." never stands apart from the word before it).
 */
export function spaceBefore(next: string): string {
  return /^[\s.,;:!?।)]/.test(next) ? '' : ' '
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
  useSyncExternalStore(subscribe, shownCount, () => 0)
  return t
}

function shownCount(): number {
  return shown
}

/** The current language, for a component that shows or changes it. */
export function useLanguage(): Lang {
  return useSyncExternalStore(subscribe, language, () => 'en' as Lang)
}

/** Tests only: back to English with nothing chosen. */
export function resetLanguageForTests(): void {
  chosen = false
  choice++
  account = null
  pickedSignedOut = null
  show('en')
}

/** Tests only: a language's words without a download. */
export function provideForTests(lang: Lang, messages: Messages): void {
  loaded[lang] = messages
  downloaded.add(lang)
}

/** Tests only: as at a cold start, nothing downloaded but English (a copy kept on the phone is used again). */
export function forgetDownloadsForTests(): void {
  for (const lang of LANGUAGES) {
    if (lang.code !== 'en') {
      delete loaded[lang.code]
      downloaded.delete(lang.code)
    }
  }
}
