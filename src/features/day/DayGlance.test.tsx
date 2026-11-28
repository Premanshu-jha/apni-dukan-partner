import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import type { BarberColumn } from '../../api/types'
import { DaySummary, GoogleListingCard, SlowDayShare } from './DayGlance'

/**
 * Today's glance line, the slow-day share card and the owner's Google Maps card, at fixed times of day (IST) so the
 * evening rules (tomorrow from 6 pm, no share card after 6 pm) don't depend on when the tests run.
 */
const state = vi.hoisted(() => ({
  tomorrow: [] as BarberColumn[],
  dayCalls: [] as string[],
  card: { show: true, addUrl: 'https://business.google.com/create' } as { show: boolean; addUrl: string },
  answers: [] as string[],
  answerFails: false,
}))

vi.mock('../../api/salon', async (orig) => {
  const real = await orig<typeof import('../../api/salon')>()
  return {
    ...real,
    dayApi: {
      ...real.dayApi,
      day: async (date: string) => {
        state.dayCalls.push(date)
        return { date, barbers: state.tomorrow, myStaffId: null }
      },
    },
  }
})

vi.mock('../../api/shop', async (orig) => {
  const real = await orig<typeof import('../../api/shop')>()
  return {
    ...real,
    googleListingApi: {
      get: async () => state.card,
      answer: async (a: string) => {
        if (state.answerFails) throw new Error('offline')
        state.answers.push(a)
        return { ...state.card, show: false }
      },
    },
  }
})

const DAY = '2026-11-10'
const at = (hhmm: string, day = DAY) => new Date(`${day}T${hhmm}:00+05:30`)

function booking(startsAt: Date, status = 'CONFIRMED', kind = 'BOOKING') {
  return {
    id: startsAt.toISOString(),
    kind,
    status,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
  }
}

function column(name: string, ...appointments: ReturnType<typeof booking>[]) {
  return { staffId: name, name, appointments } as unknown as BarberColumn
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  state.tomorrow = []
  state.dayCalls = []
  state.card = { show: true, addUrl: 'https://business.google.com/create' }
  state.answers = []
  state.answerFails = false
  localStorage.clear()
})

afterEach(() => vi.useRealTimers())

