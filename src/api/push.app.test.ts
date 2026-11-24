import { claimSubscription, closeShownNotifications, dropBrowserSubscription, needsHomeScreen, pushIsOn, pushSupported, registerWorker, turnOffPush, turnOnPush } from './push'

const app = vi.hoisted(() => ({
  on: false,
  calls: [] as string[],
}))

vi.mock('../lib/platform', () => ({ isApp: () => app.on }))
vi.mock('./appPush', () => ({
  appPushBuilt: () => true,
  appPushOn: async () => {
    app.calls.push('appPushOn')
    return true
  },
  turnOnAppPush: async () => {
    app.calls.push('turnOn')
    return 'on'
  },
  turnOffAppPush: async () => void app.calls.push('turnOff'),
  claimAppPush: async () => void app.calls.push('claim'),
  dropAppPush: async () => void app.calls.push('drop'),
  clearAppNotifications: async () => void app.calls.push('clear'),
}))

beforeEach(() => {
  app.on = false
  app.calls = []
})

describe('notifications: the website and the Play Store app ask the same functions', () => {
  it('in the app every one goes to Firebase’s side, and no service worker is registered', async () => {
    app.on = true
    const register = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true })
    expect(pushSupported()).toBe(true)
    expect(needsHomeScreen()).toBe(false)
    expect(await registerWorker()).toBeNull()
    expect(register).not.toHaveBeenCalled()
    expect(await pushIsOn()).toBe(true)
    expect(await turnOnPush()).toBe('on')
    await turnOffPush()
    await claimSubscription()
    await dropBrowserSubscription()
    await closeShownNotifications()
    expect(app.calls).toEqual(['appPushOn', 'turnOn', 'turnOff', 'claim', 'drop', 'clear'])
  })

  it('on the website none of them touch Firebase', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    expect(pushSupported()).toBe(false)
    expect(await pushIsOn()).toBe(false)
    expect(await turnOnPush()).toBe('unsupported')
    await turnOffPush()
    await claimSubscription()
    await dropBrowserSubscription()
    await closeShownNotifications()
    expect(app.calls).toEqual([])
  })
})
