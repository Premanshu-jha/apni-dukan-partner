import { CapacitorUpdater, AppUpdateAvailability, AppUpdateResultCode, FlexibleUpdateInstallStatus } from '@capgo/capacitor-updater'
import { App as CapApp } from '@capacitor/app'
import { useSyncExternalStore } from 'react'
import { API_URL } from '../api/client'
import { AppSettings, type NativeInfo } from './appSettings'
import { isApp } from './platform'

/**
 * The Play Store app keeping itself up to date (nothing on the website: its service worker does that, swUpdate.ts).
 * See "App updates" in the README.
 *
 * Screens (live updates): on every start, every 10 minutes while the app is on screen, and whenever it comes back
 * after half an hour, the app asks the backend (GET /api/v1/app-updates/partner) which screens to use. A newer bundle
 * is downloaded quietly (Capgo's updater checks it was signed with our key) and used from the next time the app is
 * opened, or when it comes back after being left for 5 minutes (Home, another app, the screen off), on the same
 * screen, after one more quick look that it wasn't pulled back meanwhile: never in the middle of what someone is
 * doing, and nothing is shown for it. Only a release the super admin (or CI, for an [urgent] PR) marked urgent shows
 * a banner once it is downloaded: "A fix is ready", with Restart (switch now, staying on this screen) and Later. New
 * screens that don't come up (the app's first screen never drawn within 10 s: `markScreensWorking` not called) go back
 * to the previous ones by themselves, and that bundle is never downloaded again on this phone; nor is one that failed
 * to download three times.
 *
 * The app itself (Google Play): when the backend says this version is too old ("updateRequired"), a full screen asks
 * to update (Google's own update screen) and nothing else can be used. It is shown when the app is opened, never in
 * the middle of something. Otherwise, when Google has a newer version, a small banner offers it: it downloads while
 * the app is used, then "Restart" installs it.
 */

const APP = 'partner'
/** The bundle to switch to when the app is next opened: {"id": "<bundle id>", "build": "<build>"} or {"builtin": true}. */
const PENDING = 'clozest.screens.next'
/** Builds that failed on this phone: started and didn't come up, or failed to download (with the tries). */
const FAILED = 'clozest.screens.failed'
const TRIES = 'clozest.screens.tries'
/** The day (phone's date) this phone was last counted in the admin's App versions (one check a day says first=true). */
const COUNTED = 'clozest.updates.counted'
const MAX_TRIES = 3
/** Asking again when the app comes back to the screen, at most this often (after an answer; at once after a failure). */
const AGAIN_AFTER_MS = 30 * 60 * 1000
/** While the app is on screen: asked this often, so an urgent fix reaches someone using it all day. */
const WHILE_OPEN_MS = 10 * 60 * 1000
/** Left this long (in the background) with new screens ready: switched to them when it comes back. */
const LEFT_MS = 5 * 60 * 1000
/** The screen to come back to after switching ({"path", "at"}): read once at start, within a minute. */
const RESUME = 'clozest.screens.resume'
/** Screens never switched under, whatever is on them (paying: the checkout's answer would be lost). */
const HOLD_PATHS = ['/subscription']
/** The quick look before switching at start: never longer than this. */
const LOOK_MS = 2000

export type PlayUpdate = 'none' | 'available' | 'downloading' | 'ready'

interface State {
  required: boolean
  play: PlayUpdate
  /** The urgent build whose screens are downloaded (the "A fix is ready" banner); null: none */
  urgent: number | null
  /** Switching to new screens right now: the "Updating the app…" cover */
  switching: boolean
}

let state: State = { required: false, play: 'none', urgent: null, switching: false }
const listeners = new Set<() => void>()

