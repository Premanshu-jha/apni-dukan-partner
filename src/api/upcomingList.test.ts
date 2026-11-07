import { describe, expect, it } from 'vitest'
import type { Appointment } from './types'
import { applyUpcoming, compareKey, micros, pageOf, type UpcomingChanges, type UpcomingPage } from './upcomingList'

const at = (hhmm: string, fraction = '') => `2026-11-08T${hhmm}:00${fraction}Z`
const appt = (id: string, hhmm: string, over: Partial<Appointment> = {}): Appointment =>
  ({ id, startsAt: at(hhmm), status: 'CONFIRMED', ...over }) as Appointment
const delta = (over: Partial<UpcomingChanges>): UpcomingChanges => ({ full: false, seq: 's2', setupVersion: 1, changed: [], removed: [], ...over })
const ids = (pages: UpcomingPage[]) => pages.map((p) => p.items.map((a) => a.id))

describe('the coming-up list with deltas', () => {
  it('orders by the instant to the microsecond, then id', () => {
    expect(micros(at('05:00', '.000123'))).toBe(micros(at('05:00')) + 123)
    expect(compareKey({ startsAt: at('05:00', '.5'), id: 'a' }, { startsAt: at('05:00', '.000123'), id: 'b' })).toBeGreaterThan(0)
    expect(compareKey({ startsAt: at('05:00'), id: 'a' }, { startsAt: at('05:00'), id: 'b' })).toBeLessThan(0)
  })

  it('a page keeps the cursor after its last item when full, none when short', () => {
    expect(pageOf([appt('a1', '05:00'), appt('a2', '06:00')], 2).next).toEqual({ afterStart: at('06:00'), afterId: 'a2' })
    expect(pageOf([appt('a1', '05:00')], 2).next).toBeNull()
  })

  it('replaces, inserts and drops across pages, keeping each page\'s range and cursor', () => {
    const pages = [pageOf([appt('a1', '05:00'), appt('a2', '06:00')], 2), pageOf([appt('a3', '07:00')], 2)]
    const next = applyUpcoming(pages, delta({ changed: [appt('a4', '05:30'), appt('a3', '05:45')], removed: ['a1', 'zz'] }))
    expect(ids(next)).toEqual([['a4', 'a3', 'a2'], []])
    expect(next[0].next).toEqual(pages[0].next)
  })

  it('more pages on the backend: a booking after the loaded end is left for Show more; one moved past it leaves', () => {
    const pages = [pageOf([appt('a1', '05:00'), appt('a2', '06:00')], 2)]
    const next = applyUpcoming(pages, delta({ changed: [appt('a9', '09:00'), appt('a1', '08:00'), appt('a0', '04:00')] }))
    expect(ids(next)).toEqual([['a0', 'a2']])
    expect(next[0].next).toEqual({ afterStart: at('06:00'), afterId: 'a2' })
  })

  it('the list is complete (short last page): anything new goes in, at its place', () => {
    const pages = [pageOf([appt('a1', '05:00')], 2)]
    expect(ids(applyUpcoming(pages, delta({ changed: [appt('a9', '23:00')] })))).toEqual([['a1', 'a9']])
    expect(applyUpcoming([], delta({ changed: [appt('a9', '23:00')] }))).toEqual([])
  })
})
