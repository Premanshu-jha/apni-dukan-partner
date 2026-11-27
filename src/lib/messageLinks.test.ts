import { CALL_US, whatsappTo, whatsappUs } from './business'
import { messageScreen, noScreenTarget } from './messageLinks'

describe('the screens a message opens (one list for Messages, web push and the app)', () => {
  it('pay, a fix asked for, the licence, the address, photos: each its own screen, with its query', () => {
    expect(messageScreen('/subscription')).toBe('/subscription')
    // Marked, so a kirana's fix asked for opens More (guards.test)
    expect(messageScreen('/setup')).toBe('/setup?fix=1')
    expect(messageScreen('/setup/document')).toBe('/setup/document')
    expect(messageScreen('/setup/address')).toBe('/setup/address')
    expect(messageScreen('/register/photos')).toBe('/register/photos')
    expect(messageScreen('/subscription?x=1')).toBe('/subscription?x=1')
    expect(messageScreen('/salon/day?date=2026-11-27#top')).toBe('/salon/day?date=2026-11-27#top')
  })

  it('shop news opens More; anything else, another site or a trick path is no screen', () => {
    expect(messageScreen('/shops/me')).toBe('/more')
    expect(messageScreen('/setup/staff')).toBeNull()
    expect(messageScreen('/subscription/../admin')).toBeNull()
    expect(messageScreen('/\\evil.example')).toBeNull()
    expect(messageScreen('https://evil.example/subscription')).toBeNull()
    expect(messageScreen('')).toBeNull()
    expect(messageScreen(undefined)).toBeNull()
  })
})

describe('a kirana\'s messages (kirana switch on only)', () => {
  it('the licences open their screen; /kirana/online and an online order the nearest one', () => {
    expect(messageScreen('/kirana/licences', null, true)).toBe('/kirana/licences')
    expect(messageScreen('/register/licences', null, true)).toBe('/register/licences')
    expect(messageScreen('/kirana/online', 'KIRANA_FSSAI', true)).toBe('/kirana/licences')
    expect(messageScreen('/kirana/online', 'KIRANA_PAYOUT_FAILED', true)).toBe('/kirana/upi')
    expect(messageScreen('/kirana/shop-orders/0f8b2a6e-1c2d', null, true)).toBe('/kirana/bills')
    expect(messageScreen('/kirana/shop-orders/../x', null, true)).toBeNull()
    // Switch off: no kirana screen exists, so none is opened
    expect(messageScreen('/kirana/licences', null, false)).toBeNull()
    expect(messageScreen('/kirana/online', 'KIRANA_FSSAI', false)).toBeNull()
  })

  it('no screen: the start with the title (cut to 200), or just the start', () => {
    expect(noScreenTarget('Your FSSAI licence ends soon')).toBe('/?message=Your%20FSSAI%20licence%20ends%20soon')
    expect(noScreenTarget('  ')).toBe('/')
    expect(noScreenTarget(null)).toBe('/')
    expect(decodeURIComponent(noScreenTarget('x'.repeat(300)).split('=')[1])).toHaveLength(200)
  })
})

describe('Call us and WhatsApp us (one number, lib/business.ts)', () => {
  it('dials and chats with our number, the message typed in', () => {
    expect(CALL_US).toBe('tel:+919381251613')
    expect(whatsappUs()).toBe('https://wa.me/919381251613')
    expect(whatsappUs('Screen: Today & more')).toBe('https://wa.me/919381251613?text=Screen%3A%20Today%20%26%20more')
  })

  it('an invited helper\'s 10-digit number gets India\'s code in front', () => {
    expect(whatsappTo('98480 12345', 'Hi')).toBe('https://wa.me/919848012345?text=Hi')
    expect(whatsappTo('919848012345')).toBe('https://wa.me/919848012345')
  })
})