describe('DaySummary', () => {
  test('counts what is still to come today, the next one and its barber; over, cancelled and breaks are left out', () => {
    vi.setSystemTime(at('11:00'))
    const columns = [
      column('Raju', booking(at('10:00')), booking(at('12:30')), booking(at('13:00'), 'CANCELLED_BY_SALON')),
      column('Suresh', booking(at('12:00')), booking(at('14:00'), 'CONFIRMED', 'BLOCK')),
    ]
    wrap(<DaySummary columns={columns} own={false} onTomorrow={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 bookings still to come today · next at 12:00 PM with Suresh')
    // Before 6 pm tomorrow isn't asked
    expect(state.dayCalls).toEqual([])
  })

  test('a barber sees his own; nothing left says so', () => {
    vi.setSystemTime(at('11:00'))
    const { unmount } = wrap(<DaySummary columns={[column('Raju', booking(at('12:30')))]} own onTomorrow={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent(/1 booking.*12:30 PM/)
    expect(screen.getByRole('status')).not.toHaveTextContent('Raju')
    unmount()
    wrap(<DaySummary columns={[column('Raju', booking(at('09:00')))]} own={false} onTomorrow={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('No more bookings today')
  })

  test('from 6 pm it also says tomorrow’s bookings and the first one, with “See tomorrow”', async () => {
    vi.setSystemTime(at('18:05'))
    state.tomorrow = [column('Raju', booking(at('10:30', '2026-11-11'))), column('Suresh', booking(at('09:30', '2026-11-11')))]
    const onTomorrow = vi.fn()
    wrap(<DaySummary columns={[]} own={false} onTomorrow={onTomorrow} />)
    expect(await screen.findByText('Tomorrow: 2 bookings')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('first at 9:30 AM')
    expect(state.dayCalls).toEqual(['2026-11-11'])
    fireEvent.click(screen.getByRole('button', { name: 'See tomorrow' }))
    expect(onTomorrow).toHaveBeenCalled()
  })

  test('nothing tomorrow: says so', async () => {
    vi.setSystemTime(at('20:00'))
    wrap(<DaySummary columns={[]} own={false} onTomorrow={() => {}} />)
    expect(await screen.findByText('Tomorrow: no bookings yet')).toBeInTheDocument()
  })
})

describe('SlowDayShare', () => {
  test('a slow morning: the card with one tap to the share screen; “Not today” puts it away for the day', () => {
    vi.setSystemTime(at('11:00'))
    const { unmount } = wrap(<SlowDayShare columns={[]} />)
    expect(screen.getByText('Few bookings today?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Share my salon' })).toHaveAttribute('href', '/salon/share')
    fireEvent.click(screen.getByRole('button', { name: 'Not today' }))
    expect(screen.queryByText('Few bookings today?')).not.toBeInTheDocument()
    unmount()
    // Still put away when Today opens again that day; back the next day
    const again = wrap(<SlowDayShare columns={[]} />)
    expect(screen.queryByText('Few bookings today?')).not.toBeInTheDocument()
    again.unmount()
    vi.setSystemTime(at('11:00', '2026-11-11'))
    wrap(<SlowDayShare columns={[]} />)
    expect(screen.getByText('Few bookings today?')).toBeInTheDocument()
  })

  test('not after a full day (more than 2 done), not before 8 am; Today left open past midnight brings it back', () => {
    vi.setSystemTime(at('16:00'))
    const done = [booking(at('10:00'), 'COMPLETED'), booking(at('11:00'), 'COMPLETED'), booking(at('12:00'), 'COMPLETED')]
    const { unmount } = wrap(<SlowDayShare columns={[column('Raju', ...done)]} />)
    expect(screen.queryByText('Few bookings today?')).not.toBeInTheDocument()
    unmount()
    vi.setSystemTime(at('06:30'))
    const early = wrap(<SlowDayShare columns={[]} />)
    expect(screen.queryByText('Few bookings today?')).not.toBeInTheDocument()
    early.unmount()
    vi.setSystemTime(at('11:00'))
    const view = wrap(<SlowDayShare columns={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not today' }))
    vi.setSystemTime(at('11:00', '2026-11-11'))
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SlowDayShare columns={[]} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    // The same card still on screen the next day: that day's own "Not today", not yesterday's
    expect(screen.getByText('Few bookings today?')).toBeInTheDocument()
  })

  test('not shown with bookings still to come, nor after 6 pm', () => {
    vi.setSystemTime(at('11:00'))
    const { unmount } = wrap(<SlowDayShare columns={[column('Raju', booking(at('15:00')))]} />)
    expect(screen.queryByText('Few bookings today?')).not.toBeInTheDocument()
    unmount()
    vi.setSystemTime(at('18:00'))
    wrap(<SlowDayShare columns={[]} />)
    expect(screen.queryByText('Few bookings today?')).not.toBeInTheDocument()
  })
})

describe('GoogleListingCard', () => {
  test('Google’s page one tap away; “I’ve added it” sends the answer and puts the card away', async () => {
    wrap(<GoogleListingCard />)
    expect(await screen.findByText('Get found on Google Maps too')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add my salon to Google' })).toHaveAttribute('href', 'https://business.google.com/create')
    fireEvent.click(screen.getByRole('button', { name: "I've added it" }))
    await waitFor(() => expect(screen.queryByText('Get found on Google Maps too')).not.toBeInTheDocument())
    expect(state.answers).toEqual(['ADDED'])
  })

  test('while one answer is on its way, neither button can be tapped', async () => {
    let finish: () => void = () => {}
    state.card = { show: true, addUrl: 'https://business.google.com/create' }
    const { googleListingApi } = await import('../../api/shop')
    const slow = vi.spyOn(googleListingApi, 'answer').mockImplementation(
      () => new Promise((r) => { finish = () => r({ show: false, addUrl: '' }) }),
    )
    wrap(<GoogleListingCard />)
    fireEvent.click(await screen.findByRole('button', { name: "I've added it" }))
    await waitFor(() => expect(screen.getByRole('button', { name: "Don't show again" })).toBeDisabled())
    finish()
    slow.mockRestore()
  })

  test('“Don’t show again” offline still puts it away on this phone', async () => {
    state.answerFails = true
    wrap(<GoogleListingCard />)
    fireEvent.click(await screen.findByRole('button', { name: "Don't show again" }))
    await waitFor(() => expect(screen.queryByText('Get found on Google Maps too')).not.toBeInTheDocument())
  })

  test('nothing when Google has the salon (or it isn’t known)', async () => {
    state.card = { show: false, addUrl: 'https://business.google.com/create' }
    wrap(<GoogleListingCard />)
    await waitFor(() => expect(state.dayCalls).toEqual([]))
    expect(screen.queryByText('Get found on Google Maps too')).not.toBeInTheDocument()
  })
})
