import { act, fireEvent, render, screen } from '@testing-library/react'
import { AppUpdateGate } from '../app/AppUpdate'
import {
  check,
  finishPlayUpdate,
  resetAppUpdates,
  startAppUpdates,
  switchScreensAtStart,
  updateFromPlay,
  idle,
  useAppUpdate,
} from './appUpdates'


/** A fake Capgo updater, Play update API and backend, as the Play Store app sees them. */
const fake = vi.hoisted(() => {
  const bundle = (id: string, version: string, status = 'success') =>
    ({ id, version, downloaded: '', checksum: '', status }) as const
  return {
    bundle,
    native: true,
    info: { nativeLevel: 1, versionCode: 240, debug: false, updatesSigned: true },
    answer: { bundle: null, updateRequired: false } as unknown,
    answerStatus: 200,
    offline: false,
    current: bundle('builtin', '240') as { id: string; version: string; status: string },
    bundles: [] as { id: string; version: string; status: string }[],
    failed: null as null | { bundle: { version: string } },
    play: { updateAvailability: 1, flexibleUpdateAllowed: true, immediateUpdateAllowed: true, installStatus: 0 },
    listeners: new Map<string, (arg: unknown) => void>(),
    appListeners: new Map<string, (arg: unknown) => void>(),
    calls: [] as string[],
    fetched: [] as string[],
    downloadFails: false,
    flexibleCode: 0,
    immediateCode: 0,
  }
})

vi.mock('./platform', () => ({ isApp: () => fake.native }))
vi.mock('../api/client', () => ({ API_URL: 'https://api.test' }))
vi.mock('./appSettings', () => ({ AppSettings: { nativeInfo: async () => fake.info } }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (name: string, fn: (arg: unknown) => void) => {
      fake.appListeners.set(name, fn)
      return { remove: async () => {} }
    },
  },
}))
vi.mock('@capgo/capacitor-updater', () => ({
  AppUpdateResultCode: { OK: 0, CANCELED: 1, FAILED: 2, NOT_AVAILABLE: 3, NOT_ALLOWED: 4, INFO_MISSING: 5 },
  AppUpdateAvailability: { UNKNOWN: 0, UPDATE_NOT_AVAILABLE: 1, UPDATE_AVAILABLE: 2, UPDATE_IN_PROGRESS: 3 },
  FlexibleUpdateInstallStatus: {
    UNKNOWN: 0, PENDING: 1, DOWNLOADING: 2, INSTALLING: 3, INSTALLED: 4, FAILED: 5, CANCELED: 6, DOWNLOADED: 11,
  },
  CapacitorUpdater: {
    notifyAppReady: async () => {
      fake.calls.push('ready')
      return { bundle: fake.current }
    },
    getFailedUpdate: async () => fake.failed,
    current: async () => ({ bundle: fake.current, native: '1.0' }),
    list: async () => ({ bundles: fake.bundles }),
    set: async ({ id }: { id: string }) => void fake.calls.push(`set ${id}`),
    reset: async () => void fake.calls.push('reset'),
    download: async (o: { url: string; version: string; checksum: string; sessionKey: string }) => {
      fake.calls.push(`download ${o.version} ${o.url} ${o.checksum} ${o.sessionKey}`)
      if (fake.downloadFails) throw new Error('Checksum failed')
      // As the real updater: a new bundle is "pending" until it has run once
      const b = fake.bundle(`id-${o.version}`, o.version, 'pending')
      fake.bundles.push(b)
      return b
    },
    getAppUpdateInfo: async () => fake.play,
    startFlexibleUpdate: async () => {
      fake.calls.push('flexible')
      return { code: fake.flexibleCode }
    },
    completeFlexibleUpdate: async () => void fake.calls.push('complete'),
    performImmediateUpdate: async () => {
      fake.calls.push('immediate')
      return { code: fake.immediateCode }
    },
    openAppStore: async () => void fake.calls.push('store'),
    addListener: async (name: string, fn: (arg: unknown) => void) => {
      fake.listeners.set(name, fn)
      return { remove: async () => {} }
    },
  },
}))