function setState(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether this app is too old to use, and Google Play's update offer. */
export function useAppUpdate(): State {
  return useSyncExternalStore(subscribe, () => state)
}

interface Answer {
  bundle: { build: number; url: string; checksum: string; sessionKey: string } | null
  updateRequired: boolean
  /** The newest urgent release among the screens on offer (null: none urgent); older backends leave it out */
  urgentBuild?: number | null
}

type Pending = { id: string; build: string } | { builtin: true }

/**
 * First thing at start, before the screens show: switches to the screens downloaded last time, if any, after a quick
 * look (at most 2 s) that the backend still offers them (a release pulled back meanwhile is dropped; offline, they are
 * used). True when the app is reloading into them (nothing else should start).
 */
export async function switchScreensAtStart(): Promise<boolean> {
  if (!isApp()) return false
  resumeScreen()
  try {
    const failed = await CapacitorUpdater.getFailedUpdate()
    if (failed) remember(FAILED, [...failedBuilds(), failed.bundle.version].slice(-20))
    const next = readPending()
    if (!next) return false
    localStorage.removeItem(PENDING) // once: a switch that fails never loops
    const current = await CapacitorUpdater.current()
    if ('builtin' in next) {
      if (current.bundle.id === 'builtin') return false
      // Back to the app's own screens only when the backend says so now (offline or busy: keep these)
      const look = await ask(await AppSettings.nativeInfo(), LOOK_MS, false).catch(() => null)
      if (!look || look.bundle) return false
      keepScreen()
      await CapacitorUpdater.reset({ toLastSuccessful: false })
      return true
    }
    if (current.bundle.id === next.id) return false
    const { bundles } = await CapacitorUpdater.list()
    if (!bundles.some((b) => b.id === next.id && usable(b.status))) return false
    const answer = await ask(await AppSettings.nativeInfo(), LOOK_MS, false).catch(() => null)
    // Answered with other screens (pulled back, or a newer one): the check after start prepares those instead
    if (answer && String(answer.bundle?.build ?? '') !== next.build) return false
    keepScreen()
    await CapacitorUpdater.set({ id: next.id })
    return true
  } catch {
    return false // the screens the app has keep working
  }
}

/**
 * Called once the app's first screen has been drawn: these screens work, so the updater keeps them (without it they
 * are replaced by the previous ones after 10 s).
 */
export function markScreensWorking() {
  if (!isApp()) return
  void CapacitorUpdater.notifyAppReady().catch(() => {})
}

let started = false
let lastAsked = 0
/** The last check that failed (offline, busy): the checks while open wait 10 minutes after it too. */
let lastFailed = 0
let asking = false
/** "Later" on the banner: for this urgent build (a newer urgent fix shows it again). */
let laterFor: number | null = null
let firstCheck = true
/** When the app went to the background (0: it is on screen). */
let leftAt = 0
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Starts the checks: now, every 10 minutes while the app is on screen, and each time it comes back after half an
 * hour. Coming back after 5 minutes away with new screens ready switches to them (on the same screen).
 */
export function startAppUpdates() {
  if (!isApp() || started) return
  started = true
  void check()
  timer = setInterval(() => {
    if (leftAt === 0 && !asking && Date.now() - Math.max(lastAsked, lastFailed) >= WHILE_OPEN_MS) void check()
  }, 60_000)
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      leftAt = Date.now()
      return
    }
    const away = leftAt ? Date.now() - leftAt : 0
    leftAt = 0
    // Back after 5 minutes away with new screens ready: switched, unless something is open on this screen
    if (away >= LEFT_MS && readPending() && idle()) {
      void switchNow()
      return
    }
    if (Date.now() - lastAsked > AGAIN_AFTER_MS) void check()
    // Google's download may have finished while the app was away (its events only come to the app that started it)
    else if (state.play === 'downloading') void offerPlayUpdate().catch(() => {})
  })
  void CapacitorUpdater.addListener('onFlexibleUpdateStateChange', ({ installStatus }) => {
    if (installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) setState({ play: 'ready' })
    else if (installStatus === FlexibleUpdateInstallStatus.DOWNLOADING) setState({ play: 'downloading' })
    else if (
      installStatus === FlexibleUpdateInstallStatus.FAILED ||
      installStatus === FlexibleUpdateInstallStatus.CANCELED
    ) {
      setState({ play: 'available' })
    }
  })
}

