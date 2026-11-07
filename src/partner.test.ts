import { tokenShop } from './api/shop'
import type { Appointment } from './api/types'
import { tabsFor } from './app/Shell'
import { byDate } from './features/day/Bookings'
import { pauseEnd } from './features/day/Pause'
import { isLive, statusTone, whoText } from './features/day/status'
import { blockRange } from './features/day/TimeOff'
import { sheetError } from './features/day/AppointmentSheet'
import { ApiError } from './api/errors'
import { safePath } from './features/notifications/Inbox'
import { checkService, toPaise } from './features/setup/Services'
import { weekText } from './features/setup/Staff'
import { checkWeek, fromWeek, toWeek, withSecondShift } from './features/setup/StaffDetail'
import { checkDetails } from './features/shop/Register'
import { fitInside } from './lib/image'
import { hhmmIst, istInstant } from './lib/ist'
import { insideIndia, metresBetween, round6 } from './lib/locate'
import { can } from './lib/roles'

const jwt = (claims: object) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`

const appt = (over: Partial<Appointment>): Appointment => ({
  id: 'a1',
  kind: 'BOOKING',
  blockType: null,
  staffId: 'st1',
  status: 'CONFIRMED',
  startsAt: '2026-11-05T05:00:00Z',
  endsAt: '2026-11-05T05:30:00Z',
  startedAt: null,
  startedWithCode: null,
  services: [],
  bookingNo: 'K7M2QX',
  customerName: 'Riya',
  customerPhone: null,
  guestName: null,
  cancelReason: null,
  closureId: null,
  notStarted: false,
  noShowFrom: null,
  addedByMe: false,
  ...over,
})

describe('the sign-in token', () => {
  it('reads the shop claim, and none when the token has no shop yet or is not a JWT', () => {
    expect(tokenShop(jwt({ sub: 'u1', shop: 'shop-9', role: 'OWNER' }))).toBe('shop-9')
    expect(tokenShop(jwt({ sub: 'u1' }))).toBeNull()
    expect(tokenShop('access-1')).toBeNull()
    expect(tokenShop(null)).toBeNull()
  })
})

describe('what each role may do', () => {
  it('gives the owner everything, helpers the day without owner-only screens, barbers their own work', () => {
    expect(can('OWNER')).toMatchObject({ editSetup: true, closures: true, team: true, leave: true, leaveShop: false, deleteAccount: false })
    expect(can('HELPER')).toMatchObject({ editSetup: false, seeSetup: true, cancel: true, closures: false, team: false, leaveShop: true, deleteAccount: true })
    expect(can('BARBER')).toMatchObject({ seeSetup: false, cancel: false, reassign: false, startWithoutCode: false, callCustomer: false, deleteAccount: true })
  })

  it('shows barbers no Salon tab', () => {
    expect(tabsFor('BARBER').map((t) => t.label)).toEqual(['Today', 'Bookings', 'More'])
    expect(tabsFor('HELPER').map((t) => t.label)).toEqual(['Today', 'Bookings', 'Salon', 'More'])
  })
})

describe('registration details', () => {
  const ok = { name: 'Shine Salon', ownerName: 'Ravi Kumar', addressLine: 'Shop 12, Ithum Tower', area: 'Sector 62', city: 'Noida', pincode: '201309', gstin: '', udyamNumber: '' }

  it('accepts a complete form and checks the backend’s limits', () => {
    expect(checkDetails(ok)).toEqual({})
    expect(checkDetails({ ...ok, pincode: '012345' })).toHaveProperty('pincode')
    expect(checkDetails({ ...ok, name: 'S' })).toHaveProperty('name')
    expect(checkDetails({ ...ok, addressLine: 'Shop' })).toHaveProperty('addressLine')
    expect(checkDetails({ ...ok, gstin: '27AAPFU0939F1Z' })).toHaveProperty('gstin')
    expect(checkDetails({ ...ok, gstin: '27AAPFU0939F1ZV' })).toEqual({})
  })

  it('keeps the pin inside India and to six decimals', () => {
    expect(insideIndia(28.62, 77.36)).toBe(true)
    expect(insideIndia(51.5, -0.12)).toBe(false)
    expect(round6(28.1234567)).toBe(28.123457)
    expect(metresBetween({ lat: 28.62, lng: 77.36 }, { lat: 28.6209, lng: 77.36 })).toBe(100)
  })

  it('shrinks photos to at most 1600 on the longer side, never enlarging', () => {
    expect(fitInside(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitInside(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitInside(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('services', () => {
  it('turns rupees into paise exactly', () => {
    expect(toPaise('250')).toBe(25000)
    expect(toPaise('250.5')).toBe(25050)
    expect(toPaise('0.05')).toBe(5)
    expect(toPaise('2.555')).toBeNull()
    expect(toPaise('abc')).toBeNull()
  })

  it('checks name, minutes and price against the backend’s limits', () => {
    expect(checkService({ name: 'Haircut', minutes: '30', rupees: '200', from: false })).toEqual({})
    expect(checkService({ name: 'H', minutes: '4', rupees: '200000', from: false })).toEqual({
      name: expect.any(String),
      minutes: expect.any(String),
      rupees: expect.any(String),
    })
  })
})

describe('weekly hours', () => {
  it('round-trips a week and summarises it', () => {
    const hours = [
      { weekday: 1, start: '10:00', end: '14:00' },
      { weekday: 1, start: '16:00', end: '20:00' },
      { weekday: 3, start: '10:00', end: '20:00' },
    ]
    expect(fromWeek(toWeek(hours))).toEqual(hours)
    expect(weekText(hours)).toBe('2 days a week · Mon, Wed')
    expect(weekText([])).toBe('No hours yet')
  })

  it('refuses overlaps, backwards shifts and times off the 15-minute steps', () => {
    const w = toWeek([])
    expect(checkWeek({ ...w, 1: [{ start: '10:00', end: '14:00' }, { start: '13:00', end: '18:00' }] })).toMatch(/overlap/)
    expect(checkWeek({ ...w, 2: [{ start: '18:00', end: '10:00' }] })).toMatch(/after the start/)
    expect(checkWeek({ ...w, 3: [{ start: '10:10', end: '18:00' }] })).toMatch(/15-minute/)
    expect(checkWeek({ ...w, 4: [{ start: '10:00', end: '14:00' }, { start: '14:00', end: '20:00' }] })).toBeNull()
  })
})

describe('breaks and leave', () => {
  const f = { date: '2026-11-05', from: '13:00', to: '14:00', firstDay: '2026-11-10', lastDay: '2026-11-12' }

  it('makes a break in India time, whatever the phone’s zone', () => {
    expect(blockRange('BREAK', f)).toEqual({ startAt: '2026-11-05T07:30:00.000Z', endAt: '2026-11-05T08:30:00.000Z' })
    expect(blockRange('BREAK', { ...f, to: '12:00' })).toHaveProperty('error')
  })

  it('makes leave cover whole India days, the last one included, at most 30 days', () => {
    expect(blockRange('LEAVE', f)).toEqual({ startAt: '2026-11-09T18:30:00.000Z', endAt: '2026-11-12T18:30:00.000Z' })
    expect(blockRange('LEAVE', { ...f, lastDay: '2026-11-09' })).toHaveProperty('error')
    expect(blockRange('LEAVE', { ...f, lastDay: '2026-12-09' })).toEqual(expect.objectContaining({ startAt: expect.any(String) }))
    expect(blockRange('LEAVE', { ...f, lastDay: '2026-12-10' })).toHaveProperty('error')
  })

  it('converts India clock times both ways', () => {
    expect(istInstant('2026-11-05', '00:00')).toBe('2026-11-04T18:30:00.000Z')
    expect(hhmmIst('2026-11-04T18:30:00Z')).toBe('00:00')
  })
})

describe('pausing', () => {
  const now = new Date('2026-11-05T15:00:00Z') // 20:30 in India
  it('ends at the end of today (backend default), in an hour, or at the end of tomorrow in India', () => {
    expect(pauseEnd('today', now)).toBeNull()
    expect(pauseEnd('hour', now)).toBe('2026-11-05T16:00:00.000Z')
    expect(pauseEnd('tomorrow', now)).toBe('2026-11-06T18:30:00.000Z')
  })
})

describe('the day', () => {
  it('names who an appointment is for', () => {
    expect(whoText(appt({}))).toBe('Riya')
    expect(whoText(appt({ customerName: null }))).toBe('Customer')
    expect(whoText(appt({ kind: 'WALK_IN', guestName: null }))).toBe('Walk-in customer')
    expect(whoText(appt({ kind: 'BLOCK', blockType: 'LEAVE' }))).toBe('Leave')
  })

  it('flags bookings not started yet and keeps finished ones out of the live list', () => {
    expect(statusTone(appt({ notStarted: true }))).toBe('warn')
    expect(isLive(appt({ status: 'NO_SHOW' }))).toBe(false)
    expect(isLive(appt({ kind: 'BLOCK', status: 'BLOCKED' }))).toBe(true)
  })

  it('groups a list by India date (01:30 in India is the next day in UTC terms)', () => {
    const groups = byDate([
      appt({ id: '1', startsAt: '2026-11-04T20:00:00Z' }),
      appt({ id: '2', startsAt: '2026-11-05T05:00:00Z' }),
      appt({ id: '3', startsAt: '2026-11-06T05:00:00Z' }),
    ])
    expect(groups.map((g) => [g.date, g.items.length])).toEqual([
      ['2026-11-05', 2],
      ['2026-11-06', 1],
    ])
  })
})

describe('messages', () => {
  it('opens only this app’s pages from a message', () => {
    expect(safePath('/salon/day?date=2026-11-06')).toBe('/salon/day?date=2026-11-06')
    expect(safePath('/shops/me')).toBe('/')
    // "A shop for you" (SHOP_HANDOVER_REQUEST): the hand-over requests, with or without a shop
    expect(safePath('/handover')).toBe('/handover')
    expect(safePath('/handover/../evil')).toBeNull()
    expect(safePath('/bookings/b1')).toBeNull()
    expect(safePath('//evil.example')).toBeNull()
    expect(safePath(null)).toBeNull()
  })
})

describe('refusals in the appointment sheet', () => {
  it('spells out tries left, a change by someone else, and field reasons', () => {
    expect(sheetError(new ApiError(400, { code: 'WRONG_START_CODE', message: "That code doesn't match.", details: { triesLeft: 1 } }))).toBe(
      "That code doesn't match. 1 try left.",
    )
    expect(sheetError(new ApiError(409, { code: 'WRONG_STATUS', message: 'It is NO_SHOW now. Reload.', details: { reason: 'CHANGED', status: 'NO_SHOW' } }))).toBe(
      'Someone changed it meanwhile: it is now "No-show".',
    )
    expect(sheetError(new ApiError(400, { code: 'VALIDATION_FAILED', message: 'Some fields are not valid', details: { staffId: 'is not free' } }))).toBe(
      'The barber: is not free.',
    )
  })
})

describe("a barber's own breaks", () => {
  it('are at most 4 hours (checked before sending)', () => {
    const f = { date: '2026-11-05', from: '10:00', to: '14:30', firstDay: '', lastDay: '', own: true }
    expect(blockRange('BREAK', f)).toHaveProperty('error')
    expect(blockRange('BREAK', { ...f, to: '14:00' })).toHaveProperty('startAt')
    expect(blockRange('BREAK', { ...f, own: false })).toHaveProperty('startAt')
  })
})

describe('hand-over requests gone meanwhile', async () => {
  const { goneText } = await import('./features/shop/ownership')
  it('says why for each details.status of 409 HANDOVER_GONE', () => {
    expect(goneText('CANCELLED')).toBe('The owner cancelled this request.')
    expect(goneText('EXPIRED')).toMatch(/ran out/)
    expect(goneText('CLOSED')).toMatch(/closed/)
    expect(goneText('OWNER_CHANGED')).toMatch(/different owner/)
    expect(goneText('ACCEPTED')).toMatch(/already accepted/)
    expect(goneText('DECLINED')).toMatch(/already declined/)
    expect(goneText('CHANGED')).toBe("This hand-over request isn't open any more.")
  })
})

describe('adding a second shift', () => {
  const ok = (day: Array<{ start: string; end: string }>) => checkWeek({ 1: day, 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] })
  it('starts where the first ends, or cuts a shift running to closing at its middle with an hour between', () => {
    expect(withSecondShift([])).toEqual([{ start: '10:00', end: '20:00' }])
    expect(withSecondShift([{ start: '10:00', end: '20:00' }])).toEqual([
      { start: '10:00', end: '15:00' },
      { start: '16:00', end: '20:00' },
    ])
    expect(withSecondShift([{ start: '10:00', end: '14:00' }])).toEqual([
      { start: '10:00', end: '14:00' },
      { start: '14:00', end: '20:00' },
    ])
    expect(withSecondShift([{ start: '18:00', end: '24:00' }])).toEqual([
      { start: '18:00', end: '21:00' },
      { start: '22:00', end: '24:00' },
    ])
    // Too short to cut: after it, or before it at the end of the day
    expect(withSecondShift([{ start: '19:00', end: '21:00' }])).toEqual([
      { start: '19:00', end: '21:00' },
      { start: '21:00', end: '24:00' },
    ])
    expect(withSecondShift([{ start: '22:30', end: '24:00' }])).toEqual([
      { start: '18:30', end: '22:30' },
      { start: '22:30', end: '24:00' },
    ])
    for (const first of [
      { start: '10:00', end: '20:00' },
      { start: '09:00', end: '21:00' },
      { start: '10:00', end: '14:00' },
      { start: '18:00', end: '24:00' },
      { start: '19:00', end: '21:00' },
      { start: '22:30', end: '24:00' },
    ]) {
      expect(ok(withSecondShift([first])), JSON.stringify(first)).toBeNull()
    }
  })
})
