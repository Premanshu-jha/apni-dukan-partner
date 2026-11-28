import { forgetRegisterReady, loadRegisterReady, saveRegisterReady } from '../../lib/registerDraft'
import { distanceText, FAR_FROM_ADDRESS_METRES, farFromAddressFound } from './Register'

describe('how far the location is from the address found', () => {
  it('says the distance the same way in every language: metres in tens under a kilometre, else kilometres', () => {
    expect(distanceText(904)).toBe('900 m')
    expect(distanceText(46)).toBe('50 m')
    // Rounds to 1000 m: said as a kilometre, never "1000 m"
    expect(distanceText(995)).toBe('1.0 km')
    expect(distanceText(1000)).toBe('1.0 km')
    expect(distanceText(2460)).toBe('2.5 km')
  })

  it('asks sooner the more exactly the address was found: 300 m on the building, 700 m on the street, 2 km in the area', () => {
    expect(FAR_FROM_ADDRESS_METRES).toEqual({ EXACT: 300, STREET: 700, AREA: 2000 })
    expect(farFromAddressFound(900, 'EXACT', 20)).toBe(true)
    expect(farFromAddressFound(900, 'STREET', 20)).toBe(true)
    expect(farFromAddressFound(900, 'AREA', 20)).toBe(false)
    expect(farFromAddressFound(250, 'EXACT', 20)).toBe(false)
  })

  it("doesn't take a rough indoor fix for being elsewhere: the phone's own uncertainty is allowed for", () => {
    // 600 m from an exact address, but the phone says it may be 400 m off: not asked
    expect(farFromAddressFound(600, 'EXACT', 400)).toBe(false)
    expect(farFromAddressFound(800, 'EXACT', 400)).toBe(true)
  })
})

describe('"I\'m at my shop", answered once', () => {
  afterEach(() => forgetRegisterReady())

  it('is this person\'s only, and forgotten when the shop is saved or someone signs out', () => {
    saveRegisterReady('u1')
    expect(loadRegisterReady('u1')).toBe(true)
    expect(loadRegisterReady('u2')).toBe(false)
    expect(loadRegisterReady(undefined)).toBe(false)
    forgetRegisterReady()
    expect(loadRegisterReady('u1')).toBe(false)
  })

  it('holds for this visit when the phone can\'t keep it (storage blocked or full): never asked in a circle', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      saveRegisterReady('u1')
      expect(window.localStorage.getItem('adp.registerReady')).toBeNull()
      expect(loadRegisterReady('u1')).toBe(true)
      expect(loadRegisterReady('u2')).toBe(false)
    } finally {
      setItem.mockRestore()
    }
  })
})
