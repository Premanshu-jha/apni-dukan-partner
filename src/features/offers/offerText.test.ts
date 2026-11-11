import { describe, expect, it } from 'vitest'
import { checkOffer, offerPrice, offerWhat, offerWhen } from './offerText'

describe('offer texts', () => {
  it('says when, like the message', () => {
    expect(offerWhen({ startsOn: '2026-11-12', endsOn: '2026-11-14', from: '12:00', until: '16:00' })).toBe('12 Nov – 14 Nov, 12:00–16:00')
    expect(offerWhen({ startsOn: '2026-11-12', endsOn: '2026-11-12', from: null, until: null })).toBe('12 Nov')
  })

  it('names the services', () => {
    const names = new Map([['a', 'Haircut'], ['b', 'Beard trim']])
    expect(offerWhat({ allServices: true, serviceIds: [] }, names)).toBe('All services')
    expect(offerWhat({ allServices: false, serviceIds: ['a', 'b', 'gone'] }, names)).toBe('Haircut, Beard trim')
  })

  it('prices like the backend: to the rupee, half up, never below ₹1', () => {
    expect(offerPrice(15000, 20)).toBe(12000)
    expect(offerPrice(14900, 15)).toBe(12700)
    expect(offerPrice(9900, 50)).toBe(5000)
    expect(offerPrice(100, 50)).toBe(100)
    expect(offerPrice(0, 50)).toBe(0)
  })

  it('checks the form', () => {
    const ok = { percentOff: 20, startsOn: '2026-11-12', endsOn: '2026-11-14', someHours: true, from: '12:00', until: '16:00', allServices: false, serviceIds: ['a'], today: '2026-11-11', lastEnd: '2027-02-09', lastStart: '2026-11-18' }
    expect(checkOffer(ok)).toBeNull()
    expect(checkOffer({ ...ok, percentOff: 60 })).toMatch('5% to 50%')
    expect(checkOffer({ ...ok, serviceIds: [] })).toMatch('at least one service')
    expect(checkOffer({ ...ok, startsOn: '2026-11-10' })).toMatch('today or later')
    expect(checkOffer({ ...ok, endsOn: '2026-11-11' })).toMatch('on or after')
    expect(checkOffer({ ...ok, until: '' })).toMatch('both times')
    expect(checkOffer({ ...ok, until: '11:00' })).toMatch('after the start')
    expect(checkOffer({ ...ok, someHours: false, until: '' })).toBeNull()
    expect(checkOffer({ ...ok, percentOff: Number.NaN })).toMatch('5% to 50%')   // the field emptied
    expect(checkOffer({ ...ok, startsOn: '2026-11-19', endsOn: '2026-11-19' })).toMatch('start the offer by 18 Nov')
    expect(checkOffer({ ...ok, endsOn: '2027-02-10' })).toMatch('at most 90 days')
    expect(checkOffer({ ...ok, from: '20:00', until: '00:00' })).toBeNull()   // until midnight
  })
})
