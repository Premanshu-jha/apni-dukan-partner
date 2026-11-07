import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { Appointment, DayView } from '../../api/types'
import { addDays, istInstant, todayIst } from '../../lib/ist'
import { msToIstMidnight } from '../../lib/useNow'

/**
 * The day board of a big salon: 50 barbers, 40 appointments each (2,000 cards). Only the board is real; the queries
 * and the side panels are stubbed. Card draws are counted through totalPaise, which every card calls once per draw.
 */
const state = vi.hoisted(() => ({ board: null as DayView | null, cardDraws: 0, dayCalls: [] as string[] }))

vi.mock('../../api/salon', async (orig) => ({
  ...(await orig<typeof import('../../api/salon')>()),
  useDay: (date: string) => {
    state.dayCalls.push(date)
    return { isPending: false, isError: false, data: state.board ?? undefined, refetch: vi.fn() }
  },
  useServices: () => ({ data: undefined }),
  useStaff: () => ({ data: undefined }),
}))
vi.mock('../../api/shop', async (orig) => ({
  ...(await orig<typeof import('../../api/shop')>()),
  useShop: () => ({ id: 'shop1', name: 'Kumar Salon', myRole: 'OWNER', status: 'APPROVED', statusReason: null }),
}))
vi.mock('./status', async (orig) => {
  const real = await orig<typeof import('./status')>()
  return {
    ...real,
    totalPaise: (a: Appointment) => {
      state.cardDraws++
      return real.totalPaise(a)
    },
  }
})
vi.mock('../notifications/Bell', () => ({ Bell: () => null }))
vi.mock('../profile/Notifications', () => ({ NotificationsPrompt: () => null }))
vi.mock('../shop/HandoverOffers', () => ({ HandoverOffers: () => null }))
vi.mock('../shop/InviteOffers', () => ({ InviteOffers: () => null }))
vi.mock('./Pause', () => ({ PauseControl: () => null }))
vi.mock('./AppointmentSheet', () => ({
  AppointmentSheet: ({ a, gone }: { a: Appointment; gone: boolean }) => (
    <div role="dialog" aria-label="Appointment">
      {a.id}
      {gone ? ' (gone)' : ''}
    </div>
  ),
}))

const { Today, MANY_BARBERS, cardTimes, openingColumn } = await import('./Today')

function appt(staff: number, i: number, date: string): Appointment {
  const minutes = 9 * 60 + i * 15
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return {
    id: `a-${staff}-${i}`,
    kind: 'BOOKING',
    blockType: null,
    staffId: `st${staff}`,
    status: 'CONFIRMED',
    startsAt: istInstant(date, hhmm(minutes)),
    endsAt: istInstant(date, hhmm(minutes + 15)),
    startedAt: null,
    startedWithCode: null,
    services: [{ serviceId: 'v1', name: 'Haircut', durationMinutes: 15, pricePaise: 20000, priceIsFrom: false }],
    bookingNo: `B${staff}x${i}`,
    customerName: `Customer ${staff}-${i}`,
    customerPhone: null,
    guestName: null,
    cancelReason: null,
    closureId: null,
    notStarted: false,
    noShowFrom: null,
    addedByMe: false,
  } as Appointment
}

