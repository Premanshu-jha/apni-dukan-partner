import { linkTarget, notificationTarget, onOpenRequest, openInApp, takePendingOpen } from './appEvents'

describe('the screen a tapped notification opens in the app (the service worker’s rule)', () => {
  it('opens this app’s own pages as they are', () => {
    expect(notificationTarget('/salon/day?date=2026-11-23')).toBe('/salon/day?date=2026-11-23')
    expect(notificationTarget('/salon/bookings')).toBe('/salon/bookings')
    expect(notificationTarget('/handover')).toBe('/handover')
    expect(notificationTarget('/invites')).toBe('/invites')
    expect(notificationTarget('/help/requests/T-123')).toBe('/help/requests/T-123')
  })

  it('shop news opens the start page; anything else (a customer page, another site, nothing) the day board', () => {
    expect(notificationTarget('/shops/me')).toBe('/')
    expect(notificationTarget('/bookings/b1')).toBe('/salon/day')
    expect(notificationTarget('https://evil.example/salon/day')).toBe('/salon/day')
    expect(notificationTarget('//evil.example/x')).toBe('/salon/day')
    expect(notificationTarget(null)).toBe('/salon/day')
    expect(notificationTarget('/help/requests/../../x')).toBe('/salon/day')
  })
})

describe('a link to the website opened in the app', () => {
  it('opens the same page; another site, http or a look-alike host opens nothing', () => {
    expect(linkTarget('https://partner.clozest.in/invites?x=1#top', 'partner.clozest.in')).toBe('/invites?x=1#top')
    expect(linkTarget('https://evil.example/invites', 'partner.clozest.in')).toBeNull()
    expect(linkTarget('http://partner.clozest.in/invites', 'partner.clozest.in')).toBeNull()
    expect(linkTarget('https://partner.clozest.in.evil.example/', 'partner.clozest.in')).toBeNull()
    expect(linkTarget('not a url', 'partner.clozest.in')).toBeNull()
  })
})

describe('the screen waiting to open', () => {
  it('waits until taken (the router may not be drawn yet), once; the newest wins and listeners are told', () => {
    const told = vi.fn()
    const stop = onOpenRequest(told)
    openInApp('/salon/day')
    openInApp('/invites')
    expect(told).toHaveBeenCalledTimes(2)
    expect(takePendingOpen()).toBe('/invites')
    expect(takePendingOpen()).toBeNull()
    stop()
    openInApp('/handover')
    expect(told).toHaveBeenCalledTimes(2)
    expect(takePendingOpen()).toBe('/handover')
  })
})
