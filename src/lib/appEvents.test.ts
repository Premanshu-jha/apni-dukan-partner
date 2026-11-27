import { linkTarget, notificationTarget, onOpenRequest, openInApp, takePendingOpen } from './appEvents'

describe('the screen a tapped notification opens in the app (the service worker’s rule)', () => {
  it('opens this app’s own pages as they are', () => {
    expect(notificationTarget('/salon/day?date=2026-11-23')).toBe('/salon/day?date=2026-11-23')
    expect(notificationTarget('/salon/bookings')).toBe('/salon/bookings')
    expect(notificationTarget('/handover')).toBe('/handover')
    expect(notificationTarget('/invites')).toBe('/invites')
    expect(notificationTarget('/help/requests/T-123')).toBe('/help/requests/T-123')
  })

  it('pay and fix-it messages open their screens (lib/messageLinks.ts), as in Messages and on the web', () => {
    expect(notificationTarget('/subscription')).toBe('/subscription')
    expect(notificationTarget('/setup')).toBe('/setup?fix=1')
    expect(notificationTarget('/setup/document')).toBe('/setup/document')
    expect(notificationTarget('/setup/address')).toBe('/setup/address')
    expect(notificationTarget('/register/photos')).toBe('/register/photos')
    // No screen here: the start, saying what the message was about (its title)
    expect(notificationTarget('/setup/staff', 'X', 'A new kind of message')).toBe('/?message=A%20new%20kind%20of%20message')
  })

  it('shop news opens More; anything else (a customer page, another site) the start, with the title when there is one', () => {
    expect(notificationTarget('/shops/me')).toBe('/more')
    expect(notificationTarget('/bookings/b1')).toBe('/')
    expect(notificationTarget('https://evil.example/salon/day', null, 'Hi')).toBe('/?message=Hi')
    expect(notificationTarget('//evil.example/x')).toBe('/')
    // No url at all: the day board, as before
    expect(notificationTarget(null)).toBe('/salon/day')
    expect(notificationTarget('/help/requests/../../x')).toBe('/')
    // /setup/photos: nothing sends it any more, so it is no screen
    expect(notificationTarget('/setup/photos')).toBe('/')
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