function bigBoard(date: string, barbers = 50, each = 40): DayView {
  return {
    date,
    myStaffId: null,
    barbers: Array.from({ length: barbers }, (_, s) => ({
      staffId: `st${s}`,
      name: `Barber ${s}`,
      hours: [{ start: '09:00', end: '21:00' }],
      appointments: Array.from({ length: each }, (_, i) => appt(s, i, date)),
    })),
  } as DayView
}

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/salon/day"
          element={
            <>
              <Today />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

// Counted from the DOM (role queries over 2,000 buttons are slow in jsdom, not in the app)
const cards = () => document.querySelectorAll('li > button')

beforeEach(() => {
  state.cardDraws = 0
  state.board = null
  state.dayCalls = []
})
afterEach(() => vi.useRealTimers())

describe('the day board of a big salon (2,000 appointments)', () => {
  it('opens on one barber’s column, draws everyone within budget, and redraws only what changed', () => {
    const today = todayIst()
    state.board = bigBoard(today)
    let t = performance.now()
    const view = renderAt('/salon/day')
    // 50 barbers: one column at first
    expect(50).toBeGreaterThan(MANY_BARBERS)
    expect(cards()).toHaveLength(40)
    expect(state.cardDraws).toBe(40)
    expect(performance.now() - t).toBeLessThan(2000)

    t = performance.now()
    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }))
    const everyone = performance.now() - t
    expect(cards()).toHaveLength(2000)
    expect(state.cardDraws).toBe(40 + 2000)
    // jsdom on a CI runner; a real phone draws only what is near the screen (content-visibility)
    expect(everyone).toBeLessThan(10_000)

    // A refresh with one changed appointment: the query keeps every other object (structural sharing / applyDelta)
    const before = state.board
    const changed = { ...before.barbers[3].appointments[5], status: 'IN_SERVICE' as const }
    state.board = {
      ...before,
      barbers: before.barbers.map((c, i) =>
        i === 3 ? { ...c, appointments: c.appointments.map((a, j) => (j === 5 ? changed : a)) } : c,
      ),
    }
    state.cardDraws = 0
    t = performance.now()
    view.rerender(
      <MemoryRouter initialEntries={['/salon/day']}>
        <Routes>
          <Route
            path="/salon/day"
            element={
              <>
                <Today />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(state.cardDraws).toBe(1)
    expect(performance.now() - t).toBeLessThan(2000)
    expect(screen.getAllByText('In chair').length).toBeGreaterThan(0)
  }, 30_000)

  it('nothing ticks: the board is not drawn again every 30 seconds, only when the date changes at midnight', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    // 11:59:00 PM in India
    const today = todayIst()
    vi.setSystemTime(new Date(istInstant(today, '23:59')))
    state.board = bigBoard(today, 2, 10)
    renderAt('/salon/day')
    const calls = state.dayCalls.length
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(state.dayCalls.length).toBe(calls)
    // Past midnight: the board moves on to the new day by itself
    state.board = bigBoard(addDays(today, 1), 2, 10)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(state.dayCalls.at(-1)).toBe(addDays(today, 1))
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('works out a card’s times once per appointment object', () => {
    const a = appt(1, 1, todayIst())
    expect(cardTimes(a)).toBe(cardTimes(a))
    expect(cardTimes({ ...a })).not.toBe(cardTimes(a))
    expect(cardTimes(a).start).toMatch(/AM|PM/)
  })

  it('knows how long until midnight in India', () => {
    expect(msToIstMidnight(Date.parse('2026-11-07T18:29:00Z'))).toBe(60_000)
    expect(msToIstMidnight(Date.parse('2026-11-07T18:30:00Z'))).toBe(86_400_000)
  })
})

describe('a link that opens one appointment (?open=)', () => {
  it('opens it on load, in its barber’s column, and takes it out of the address', () => {
    const today = todayIst()
    state.board = bigBoard(today, 10, 3)
    renderAt(`/salon/day?date=${today}&open=a-7-2`)
    expect(screen.getByRole('dialog', { name: 'Appointment' })).toHaveTextContent('a-7-2')
    expect(screen.getByRole('button', { name: 'Barber 7' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('where')).toHaveTextContent(`/salon/day?date=${today}`)
    expect(screen.getByTestId('where')).not.toHaveTextContent('open=')
  })

  it('says so when it is no longer on that day', () => {
    const today = todayIst()
    state.board = bigBoard(today, 2, 3)
    renderAt(`/salon/day?date=${today}&open=moved-away`)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/isn't on this day's board any more/)).toBeInTheDocument()
  })
})

describe('the column the board opens on', () => {
  const block = (a: Appointment): Appointment => ({ ...a, kind: 'BLOCK', blockType: 'BREAK' })
  it('is everyone with up to MANY_BARBERS barbers', () => {
    expect(openingColumn(bigBoard(todayIst(), MANY_BARBERS, 0).barbers)).toBe('all')
  })
  it('with more, is the first barber with a booking or walk-in (a break alone does not count)', () => {
    const board = bigBoard(todayIst(), MANY_BARBERS + 3, 2)
    board.barbers[0].appointments = []
    board.barbers[1].appointments = board.barbers[1].appointments.map(block)
    expect(openingColumn(board.barbers)).toBe('st2')
  })
  it('is everyone when nobody has a booking that day', () => {
    const board = bigBoard(todayIst(), MANY_BARBERS + 3, 1)
    for (const b of board.barbers) b.appointments = b.appointments.map(block)
    expect(openingColumn(board.barbers)).toBe('all')
  })
  it('opens the board on that column, not an empty one', () => {
    state.board = bigBoard(todayIst(), MANY_BARBERS + 1, 3)
    state.board.barbers[0].appointments = []
    renderAt('/salon/day')
    expect(cards()).toHaveLength(3)
    expect(screen.getByText('Customer 1-0')).toBeInTheDocument()
  })
})
