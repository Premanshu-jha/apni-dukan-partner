import { kiranaOn } from '../lib/config'
import { addAreas, areasReady, type Lang, type Messages } from './index'

/**
 * The kiranas' words (src/i18n/<language>/kirana*.json), only in a build with the kirana switch on: main.tsx calls
 * {@link startKiranaTexts}, which adds them when `kiranaOn()`. Off, nothing here is ever downloaded, and the salon app's own downloads
 * (English in the main one, each language's own) carry no kirana word.
 *
 * Each language's kirana files are one download of their own (./<language>/kirana.ts): English's at start-up, another
 * language's together with that language. kiranaErrors.json adds its codes to `error` and kiranaServer.json its
 * backend messages to `server`, so `error.<CODE>` and `server.<message>` are asked for as for any other.
 */
const bundles = import.meta.glob<{ default: Messages }>('./*/kirana.ts')

/** Shared area files that a kirana file adds its keys to (the rest are areas of their own: kiranaCounter…). */
const INTO: Record<string, string> = { kiranaErrors: 'error', kiranaServer: 'server' }

/** One language's kirana files ('./kiranaCounter.json' → texts) as areas. */
export function kiranaAreas(files: Record<string, unknown>): Messages {
  const out: Messages = {}
  for (const [path, content] of Object.entries(files)) {
    const name = path.slice(path.lastIndexOf('/') + 1, -5)
    const area = INTO[name] ?? name
    out[area] = { ...out[area], ...(content as Messages[string]) }
  }
  return out
}

/** A language's kirana words (its own download). */
export async function kiranaTexts(lang: Lang): Promise<Messages> {
  return (await bundles[`./${lang}/kirana.ts`]()).default
}

/** Every language gets the kiranas' words (English's start downloading now): resolves when English's are in. */
export function addKiranaTexts(): Promise<void> {
  return addAreas(kiranaTexts)
}

/**
 * Start-up (before restoreLanguage, so a language comes with its kirana words): with the kirana switch on, adds them;
 * off, nothing. A failed download is tried again by the first kirana screen ({@link kiranaTextsReady}).
 */
export function startKiranaTexts(): void {
  if (kiranaOn()) addKiranaTexts().catch(() => {})
}

/**
 * Resolves once the kiranas' English words are in (at once with the switch off, when no kirana screen exists): every
 * kirana screen's download waits for it, so it is never drawn with keys instead of words.
 */
export function kiranaTextsReady(): Promise<void> {
  return areasReady()
}

/** A kirana screen's download, ready only once the kiranas' words are in too (both download at once). */
export function withKiranaTexts<T>(screen: Promise<T>): Promise<T> {
  return Promise.all([screen, kiranaTextsReady()]).then(([loaded]) => loaded)
}
