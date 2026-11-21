/** The kirana switch itself: VITE_KIRANA_ENABLED, read once at build time ('true' only turns it on). */
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function configWith(value: string | undefined) {
  vi.resetModules()
  if (value === undefined) vi.stubEnv('VITE_KIRANA_ENABLED', undefined as unknown as string)
  else vi.stubEnv('VITE_KIRANA_ENABLED', value)
  return import('./config')
}

describe('the kirana switch', () => {
  it('is off by default (unset) and for anything but "true"', async () => {
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes', ' true']) {
      const c = await configWith(value)
      expect(c.KIRANA_ENABLED, String(value)).toBe(false)
      expect(c.kiranaOn(), String(value)).toBe(false)
    }
  })

  it('is on with "true"', async () => {
    const c = await configWith('true')
    expect(c.KIRANA_ENABLED).toBe(true)
    expect(c.kiranaOn()).toBe(true)
  })

  it('serves a salon always, a kirana only when on, and no other kind', async () => {
    const off = await configWith('false')
    expect(off.shopTypeOn('SALON')).toBe(true)
    expect(off.shopTypeOn('KIRANA')).toBe(false)
    expect(off.shopTypeOn('PHARMACY')).toBe(false)
    const on = await configWith('true')
    expect(on.shopTypeOn('SALON')).toBe(true)
    expect(on.shopTypeOn('KIRANA')).toBe(true)
    expect(on.shopTypeOn('PHARMACY')).toBe(false)
  })
})
