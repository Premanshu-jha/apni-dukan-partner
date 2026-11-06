import { ApiError, retryDelay } from './errors'
import { atCap, cursorQuery, nextAfterLast, uniqueById } from './pages'

const item = (id: string, startsAt: string) => ({ id, startsAt })

describe('keyset pages', () => {
  it('asks for the next page after the last item, its startsAt exactly as received (to the microsecond)', () => {
    const page = [item('a1', '2026-11-06T04:30:00Z'), item('a2', '2026-11-06T04:30:00.123456Z')]
    expect(nextAfterLast(page, [page], 2, 5)).toEqual({ afterStart: '2026-11-06T04:30:00.123456Z', afterId: 'a2' })
    expect(cursorQuery({ afterStart: '2026-11-06T04:30:00.123456Z', afterId: 'a2' })).toBe(
      '&afterStart=2026-11-06T04%3A30%3A00.123456Z&afterId=a2',
    )
    expect(cursorQuery(null)).toBe('')
  })

  it('stops after a short page, and at the cap', () => {
    const full = [item('a1', '2026-11-06T04:30:00Z'), item('a2', '2026-11-06T05:00:00Z')]
    expect(nextAfterLast([full[0]], [[full[0]]], 2, 5)).toBeUndefined()
    // Exactly a full page left: one more (empty) page is asked, which ends the list
    expect(nextAfterLast([], [full, []], 2, 5)).toBeUndefined()
    expect(nextAfterLast(full, [full, full, full, full, full], 2, 5)).toBeUndefined()
    expect(atCap(5, 5, true)).toBe(true)
    expect(atCap(5, 5, false)).toBe(false)
    expect(atCap(4, 5, true)).toBe(false)
  })

  it('keeps each item once, in page order (a booking moved between two taps can come again)', () => {
    const a = item('a1', 't1')
    const b = item('a2', 't2')
    const c = item('a3', 't3')
    expect(uniqueById([[a, b], [b, c]]).map((x) => x.id)).toEqual(['a1', 'a2', 'a3'])
  })
})

describe('retry delay', () => {
  it("waits as long as the backend's Retry-After asks (at most 30 s), else 1 s, 2 s, 4 s…", () => {
    expect(retryDelay(0, new ApiError(503, { code: 'SERVICE_BUSY' }, 5))).toBe(5000)
    expect(retryDelay(0, new ApiError(503, { code: 'SERVICE_BUSY' }, 600))).toBe(30_000)
    expect(retryDelay(0, ApiError.network())).toBe(1000)
    expect(retryDelay(2, new Error('x'))).toBe(4000)
    expect(retryDelay(10, new Error('x'))).toBe(30_000)
  })
})