function liveBundle(build: number) {
  return { build, url: `https://r2.test/${build}.zip`, checksum: `sum${build}`, sessionKey: 'iv:key' }
}

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => await Promise.resolve())
}

beforeEach(() => {
  resetAppUpdates()
  localStorage.clear()
  fake.native = true
  fake.info = { nativeLevel: 1, versionCode: 240, debug: false, updatesSigned: true }
  fake.answer = { bundle: null, updateRequired: false }
  fake.answerStatus = 200
  fake.offline = false
  fake.current = fake.bundle('builtin', '240')
  fake.bundles = []
  fake.failed = null
  fake.play = { updateAvailability: 1, flexibleUpdateAllowed: true, immediateUpdateAllowed: true, installStatus: 0 }
  fake.listeners.clear()
  fake.appListeners.clear()
  fake.calls = []
  fake.fetched = []
  fake.downloadFails = false
  fake.flexibleCode = 0
  fake.immediateCode = 0
  vi.stubGlobal('fetch', async (url: string) => {
    fake.fetched.push(url)
    if (fake.offline) throw new TypeError('offline')
    return new Response(JSON.stringify(fake.answer), { status: fake.answerStatus })
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('screen updates', () => {
  it('asks the backend about this app, downloads a newer bundle and switches to it at the next start', async () => {
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    expect(fake.fetched).toEqual([
      'https://api.test/api/v1/app-updates/partner?nativeLevel=1&versionCode=240&debug=false&first=true',
    ])
    expect(fake.calls).toEqual(['download 250 https://r2.test/250.zip sum250 iv:key'])

    // Nothing changes while the app is in use: the switch happens at the next start, once, after a quick look that
    // the backend still offers it
    expect(await switchScreensAtStart()).toBe(true)
    expect(fake.calls).toContain('set id-250')
    expect(fake.fetched).toHaveLength(2)
    fake.calls = []
    fake.current = fake.bundle('id-250', '250', 'pending')
    expect(await switchScreensAtStart()).toBe(false)
    expect(fake.calls).toEqual([])
  })

  it('says first=true on the first check of the day only, so the admin counts each phone once a day', async () => {
    fake.offline = true
    startAppUpdates()
    await settle()
    // The first check didn't reach the backend: the next one still counts this phone
    fake.offline = false
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    await switchScreensAtStart()
    expect(fake.fetched).toEqual([
      'https://api.test/api/v1/app-updates/partner?nativeLevel=1&versionCode=240&debug=false&first=true',
      'https://api.test/api/v1/app-updates/partner?nativeLevel=1&versionCode=240&debug=false&first=true',
    ])
    // Answered: later checks today aren't counted
    resetAppUpdates()
    startAppUpdates()
    await settle()
    expect(fake.fetched[2]).toBe('https://api.test/api/v1/app-updates/partner?nativeLevel=1&versionCode=240&debug=false')
    // Another day: counted again
    localStorage.setItem('clozest.updates.counted', '2020-01-01')
    resetAppUpdates()
    startAppUpdates()
    await settle()
    expect(fake.fetched[3]).toContain('&first=true')
  })

  it('drops the downloaded screens when the release was pulled back before the next start', async () => {
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    fake.answer = { bundle: liveBundle(240), updateRequired: false }
    expect(await switchScreensAtStart()).toBe(false)
    expect(fake.calls.filter((c) => c.startsWith('set'))).toEqual([])
  })

  it('uses the downloaded screens when the quick look at start can’t reach the backend', async () => {
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    fake.offline = true
    expect(await switchScreensAtStart()).toBe(true)
    expect(fake.calls).toContain('set id-250')
  })

  it('stops downloading a bundle that failed three times (a key that doesn’t match, a broken file)', async () => {
    fake.downloadFails = true
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    for (let i = 0; i < 5; i++) await check()
    expect(fake.calls.filter((c) => c.startsWith('download'))).toHaveLength(3)
    expect(await switchScreensAtStart()).toBe(false)
  })

  it('marks the screens as working once the app has drawn its first screen', async () => {
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    await settle()
    expect(fake.calls).toContain('ready')
  })

  it('uses a bundle already downloaded (still pending: never run) instead of downloading it again', async () => {
    fake.bundles = [fake.bundle('id-250', '250', 'pending')]
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    expect(fake.calls.filter((c) => c.startsWith('download'))).toEqual([])
    expect(await switchScreensAtStart()).toBe(true)
    expect(fake.calls).toContain('set id-250')
  })

  it('does nothing when the app already has those screens', async () => {
    fake.current = fake.bundle('id-250', '250')
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    expect(fake.calls).toEqual([])
    expect(await switchScreensAtStart()).toBe(false)
  })

  it('goes back to the app’s own screens when the backend says so (the release was pulled back)', async () => {
    fake.current = fake.bundle('id-250', '250')
    fake.answer = { bundle: null, updateRequired: false }
    startAppUpdates()
    await settle()
    expect(await switchScreensAtStart()).toBe(true)
    expect(fake.calls).toContain('reset')
  })

  it('never downloads a bundle that failed to start on this phone', async () => {
    fake.failed = { bundle: { version: '250' } }
    await switchScreensAtStart()
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    expect(fake.calls.filter((c) => c.startsWith('download'))).toEqual([])
  })

  it('downloads nothing in an app built without the signing key', async () => {
    fake.info = { ...fake.info, updatesSigned: false }
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    expect(fake.calls.filter((c) => c.startsWith('download'))).toEqual([])
  })

  it('keeps working when offline or the backend answers an error, and asks again as soon as it is back', async () => {
    fake.offline = true
    startAppUpdates()
    await settle()
    expect(fake.calls).toEqual([])
    expect(await switchScreensAtStart()).toBe(false)
    fake.offline = false
    fake.answerStatus = 503
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(fake.fetched).toHaveLength(2)
    expect(fake.calls).toEqual([])
    fake.answerStatus = 200
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(fake.calls).toEqual(['download 250 https://r2.test/250.zip sum250 iv:key'])
  })

  it('asks again when the app comes back after half an hour, not every time', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    startAppUpdates()
    await settle()
    now.mockReturnValue(1_000_000 + 10 * 60 * 1000)
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(fake.fetched).toHaveLength(1)
    now.mockReturnValue(1_000_000 + 31 * 60 * 1000)
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(fake.fetched).toHaveLength(2)
    now.mockRestore()
  })

  it('asks every 10 minutes while the app is on screen, never while it is in the background', async () => {
    let tick: () => void = () => {}
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
      tick = fn
      return 1
    }) as unknown as typeof setInterval)
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    startAppUpdates()
    await settle()
    expect(fake.fetched).toHaveLength(1)
    now.mockReturnValue(1_000_000 + 9 * 60 * 1000)
    tick()
    await settle()
    expect(fake.fetched).toHaveLength(1)
    now.mockReturnValue(1_000_000 + 10 * 60 * 1000)
    tick()
    await settle()
    expect(fake.fetched).toHaveLength(2)
    // In the background: no checks (the phone may be asleep)
    fake.appListeners.get('appStateChange')?.({ isActive: false })
    now.mockReturnValue(1_000_000 + 25 * 60 * 1000)
    tick()
    await settle()
    expect(fake.fetched).toHaveLength(2)
    now.mockRestore()
  })

  it('switches to downloaded screens when the app comes back after 5 minutes away, on the same screen', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    expect(fake.calls).toEqual(['download 250 https://r2.test/250.zip sum250 iv:key'])
    history.replaceState(null, '', '/day?date=2026-11-25')

    // Away for 2 minutes (a WhatsApp reply): nothing changes
    fake.appListeners.get('appStateChange')?.({ isActive: false })
    now.mockReturnValue(1_000_000 + 2 * 60 * 1000)
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(fake.calls).not.toContain('set id-250')

    // Away for 6 minutes: switched, and the same screen comes back after the reload
    fake.appListeners.get('appStateChange')?.({ isActive: false })
    now.mockReturnValue(1_000_000 + 8 * 60 * 1000)
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(fake.calls).toContain('set id-250')
    history.replaceState(null, '', '/')
    fake.current = fake.bundle('id-250', '250', 'pending')
    expect(await switchScreensAtStart()).toBe(false)
    expect(location.pathname + location.search).toBe('/day?date=2026-11-25')
    now.mockRestore()
  })

  it('shows "A fix is ready" only for an urgent release this phone doesn’t have, and Restart switches at once', async () => {
    fake.answer = { bundle: liveBundle(250), updateRequired: false, urgentBuild: null }
    render(<AppUpdateGate><p>Day board</p></AppUpdateGate>)
    startAppUpdates()
    await settle()
    expect(screen.queryByText(/A fix for the app is ready/)).toBeNull()

    resetAppUpdates()
    fake.answer = { bundle: liveBundle(250), updateRequired: false, urgentBuild: 245 }
    startAppUpdates()
    await settle()
    expect(screen.getByText(/A fix for the app is ready/)).toBeTruthy()
    expect(screen.getByText('Day board')).toBeTruthy() // the screen stays usable under it
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await settle()
    expect(fake.calls).toContain('set id-250')

    // Screens already as new as the urgent one: no banner
    resetAppUpdates()
    fake.current = fake.bundle('id-246', '246', 'success')
    startAppUpdates()
    await settle()
    expect(screen.queryByText(/A fix for the app is ready/)).toBeNull()
  })

  it('never switches under an open sheet, typed text or the Subscription screen; those wait for the next start', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    const away = async (minutes: number) => {
      fake.appListeners.get('appStateChange')?.({ isActive: false })
      now.mockReturnValue(Date.now() + minutes * 60 * 1000)
      fake.appListeners.get('appStateChange')?.({ isActive: true })
      await settle()
    }
    // A walk-in half typed
    const input = document.createElement('input')
    input.value = 'Ravi'
    document.body.appendChild(input)
    await away(6)
    expect(fake.calls).not.toContain('set id-250')
    input.remove()
    // A sheet open
    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    document.body.appendChild(sheet)
    await away(6)
    expect(fake.calls).not.toContain('set id-250')
    sheet.remove()
    // Paying (the UPI app took 6 minutes)
    history.replaceState(null, '', '/subscription')
    await away(6)
    expect(fake.calls).not.toContain('set id-250')
    history.replaceState(null, '', '/')
    // Nothing open: switched
    await away(6)
    expect(fake.calls).toContain('set id-250')
    now.mockRestore()
  })

  it('never counts the quick look before switching (it gives up after 2 s, maybe after the backend counted it)', async () => {
    fake.answer = { bundle: liveBundle(250), updateRequired: false }
    startAppUpdates()
    await settle()
    localStorage.removeItem('clozest.updates.counted')
    resetAppUpdates()
    fake.fetched = []
    await switchScreensAtStart()
    expect(fake.fetched).toHaveLength(1)
    expect(fake.fetched[0]).not.toContain('first=true')
  })

  it('after a failed check, the checks while open wait 10 minutes too (never every minute while the backend struggles)', async () => {
    let tick: () => void = () => {}
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void) => {
      tick = fn
      return 1
    }) as unknown as typeof setInterval)
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    fake.answerStatus = 503
    startAppUpdates()
    await settle()
    for (let m = 1; m < 10; m++) {
      now.mockReturnValue(1_000_000 + m * 60 * 1000)
      tick()
      await settle()
    }
    expect(fake.fetched).toHaveLength(1)
    now.mockReturnValue(1_000_000 + 10 * 60 * 1000)
    tick()
    await settle()
    expect(fake.fetched).toHaveLength(2)
    now.mockRestore()
  })

  it('goes back to the app’s own screens only when the backend says so at that moment', async () => {
    fake.current = fake.bundle('id-250', '250', 'success')
    localStorage.setItem('clozest.screens.next', JSON.stringify({ builtin: true }))
    fake.offline = true
    expect(await switchScreensAtStart()).toBe(false)
    expect(fake.calls).not.toContain('reset')
    fake.offline = false
    localStorage.setItem('clozest.screens.next', JSON.stringify({ builtin: true }))
    fake.answer = { bundle: null, updateRequired: false }
    expect(await switchScreensAtStart()).toBe(true)
    expect(fake.calls).toContain('reset')
  })

  it('Later hides that fix only; Restart with nothing left to switch to takes the banner away', async () => {
    fake.answer = { bundle: liveBundle(250), updateRequired: false, urgentBuild: 245 }
    render(<AppUpdateGate><p>Day board</p></AppUpdateGate>)
    startAppUpdates()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByText(/A fix for the app is ready/)).toBeNull()
    // A newer urgent fix later the same day: shown again
    fake.answer = { bundle: liveBundle(251), updateRequired: false, urgentBuild: 251 }
    await act(async () => await check())
    await settle()
    expect(screen.getByText(/A fix for the app is ready/)).toBeTruthy()
    // Its download gone (cleared by the phone): Restart can't switch, and the banner goes
    fake.bundles = []
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await settle()
    expect(screen.queryByText(/A fix for the app is ready/)).toBeNull()
    expect(fake.calls).not.toContain('set id-251')
  })

  it('a hidden frame left behind by a closed checkout doesn’t stop the switch; a checkout on screen does', async () => {
    const frame = document.createElement('iframe')
    frame.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect
    document.body.appendChild(frame)
    expect(idle()).toBe(true)
    frame.getBoundingClientRect = () => ({ width: 360, height: 600 }) as DOMRect
    expect(idle()).toBe(false)
    frame.remove()
  })

  it('does nothing on the website', async () => {
    fake.native = false
    startAppUpdates()
    await settle()
    expect(fake.fetched).toEqual([])
    expect(await switchScreensAtStart()).toBe(false)
    expect(fake.calls).toEqual([])
  })
})

