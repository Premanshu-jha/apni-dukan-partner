import {
  APP_TOKEN,
  UNREGISTER_LATER,
  appPushOn,
  claimAppPush,
  dropAppPush,
  finishUnregister,
  listenForAppMessages,
  noTokenError,
  turnOffAppPush,
  turnOnAppPush,
} from './appPush'

const fake = vi.hoisted(() => {
  const listeners = new Map<string, (arg: unknown) => void>()
  return {
    listeners,
    permission: 'prompt' as string,
    afterAsk: 'granted' as string,
    token: 'fcm-token-1',
    failRegister: false,
    calls: [] as { method: string; path: string; body?: unknown }[],
    appPush: true,
    failDelete: false,
    unregister: vi.fn(async () => {}),
    createChannel: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  }
})

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: async () => ({ receive: fake.permission }),
    requestPermissions: async () => {
      fake.permission = fake.afterAsk
      return { receive: fake.permission }
    },
    createChannel: fake.createChannel,
    register: async () => {
      // Firebase answers on the next turn, through the listeners
      setTimeout(() => {
        if (fake.failRegister) fake.listeners.get('registrationError')?.({ error: 'no' })
        else fake.listeners.get('registration')?.({ value: fake.token })
      }, 0)
    },
    unregister: fake.unregister,
    removeAllDeliveredNotifications: fake.clear,
    addListener: async (name: string, fn: (arg: unknown) => void) => {
      fake.listeners.set(name, fn)
      return { remove: async () => void fake.listeners.delete(name) }
    },
  },
}))
vi.mock('../lib/appSettings', () => ({ dropPushToken: () => fake.unregister(), openNotificationSettings: async () => {} }))
vi.mock('./client', () => ({
  api: async (method: string, path: string, opts?: { body?: unknown }) => {
    fake.calls.push({ method, path, body: opts?.body })
    if (method === 'DELETE' && fake.failDelete) throw new Error('offline')
    if (path === '/api/v1/push/public-key') return { publicKey: '', appPush: fake.appPush }
    return undefined
  },
}))

