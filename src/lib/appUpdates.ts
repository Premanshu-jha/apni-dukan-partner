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
 * Screens (live updates): on every start and whenever it comes back after half an hour, the app asks the backend
 * (GET /api/v1/app-updates/partner) which screens to use. A newer bundle is downloaded quietly (Capgo's updater
 * checks it was signed with our key) and used from the next time the app is opened, after one more quick look that
 * it wasn't pulled back meanwhile: never in the middle of what someone is doing, and nothing is shown for it. New
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
const MAX_TRIES = 3
/** Asking again when the app comes back to the screen, at most this often (after an answer; at once after a failure). */
const AGAIN_AFTER_MS = 30 * 60 * 1000
/** The quick look before switching at start: never longer than this. */
const LOOK_MS = 2000

export type PlayUpdate = 'none' | 'available' | 'downloading' | 'ready'

interface State {
  required: boolean
  play: PlayUpdate
}

let state: State = { required: false, play: 'none' }
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
}

type Pending = { id: string; build: string } | { builtin: true }

/**
 * First thing at start, before the screens show: switches to the screens downloaded last time, if any, after a quick
 * look (at most 2 s) that the backend still offers them (a release pulled back meanwhile is dropped; offline, they are
 * used). True when the app is reloading into them (nothing else should start).
 */
export async function switchScreensAtStart(): Promise<boolean> {
  if (!isApp()) return false
  try {
    const failed = await CapacitorUpdater.getFailedUpdate()
    if (failed) remember(FAILED, [...failedBuilds(), failed.bundle.version].slice(-20))
    const next = readPending()
    if (!next) return false
    localStorage.removeItem(PENDING) // once: a switch that fails never loops
    const current = await CapacitorUpdater.current()
    if ('builtin' in next) {
      if (current.bundle.id === 'builtin') return false
      await CapacitorUpdater.reset({ toLastSuccessful: false })
      return true
    }
    if (current.bundle.id === next.id) return false
    const { bundles } = await CapacitorUpdater.list()
    if (!bundles.some((b) => b.id === next.id && usable(b.status))) return false
    const answer = await ask(await AppSettings.nativeInfo(), LOOK_MS).catch(() => null)
    // Answered with other screens (pulled back, or a newer one): the check after start prepares those instead
    if (answer && String(answer.bundle?.build ?? '') !== next.build) return false
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
let asking = false
let firstCheck = true

/** Starts the checks: now, and each time the app comes back to the screen after half an hour. */
export function startAppUpdates() {
  if (!isApp() || started) return
  started = true
  void check()
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return
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
      if (info.updatesSigned) await prepare(answer.bundle)
    }
    if (!info.debug && !state.required) await offerPlayUpdate()
  } catch {
    // Offline, or the backend busy: the app works as it is, and asks again as soon as it comes back to the screen
    lastAsked = 0
  } finally {
    asking = false
  }
}

async function ask(info: NativeInfo, timeoutMs = 15000): Promise<Answer | null> {
  const query = `nativeLevel=${info.nativeLevel}&versionCode=${info.versionCode}&debug=${info.debug}`
  // A timer of our own (AbortSignal.timeout is missing from older Android web views)
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_URL}/api/v1/app-updates/${APP}?${query}`, { cache: 'no-store', signal: stop.signal })
    if (!res.ok) throw new Error(`update check: ${res.status}`)
    return (await res.json()) as Answer
  } finally {
    clearTimeout(timer)
  }
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
  state = { required: false, play: 'none' }
  started = false
  lastAsked = 0
  asking = false
  firstCheck = true
}