/** Asks again now (the "Please update" screen's Check again, and the regular checks). */
export async function check() {
  if (asking) return
  asking = true
  try {
    const info = await AppSettings.nativeInfo()
    // Only the check when the app is opened may bring "Please update" (offline then: the next opening's will)
    const opening = firstCheck
    firstCheck = false
    const answer = await ask(info)
    lastAsked = Date.now()
    if (answer) {
      // "Please update" comes when the app is opened (the first check) or from its own Check again, never over a
      // screen someone is using; it goes away at once when no longer needed
      if (!answer.updateRequired || opening || state.required) setState({ required: answer.updateRequired })
      if (info.updatesSigned) {
        await prepare(answer.bundle)
        setState({ urgent: await urgentReady(answer, info) })
      }
      lastFailed = 0
    }
    if (!info.debug && !state.required) await offerPlayUpdate()
  } catch {
    // Offline, or the backend busy: the app works as it is, and asks again as soon as it comes back to the screen
    // (and, while open, 10 minutes from now: never every minute while the backend struggles)
    lastAsked = 0
    lastFailed = Date.now()
  } finally {
    asking = false
  }
}

/** A first=true check is on its way (two checks at start must not both count this phone). */
let counting = false

/** @param mayCount the regular check (not the quick look before switching, which gives up after 2 s) */
async function ask(info: NativeInfo, timeoutMs = 15000, mayCount = true): Promise<Answer | null> {
  const day = today()
  // Only the regular check says first=true: a quick look cut off after 2 s may have been counted already
  const first = mayCount && !counting && countedDay() !== day
  if (first) counting = true
  const query =
    `nativeLevel=${info.nativeLevel}&versionCode=${info.versionCode}&debug=${info.debug}` + (first ? '&first=true' : '')
  // A timer of our own (AbortSignal.timeout is missing from older Android web views)
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_URL}/api/v1/app-updates/${APP}?${query}`, { cache: 'no-store', signal: stop.signal })
    if (!res.ok) throw new Error(`update check: ${res.status}`)
    // Counted for today only once the backend has answered (a failed check is tried again, still as the first)
    if (first) {
      try {
        localStorage.setItem(COUNTED, day)
      } catch {
        // storage off: counted again on the next check, at most once per start
      }
    }
    return (await res.json()) as Answer
  } finally {
    clearTimeout(timer)
    if (first) counting = false
  }
}

function countedDay(): string | null {
  try {
    return localStorage.getItem(COUNTED)
  } catch {
    return null
  }
}

/** The phone's date, yyyy-mm-dd. */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Downloads the screens to use from the next start (or marks going back to the app's own). */
async function prepare(bundle: Answer['bundle']) {
  const current = await CapacitorUpdater.current()
  if (!bundle) {
    if (current.bundle.id === 'builtin') localStorage.removeItem(PENDING)
    else remember(PENDING, { builtin: true })
    return
  }
  const version = String(bundle.build)
  if (current.bundle.version === version) {
    localStorage.removeItem(PENDING)
    return
  }
  if (failedBuilds().includes(version)) return
  const { bundles } = await CapacitorUpdater.list()
  // A downloaded bundle stays "pending" until it has run once
  const have = bundles.find((b) => b.version === version && usable(b.status))
  let downloaded = have
  if (!downloaded) {
    const tries = triesOf(version)
    if (tries >= MAX_TRIES) return
    remember(TRIES, { version, tries: tries + 1 })
    downloaded = await CapacitorUpdater.download({
      url: bundle.url,
      version,
      checksum: bundle.checksum,
      sessionKey: bundle.sessionKey,
    })
  }
  remember(PENDING, { id: downloaded.id, build: version })
}

/**
 * Switches to the screens downloaded (the banner's Restart, or coming back after 5 minutes away): after a quick look
 * that they are still offered, the app reloads into them on the screen it was on, under an "Updating the app…" cover.
 * Returns false when nothing could be switched to (the banner then goes away).
 */
export async function switchNow(): Promise<boolean> {
  const next = readPending()
  if (!next) return false
  setState({ switching: true })
  try {
    const current = await CapacitorUpdater.current()
    const answer = await ask(await AppSettings.nativeInfo(), LOOK_MS, false).catch(() => null)
    if ('builtin' in next) {
      // Back to the app's own screens only when the backend says so now
      if (current.bundle.id === 'builtin' || !answer || answer.bundle) {
        if (current.bundle.id === 'builtin' || answer?.bundle) localStorage.removeItem(PENDING)
        return done(false)
      }
      localStorage.removeItem(PENDING)
      keepScreen()
      await CapacitorUpdater.reset({ toLastSuccessful: false })
      return true
    }
    if (current.bundle.id === next.id) {
      localStorage.removeItem(PENDING)
      return done(false)
    }
    const { bundles } = await CapacitorUpdater.list()
    if (!bundles.some((b) => b.id === next.id && usable(b.status))) {
      localStorage.removeItem(PENDING)
      return done(false)
    }
    if (answer && String(answer.bundle?.build ?? '') !== next.build) {
      // Pulled back or replaced meanwhile: get the right ones instead, and use them next time
      void check()
      return done(false)
    }
    localStorage.removeItem(PENDING) // once: a switch that fails never loops
    keepScreen()
    await CapacitorUpdater.set({ id: next.id })
    return true
  } catch {
    return done(false) // the screens the app has keep working
  }
}

function done(switched: boolean): boolean {
  setState({ switching: false, ...(switched ? {} : { urgent: null }) })
  return switched
}

/**
 * Nothing on this screen would be lost by reloading it: no sheet or dialog open, nothing typed in a text field, no
 * payment's checkout (Razorpay's sheet, or the Subscription screen at all). Otherwise the new screens wait for the
 * next start.
 */
export function idle(): boolean {
  if (typeof document === 'undefined') return true
  if (HOLD_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) return false
  if (document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]')) return false
  // A checkout's sheet (Razorpay's frame) on screen; a hidden frame left behind after it closed doesn't count
  for (const frame of document.querySelectorAll('iframe')) {
    const box = frame.getBoundingClientRect()
    if (box.width > 0 && box.height > 0 && getComputedStyle(frame).visibility !== 'hidden') return false
  }
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    const type = (el as HTMLInputElement).type
    if (el instanceof HTMLInputElement && !['text', 'tel', 'email', 'number', 'search', 'url', ''].includes(type)) continue
    if (!el.readOnly && !el.disabled && el.value.trim() !== '') return false
  }
  return true
}

/** "Later" on Google Play's banner: until the next start, whatever banner shows meanwhile. */
let playLater = false

export function playUpdateLater(): boolean {
  return playLater
}

export function laterForPlay() {
  playLater = true
  setState({}) // a new state object, so the banner draws again (without itself)
}

/** Hides the banner for this urgent fix (Later); a newer urgent fix shows it again. */
export function laterForFix() {
  laterFor = state.urgent
  setState({ urgent: null })
}

/** The urgent build whose fix the downloaded screens carry and these screens don't (null: none, or put off). */
async function urgentReady(answer: Answer, info: NativeInfo): Promise<number | null> {
  const urgent = answer.urgentBuild
  const next = readPending()
  if (!urgent || !answer.bundle || !next || 'builtin' in next || next.build !== String(answer.bundle.build)) return null
  if (laterFor !== null && urgent <= laterFor) return null
  const current = await CapacitorUpdater.current()
  const have = current.bundle.id === 'builtin' ? info.versionCode : Number(current.bundle.version)
  return Number.isFinite(have) && have < urgent ? urgent : null
}

/** Before reloading into other screens: the screen to come back to. */
function keepScreen() {
  try {
    localStorage.setItem(RESUME, JSON.stringify({ path: location.pathname + location.search + location.hash, at: Date.now() }))
  } catch {
    // storage off: the app opens on its first screen
  }
}

/** At start: back on the screen the app was on before switching (only a minute after, and only once). */
function resumeScreen() {
  try {
    const v = JSON.parse(localStorage.getItem(RESUME) ?? 'null') as { path?: unknown; at?: unknown } | null
    localStorage.removeItem(RESUME)
    if (!v || typeof v.path !== 'string' || typeof v.at !== 'number' || Date.now() - v.at > 60_000) return
    // Only a path of this app (never another site's address)
    if (!v.path.startsWith('/') || v.path.startsWith('//')) return
    history.replaceState(null, '', v.path)
  } catch {
    // nothing to come back to
  }
}

function usable(status: string): boolean {
  return status === 'pending' || status === 'success'
}

/** Google Play has a newer version: the banner offers it (only when Google lets it download in the background). */
async function offerPlayUpdate() {
  const info = await CapacitorUpdater.getAppUpdateInfo()
  if (info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
    setState({ play: 'ready' })
  } else if (
    info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADING ||
    info.installStatus === FlexibleUpdateInstallStatus.PENDING
  ) {
    setState({ play: 'downloading' })
  } else if (info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE && info.flexibleUpdateAllowed) {
    setState({ play: 'available' })
  } else if (state.play === 'downloading') {
    // Google's download stopped while the app was away and can't be started again from here: no banner
    setState({ play: 'none' })
  }
}

/** The banner's "Update": Google downloads it while the app is used (or the person said no: offered again). */
export async function startPlayUpdate() {
  setState({ play: 'downloading' })
  try {
    const result = await CapacitorUpdater.startFlexibleUpdate()
    if (result.code !== AppUpdateResultCode.OK) setState({ play: 'available' })
  } catch {
    setState({ play: 'available' })
  }
}

/** The banner's "Restart": Google installs the downloaded version and opens the app again. */
export async function finishPlayUpdate() {
  await CapacitorUpdater.completeFlexibleUpdate().catch(() => {})
}

/**
 * The "Please update" screen's button: Google's full-screen update; if Google can't (no update for this phone yet,
 * or it failed), the app's page in the Play Store. The person saying no to Google's screen stays here.
 */
export async function updateFromPlay() {
  try {
    const info = await CapacitorUpdater.getAppUpdateInfo()
    if (info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE && info.immediateUpdateAllowed) {
      const result = await CapacitorUpdater.performImmediateUpdate()
      if (result.code === AppUpdateResultCode.OK || result.code === AppUpdateResultCode.CANCELED) return
    }
  } catch {
    // Falls through to the store page
  }
  await CapacitorUpdater.openAppStore().catch(() => {})
}

function readPending(): Pending | null {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING) ?? 'null') as unknown
    if (v && typeof v === 'object') {
      if ('builtin' in v) return { builtin: true }
      const { id, build } = v as { id?: unknown; build?: unknown }
      if (typeof id === 'string' && typeof build === 'string') return { id, build }
    }
  } catch {
    // unreadable: treated as none
  }
  return null
}

function failedBuilds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAILED) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function triesOf(version: string): number {
  try {
    const v = JSON.parse(localStorage.getItem(TRIES) ?? 'null') as { version?: unknown; tries?: unknown } | null
    return v && v.version === version && typeof v.tries === 'number' ? v.tries : 0
  } catch {
    return 0
  }
}

function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or off: the next start asks again
  }
}

/** For tests: back to the start. */
export function resetAppUpdates() {
  state = { required: false, play: 'none', urgent: null, switching: false }
  laterFor = null
  playLater = false
  lastFailed = 0
  started = false
  lastAsked = 0
  asking = false
  firstCheck = true
  counting = false
  leftAt = 0
  if (timer) clearInterval(timer)
  timer = null
}