describe('updates from Google Play', () => {
  function Probe() {
    const s = useAppUpdate()
    return <p>{`${s.required} ${s.play}`}</p>
  }

  it('shows only the "Please update" screen when this version is too old, and its button opens Google’s update', async () => {
    fake.answer = { bundle: null, updateRequired: true }
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    startAppUpdates()
    await settle()
    expect(screen.getByRole('heading', { name: 'Please update the app to continue' })).toBeInTheDocument()
    expect(screen.queryByText('The day')).not.toBeInTheDocument()
    // Never a dead end when the Play Store shows no update yet: the website meanwhile, and a person to call
    expect(screen.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919381251613')
    expect(screen.getByRole('link', { name: 'WhatsApp us' }).getAttribute('href')).toContain('https://wa.me/919381251613?text=')
    // No "use the website": in the app it would open these same screens again
    expect(screen.queryByRole('link', { name: /partner\.clozest\.in/ })).not.toBeInTheDocument()
    fake.play = { ...fake.play, updateAvailability: 2 }
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
    await settle()
    expect(fake.calls).toContain('immediate')
  })

  it('opens the Play Store page when Google can’t update in the app, or its update failed', async () => {
    fake.play = { ...fake.play, updateAvailability: 1 }
    await updateFromPlay()
    expect(fake.calls).toEqual(['store'])
    fake.calls = []
    fake.play = { ...fake.play, updateAvailability: 2 }
    fake.immediateCode = 2
    await updateFromPlay()
    expect(fake.calls).toEqual(['immediate', 'store'])
    // Said no to Google's screen: stays on "Please update"
    fake.calls = []
    fake.immediateCode = 1
    await updateFromPlay()
    expect(fake.calls).toEqual(['immediate'])
  })

  it('never puts "Please update" over a screen in use; it comes when the app is opened, and Check again asks', async () => {
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    startAppUpdates()
    await settle()
    fake.answer = { bundle: null, updateRequired: true }
    await act(async () => await check())
    expect(screen.getByText('The day')).toBeInTheDocument()
    resetAppUpdates()
    startAppUpdates()
    await settle()
    expect(screen.getByRole('heading', { name: 'Please update the app to continue' })).toBeInTheDocument()
    // Updated meanwhile (the backend no longer asks): Check again lets them in
    fake.answer = { bundle: null, updateRequired: false }
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await settle()
    expect(screen.getByText('The day')).toBeInTheDocument()
  })

  it('offline when the app was opened: a later check never puts "Please update" over the screen', async () => {
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    fake.offline = true
    startAppUpdates()
    await settle()
    fake.offline = false
    fake.answer = { bundle: null, updateRequired: true }
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(fake.fetched).toHaveLength(2)
    expect(screen.getByText('The day')).toBeInTheDocument()
  })

  it('takes the banner away when Google’s download stopped while the app was away', async () => {
    fake.play = { ...fake.play, updateAvailability: 2, installStatus: 2 }
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    startAppUpdates()
    await settle()
    fake.play = { ...fake.play, updateAvailability: 2, installStatus: 5, flexibleUpdateAllowed: false }
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(screen.queryByText('Getting the new version. You can keep using the app.')).not.toBeInTheDocument()
  })

  it('offers Update again when the person says no to Google’s download', async () => {
    fake.play = { ...fake.play, updateAvailability: 2 }
    fake.flexibleCode = 1
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    startAppUpdates()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await settle()
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
  })

  it('shows Restart when Google’s download finished while the app was away', async () => {
    fake.play = { ...fake.play, updateAvailability: 2, installStatus: 2 }
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    startAppUpdates()
    await settle()
    expect(screen.getByText('Getting the new version. You can keep using the app.')).toBeInTheDocument()
    fake.play = { ...fake.play, installStatus: 11 }
    fake.appListeners.get('appStateChange')?.({ isActive: true })
    await settle()
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
  })

  it('offers a newer version in a banner: Update, then Restart once it is downloaded', async () => {
    fake.play = { ...fake.play, updateAvailability: 2 }
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    startAppUpdates()
    await settle()
    expect(screen.getByText('The day')).toBeInTheDocument()
    expect(screen.getByText('A new version of the app is available.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await settle()
    expect(fake.calls).toContain('flexible')
    expect(screen.getByText('Getting the new version. You can keep using the app.')).toBeInTheDocument()
    act(() => fake.listeners.get('onFlexibleUpdateStateChange')?.({ installStatus: 11 }))
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await settle()
    expect(fake.calls).toContain('complete')
  })

  it('"Later" hides the offer until the next start', async () => {
    fake.play = { ...fake.play, updateAvailability: 2 }
    render(
      <AppUpdateGate>
        <p>The day</p>
      </AppUpdateGate>,
    )
    startAppUpdates()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByText('A new version of the app is available.')).not.toBeInTheDocument()
    // An urgent fix's banner comes and goes meanwhile: Google's offer stays put off
    fake.answer = { bundle: liveBundle(250), updateRequired: false, urgentBuild: 250 }
    await act(async () => await check())
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByText('A new version of the app is available.')).not.toBeInTheDocument()
  })

  it('never asks a test APK to update', async () => {
    fake.info = { ...fake.info, debug: true }
    fake.play = { ...fake.play, updateAvailability: 2 }
    render(<Probe />)
    startAppUpdates()
    await settle()
    expect(screen.getByText('false none')).toBeInTheDocument()
    await finishPlayUpdate()
  })
})