beforeEach(() => {
  vi.stubEnv('VITE_APP_PUSH', 'true')
  localStorage.clear()
  fake.listeners.clear()
  fake.permission = 'prompt'
  fake.afterAsk = 'granted'
  fake.token = 'fcm-token-1'
  fake.failRegister = false
  fake.calls = []
  fake.appPush = true
  fake.failDelete = false
  fake.unregister.mockReset()
  fake.unregister.mockImplementation(async () => {})
  fake.clear.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('notifications in the Play Store app (Firebase)', () => {
  it('turning on asks Android once, makes the channel, saves the token with the backend and remembers it', async () => {
    expect(await appPushOn()).toBe(false)
    expect(await turnOnAppPush()).toBe('on')
    expect(fake.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'clozest', importance: 5 }))
    expect(fake.calls.at(-1)).toEqual({ method: 'POST', path: '/api/v1/me/push-devices', body: { token: 'fcm-token-1' } })
    expect(localStorage.getItem(APP_TOKEN)).toBe('fcm-token-1')
    expect(await appPushOn()).toBe(true)
  })

  it('refused by the person, or later in Android’s settings: denied, nothing saved, and the switch shows Off', async () => {
    fake.afterAsk = 'denied'
    expect(await turnOnAppPush()).toBe('denied')
    expect(fake.calls.some((c) => c.path === '/api/v1/me/push-devices')).toBe(false)
    fake.permission = 'granted'
    expect(await turnOnAppPush()).toBe('on')
    fake.permission = 'denied'
    expect(await appPushOn()).toBe(false)
  })

  it('Firebase not set up on the server, or the app built without it: not configured, Android never asked', async () => {
    fake.appPush = false
    expect(await turnOnAppPush()).toBe('not-configured')
    expect(fake.permission).toBe('prompt')
    vi.stubEnv('VITE_APP_PUSH', '')
    fake.appPush = true
    expect(await turnOnAppPush()).toBe('not-configured')
    expect(fake.calls).toHaveLength(1)
  })

  it('Firebase failing to give a token is an error the switch shows; nothing is remembered', async () => {
    fake.permission = 'granted'
    fake.failRegister = true
    const failed = await turnOnAppPush().catch((e: unknown) => e)
    // Its own plain words on the switch (no Google services, Firebase not answering), not "something went wrong"
    expect(noTokenError(failed)).toBe(true)
    expect(noTokenError(new Error('other'))).toBe(false)
    expect(localStorage.getItem(APP_TOKEN)).toBeNull()
  })

  it('turning off removes the token at the backend and at Firebase, even if the backend call fails', async () => {
    fake.permission = 'granted'
    await turnOnAppPush()
    fake.failDelete = true
    await turnOffAppPush()
    expect(fake.calls.at(-1)).toEqual({ method: 'DELETE', path: '/api/v1/me/push-devices', body: { token: 'fcm-token-1' } })
    expect(fake.unregister).toHaveBeenCalled()
    expect(localStorage.getItem(APP_TOKEN)).toBeNull()
    // Nothing on: nothing to do
    fake.calls = []
    await turnOffAppPush()
    expect(fake.calls).toEqual([])
  })

  it('after a sign-in the current token (Firebase may have renewed it) goes to the person now signed in', async () => {
    fake.permission = 'granted'
    await turnOnAppPush()
    fake.token = 'fcm-token-2'
    await claimAppPush()
    expect(fake.calls.at(-1)).toEqual({ method: 'POST', path: '/api/v1/me/push-devices', body: { token: 'fcm-token-2' } })
    expect(localStorage.getItem(APP_TOKEN)).toBe('fcm-token-2')
    // Never turned on here: nothing claimed
    localStorage.clear()
    fake.calls = []
    await claimAppPush()
    expect(fake.calls).toEqual([])
  })

  it('a session ended elsewhere drops the token at Firebase, so nothing more arrives on this phone', async () => {
    localStorage.setItem(APP_TOKEN, 'fcm-token-1')
    await dropAppPush()
    expect(fake.unregister).toHaveBeenCalled()
    expect(localStorage.getItem(APP_TOKEN)).toBeNull()
  })

  it('passes a message’s type and screen to the app: arriving while open, and tapped in the tray', async () => {
    const got: unknown[] = []
    listenForAppMessages((m) => got.push(['open', m]), (m) => got.push(['tap', m]))
    await Promise.resolve()
    fake.listeners.get('pushNotificationReceived')?.({ data: { type: 'SALON_NEW_BOOKING', url: '/salon/day' } })
    fake.listeners.get('pushNotificationActionPerformed')?.({ notification: { title: 'Approved', data: { type: 'SHOP_APPROVED' } } })
    // The title too: a message with no screen here is said on the start
    expect(got).toEqual([
      ['open', { type: 'SALON_NEW_BOOKING', url: '/salon/day', title: null }],
      ['tap', { type: 'SHOP_APPROVED', url: null, title: 'Approved' }],
    ])
  })

  it('signed out offline on a shared phone: Firebase is told at the next start, so the next person gets nothing of theirs', async () => {
    fake.permission = 'granted'
    await turnOnAppPush()
    fake.failDelete = true
    fake.unregister.mockRejectedValueOnce(new Error('offline'))
    await turnOffAppPush()
    expect(localStorage.getItem(UNREGISTER_LATER)).toBe('1')
    // The next start, online
    await finishUnregister()
    expect(fake.unregister).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(UNREGISTER_LATER)).toBeNull()
    // Nothing waiting: nothing done
    await finishUnregister()
    expect(fake.unregister).toHaveBeenCalledTimes(2)
  })

  it('notifications turned on again before the next start: the new token is kept, not dropped', async () => {
    localStorage.setItem(UNREGISTER_LATER, '1')
    localStorage.setItem(APP_TOKEN, 'fcm-token-2')
    await finishUnregister()
    expect(fake.unregister).not.toHaveBeenCalled()
    expect(localStorage.getItem(UNREGISTER_LATER)).toBeNull()
  })
})
