import { describe, expect, it, vi } from 'vitest'
import { applyDelta, loadDay } from './dayBoard'
import type { Appointment, DayView } from './types'

const appt = (id: string, staffId: string, hhmm: string, over: Partial<Appointment> = {}): Appointment =>
  ({ id, staffId, startsAt: `2026-11-07T${hhmm}:00Z`, status: 'CONFIRMED', ...over }) as Appointment

const board = (): DayView => ({
  date: '2026-11-07',
  myStaffId: null,
  full: true,
  seq: 's1',
  setupVersion: 3,
  changed: null,
  removed: null,
  barbers: [
    { staffId: 'b1', name: 'Ravi', hours: [], appointments: [appt('a1', 'b1', '05:00'), appt('a2', 'b1', '07:00')] },
    { staffId: 'b2', name: 'Imran', hours: [], appointments: [appt('a3', 'b2', '06:00')] },
  ],
})

const delta = (over: Partial<DayView>): DayView => ({
  date: '2026-11-07',
  barbers: null as unknown as DayView['barbers'],
  myStaffId: null,
  full: false,
  seq: 's2',
  setupVersion: 3,
  changed: [],
  removed: [],
  ...over,
})

const ids = (v: DayView) => v.barbers.map((c) => c.appointments.map((a) => a.id))

describe('day board deltas', () => {
  it('replaces by id, adds to the column by staffId in start order, drops removed ids, keeps the new seq', () => {
    const next = applyDelta(
      board(),
      delta({ changed: [appt('a2', 'b1', '07:00', { status: 'CANCELLED_BY_CUSTOMER' }), appt('a4', 'b1', '06:00')], removed: ['a1', 'zz'] }),
    )!
    expect(ids(next)).toEqual([['a4', 'a2'], ['a3']])
    expect(next.barbers[0].appointments[1].status).toBe('CANCELLED_BY_CUSTOMER')
    expect(next.seq).toBe('s2')
  })

  it('a reassigned appointment leaves its old column; a later copy of the same id wins; untouched columns are kept as they were', () => {
    const before = board()
    const next = applyDelta(before, delta({ changed: [appt('a1', 'b2', '05:00'), appt('a1', 'b2', '08:00')] }))!
    expect(ids(next)).toEqual([['a2'], ['a3', 'a1']])
    expect(next.barbers[1].appointments[1].startsAt).toBe('2026-11-07T08:00:00Z')
    const quiet = applyDelta(before, delta({ removed: ['a3'] }))!
    expect(quiet.barbers[0]).toBe(before.barbers[0])
  })

  it('same start: ordered by id, as the backend lists a column', () => {
    const next = applyDelta(board(), delta({ changed: [appt('a0', 'b1', '07:00')] }))!
    expect(ids(next)[0]).toEqual(['a1', 'a0', 'a2'])
  })

  it("can't apply a delta for another date or a barber without a column (the whole day is read instead)", () => {
    expect(applyDelta(board(), delta({ date: '2026-11-08' }))).toBeNull()
    expect(applyDelta(board(), delta({ changed: [appt('a9', 'b9', '05:00')] }))).toBeNull()
  })

  it('reads the whole day first, then since the held seq; full: true replaces; a delta it can\'t apply reads the whole day', async () => {
    const reads = { full: vi.fn(async () => board()), since: vi.fn(async () => delta({})) }
    const first = await loadDay('2026-11-07', undefined, reads)
    expect(reads.full).toHaveBeenCalledWith('2026-11-07')
    expect(reads.since).not.toHaveBeenCalled()

    const second = await loadDay('2026-11-07', first, reads)
    expect(reads.since).toHaveBeenCalledWith('2026-11-07', 's1')
    expect(second.seq).toBe('s2')

    const whole = { ...board(), seq: 's9', barbers: [] }
    reads.since.mockResolvedValueOnce(whole)
    expect((await loadDay('2026-11-07', second, reads)).barbers).toEqual([])

    reads.since.mockResolvedValueOnce(delta({ changed: [appt('a9', 'b9', '05:00')] }))
    reads.full.mockClear()
    await loadDay('2026-11-07', second, reads)
    expect(reads.full).toHaveBeenCalledTimes(1)

    // Held without a seq (an older backend), or for another date: the whole day
    reads.full.mockClear()
    await loadDay('2026-11-07', { ...board(), seq: undefined }, reads)
    await loadDay('2026-11-08', board(), reads)
    expect(reads.full).toHaveBeenCalledTimes(2)
  })

  it('a failed poll throws (the screen keeps what it had)', async () => {
    const reads = { full: vi.fn(), since: vi.fn(async () => Promise.reject(new Error('offline'))) }
    await expect(loadDay('2026-11-07', board(), reads)).rejects.toThrow('offline')
  })
})
