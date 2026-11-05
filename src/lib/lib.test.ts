import { addDays, clock12, dateOfIst, dayLabel, nextDates, timeIst, todayIst, weekdayName } from './ist'
import { duration, rupees } from './money'
import { formatPhone, looksLikeEmail, normalizePhone } from './phone'

describe('India time', () => {
  // 20:00 UTC on 4 Nov is 01:30 on 5 Nov in India.
  const lateUtc = new Date('2026-11-04T20:00:00Z')

  it('uses the India date, not the phone or UTC date', () => {
    expect(todayIst(lateUtc)).toBe('2026-11-05')
    expect(dateOfIst('2026-11-04T20:00:00Z')).toBe('2026-11-05')
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('lists the next days starting today', () => {
    expect(nextDates(3, lateUtc)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
  })

  it('names days', () => {
    expect(dayLabel('2026-11-05', lateUtc)).toBe('Today')
    expect(dayLabel('2026-11-06', lateUtc)).toBe('Tomorrow')
    expect(dayLabel('2026-11-09', lateUtc)).toBe('Mon 9 Nov')
  })

  it('shows times in India', () => {
    expect(timeIst('2026-11-05T11:00:00Z')).toBe('4:30 PM')
    expect(clock12('09:05')).toBe('9:05 AM')
    expect(clock12('12:00')).toBe('12:00 PM')
    expect(clock12('00:30')).toBe('12:30 AM')
    expect(weekdayName(1)).toBe('Mon')
    expect(weekdayName(7)).toBe('Sun')
  })
})

describe('money and durations', () => {
  it('formats paise as rupees', () => {
    expect(rupees(25000)).toBe('₹250')
    expect(rupees(125000)).toBe('₹1,250')
    expect(rupees(9950)).toBe('₹99.50')
    expect(rupees(30000, true)).toBe('from ₹300')
  })
  it('formats durations', () => {
    expect(duration(45)).toBe('45 min')
    expect(duration(60)).toBe('1 h')
    expect(duration(90)).toBe('1 h 30 min')
  })
})

describe('phone numbers', () => {
  it('accepts what people type, like the backend', () => {
    expect(normalizePhone('+91 98480 12345')).toBe('9848012345')
    expect(normalizePhone('098480-12345')).toBe('9848012345')
    expect(normalizePhone('9848012345')).toBe('9848012345')
  })
  it('rejects numbers that are not Indian mobiles', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('5848012345')).toBeNull()
  })
  it('formats and checks', () => {
    expect(formatPhone('9848012345')).toBe('98480 12345')
    expect(looksLikeEmail('a@b.in')).toBe(true)
    expect(looksLikeEmail('a@b')).toBe(false)
  })
})
