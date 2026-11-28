import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { DayView, SalonHours, ServiceItem, Shop, Staff, User } from '../../api/types'
import { todayIst } from '../../lib/ist'
import { useSession } from '../../store/session'

/**
 * Today's guide: the "Get your salon ready" card and the first-time tips, and which of them shows first. The day and
 * the setup lists are stubbed; the card and the tips are real.
 */
const state = vi.hoisted(() => ({
  shop: { id: 'shop1', name: 'Kumar Salon', myRole: 'OWNER', status: 'APPROVED', statusReason: null } as Partial<Shop>,
  services: [] as ServiceItem[],
  staff: [] as Staff[],
  hours: { version: null, days: [] } as SalonHours,
  members: [] as Array<{ role: string }>,
  invites: [] as unknown[],
  offers: [] as unknown[],
  push: true,
  pushOn: false as boolean | null,
  addMe: vi.fn(),
  turnOn: vi.fn(),
  servicesFail: false,
  refetch: vi.fn(),
}))

vi.mock('../../api/salon', async (orig) => {
  const real = await orig<typeof import('../../api/salon')>()
  return {
    ...real,
    useDay: (date: string) => ({ isPending: false, isError: false, data: { date, barbers: [], myStaffId: null } as unknown as DayView, refetch: vi.fn() }),
    useServices: () =>
      state.servicesFail ? { data: undefined, isError: true, refetch: state.refetch } : { data: state.services, isError: false },
    useStaff: () => ({ data: state.staff, isError: false }),
    useSalonHours: () => ({ data: state.hours, isError: false }),
    addOwnerAsBarber: state.addMe,
    dayApi: { ...real.dayApi, members: async () => state.members },
  }
})
vi.mock('../../api/shop', async (orig) => {
  const real = await orig<typeof import('../../api/shop')>()
  return { ...real, useShop: () => state.shop, shopApi: { ...real.shopApi, invites: async () => state.invites } }
})
vi.mock('../../api/offers', async (orig) => {
  const real = await orig<typeof import('../../api/offers')>()
  return { ...real, offersApi: { ...real.offersApi, list: async () => state.offers } }
})
vi.mock('../../api/push', async (orig) => ({
  ...(await orig<typeof import('../../api/push')>()),
  pushSupported: () => state.push,
  turnOnPush: state.turnOn,
}))
vi.mock('../profile/Notifications', async (orig) => {
  const real = await orig<typeof import('../profile/Notifications')>()
  return {
    ...real,
    useSubscribed: () => [state.pushOn, (on: boolean) => (state.pushOn = on)] as const,
    NotificationsPrompt: () => <p>Notifications prompt</p>,
  }
})
vi.mock('../notifications/Bell', () => ({ Bell: () => null }))
vi.mock('../shop/HandoverOffers', () => ({ HandoverOffers: () => null }))
vi.mock('../shop/InviteOffers', () => ({ InviteOffers: () => null }))
vi.mock('../shop/RecheckWaiting', () => ({ RecheckWaiting: () => null }))
vi.mock('../shop/Home', () => ({ WaitingForVisit: () => <p>Waiting for visit</p> }))
vi.mock('./Pause', () => ({ PauseControl: ({ offer = true }: { offer?: boolean }) => <p>{offer ? 'Pause offered' : 'Pause not offered'}</p> }))
vi.mock('../subscription/SubscriptionBanner', () => ({ SubscriptionBanner: () => null }))

const { Today } = await import('./Today')
const { useLanguageOffer } = await import('../guide/languageOffer')
const { SkippedStepsRow } = await import('../guide/SkippedStepsRow')

const service = (id: string) => ({ id, name: 'Haircut', active: true, durationMinutes: 30, pricePaise: 10000, priceIsFrom: false, version: 1 }) as unknown as ServiceItem
const barber = (id: string, name: string, over: Partial<Staff> = {}) =>
  ({ id, name, active: true, serviceIds: ['v1'], hours: [{ weekday: 1, start: '10:00', end: '20:00' }], loginPhone: null, invitedPhone: null, ...over }) as Staff
const OPEN = { version: '1', days: [{ weekday: 1 }] } as unknown as SalonHours

let where = ''
let lastState: unknown = null
function Where() {
  const l = useLocation()
  where = l.pathname + l.search
  lastState = l.state
  return null
}
function show(path = '/salon/day', screen = <Today />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<>{screen}<Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
/** A salon with everything needed done (customers can book). */
function readySalon() {
  state.services = [service('v1')]
  state.staff = [barber('b1', 'Raju')]
  state.hours = OPEN
}
const skipTips = () => fireEvent.click(screen.getByRole('button', { name: 'Skip tips' }))

beforeEach(() => {
  localStorage.clear()
  state.shop = { id: 'shop1', name: 'Kumar Salon', myRole: 'OWNER', status: 'APPROVED', statusReason: null }
  state.services = []
  state.staff = []
  state.hours = { version: null, days: [] }
  state.members = []
  state.invites = []
  state.offers = []
  state.push = true
  state.pushOn = false
  state.addMe.mockReset()
  state.turnOn.mockReset()
  state.servicesFail = false
  state.refetch.mockReset()
  useLanguageOffer.setState({ open: false })
  useSession.setState({ status: 'signedIn', user: { id: 'u1', phone: '9000000001', name: 'Kumar' } as unknown as User })
})

describe('Get your salon ready', () => {
  it('a new owner: the card with progress and the first needed step; the tips wait', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Get your salon ready' })).toBeInTheDocument()
    expect(screen.getByText('0 of 8 done')).toBeInTheDocument()
    const next = screen.getByRole('region', { name: 'Next step' })
    expect(next).toHaveTextContent('Add your services and prices')
    expect(screen.getByRole('link', { name: 'Add services' })).toHaveAttribute('href', '/setup/services')
    // Needed steps can't be skipped
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tips for using the app' })).toBeNull()
    // The card asks about notifications itself: no second line for it
    expect(screen.queryByText(/Booking alerts are/)).toBeNull()
  })

  it('no barber yet: Add a barber, and Add me as a barber right there', async () => {
    state.services = [service('v1')]
    state.hours = OPEN
    show()
    expect(await screen.findByRole('link', { name: 'Add a barber' })).toHaveAttribute('href', '/setup/staff')
    fireEvent.click(screen.getByRole('button', { name: 'Add me as a barber' }))
    await waitFor(() => expect(state.addMe).toHaveBeenCalledTimes(1))
  })

  it('no barber customers can book yet: needed, it opens the first barber to set up, and the tips wait', async () => {
    readySalon()
    state.staff = [barber('b2', 'Salim', { hours: [] }), barber('b3', 'Arun', { serviceIds: [] })]
    show()
    expect(await screen.findByRole('link', { name: 'Open Salim' })).toHaveAttribute('href', '/setup/staff/b2')
    expect(screen.getByRole('region', { name: 'Next step' })).toHaveTextContent('Give Salim his services and weekly hours')
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tips for using the app' })).toBeNull()
  })

  it('bookable with one barber set up: the others are good to do (after the tips), open the exact barber and can be skipped', async () => {
    readySalon()
    state.staff = [barber('b1', 'Raju'), barber('b2', 'Salim', { hours: [] }), barber('b3', 'Arun', { serviceIds: [] })]
    show()
    // Customers can book (Raju): the tips come, as for any ready salon
    expect(await screen.findByRole('region', { name: 'Tips for using the app' })).toBeInTheDocument()
    skipTips()
    const next = await screen.findByRole('region', { name: 'Next step' })
    expect(next).toHaveTextContent('Give Salim his services and weekly hours')
    expect(screen.getByText('2 barbers still need them')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Salim' })).toHaveAttribute('href', '/setup/staff/b2')
    expect(screen.getByText('Needed before customers can book').nextElementSibling).not.toHaveTextContent('Salim')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByRole('region', { name: 'Next step' })).toHaveTextContent('Get a notification on this phone')
    expect(JSON.parse(localStorage.getItem('adp.guide.skips.u1.shop1')!)).toEqual(['allBarbers'])
  })

  it("each step's screen is told where it was opened from, so its back arrow comes back to Today", async () => {
    show(`/salon/day?date=${todayIst()}`)
    const add = await screen.findByRole('link', { name: 'Add services' })
    fireEvent.click(add)
    await waitFor(() => expect(where).toBe('/setup/services'))
    expect(lastState).toEqual({ from: `/salon/day?date=${todayIst()}` })
  })

  it('opening hours not set: Set opening hours', async () => {
    readySalon()
    state.hours = { version: null, days: [] }
    show()
    expect(await screen.findByRole('link', { name: 'Set opening hours' })).toHaveAttribute('href', '/setup/hours')
  })

  it('needed done: the tips come first, then the good-to-do steps, each skippable and remembered', async () => {
    readySalon()
    const { unmount } = show()
    expect(await screen.findByRole('region', { name: 'Tips for using the app' })).toBeInTheDocument()
    // One guide card at a time
    expect(screen.queryByRole('heading', { name: 'Get your salon ready' })).toBeNull()
    skipTips()
    expect(await screen.findByText('4 of 8 done')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next step' })).toHaveTextContent('Get a notification on this phone for every booking')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    // Skipped: out of the count, the next one is the team's sign-in
    expect(await screen.findByText('4 of 7 done')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Barbers' sign-in" })).toHaveAttribute('href', '/setup/staff')
    expect(screen.getByRole('link', { name: 'Add a helper' })).toHaveAttribute('href', '/team')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('link', { name: 'Share your salon' })).toHaveAttribute('href', '/salon/share')
    unmount()
    // Back later: the tips and the two skips are remembered
    show()
    expect(await screen.findByText('4 of 6 done')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tips for using the app' })).toBeNull()
  })

  it('tapping Share your salon counts it done; then the first offer', async () => {
    readySalon()
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    localStorage.setItem('adp.guide.skips.u1.shop1', JSON.stringify(['notifications', 'team']))
    show()
    fireEvent.click(await screen.findByRole('link', { name: 'Share your salon' }))
    expect(await screen.findByRole('link', { name: 'Make an offer' })).toHaveAttribute('href', '/salon/offers/new')
  })

  it('all done: "Your salon is ready" once, then the card is gone for good', async () => {
    readySalon()
    state.pushOn = true
    state.staff = [barber('b1', 'Raju', { loginPhone: '9000000002' })]
    state.offers = [{}]
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    localStorage.setItem('adp.guide.shared.shop1.u1', '1')
    const { unmount } = show()
    expect(await screen.findByText('Your salon is ready. Customers can book now.')).toBeInTheDocument()
    unmount()
    show()
    await waitFor(() => expect(screen.queryByText('Your salon is ready. Customers can book now.')).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Get your salon ready' })).toBeNull()
  })

  it('a helper or a pending invitation counts as the team signed in', async () => {
    readySalon()
    state.pushOn = true
    state.members = [{ role: 'OWNER' }, { role: 'HELPER' }]
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    show()
    expect(await screen.findByRole('link', { name: 'Share your salon' })).toBeInTheDocument()
    expect(screen.getByText('6 of 8 done')).toBeInTheDocument()
  })

  it('no notifications on this phone: that step is left out', async () => {
    readySalon()
    state.push = false
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    show()
    expect(await screen.findByText('4 of 7 done')).toBeInTheDocument()
  })

  it('Turn on asks the phone; a refusal is said on the card', async () => {
    readySalon()
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    state.turnOn.mockResolvedValue('denied')
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
    expect(await screen.findByText(/blocked|allow|denied/i)).toBeInTheDocument()
  })

  it('waiting for the visit: the owner prepares (no sharing or offer yet), and no tips', async () => {
    state.shop = { ...state.shop, status: 'PENDING_VISIT' }
    readySalon()
    show()
    expect(await screen.findByRole('heading', { name: 'Get your salon ready' })).toBeInTheDocument()
    expect(screen.getByText(/once Kumar Salon is approved, customers can book straight away/)).toBeInTheDocument()
    expect(screen.getByText('After approval: share your salon and make your first offer.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Share your salon' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tips for using the app' })).toBeNull()
  })

  it('a helper: the tips first, then what is left, with "Only the owner can do this"', async () => {
    state.shop = { ...state.shop, myRole: 'HELPER' }
    show()
    expect(await screen.findByRole('region', { name: 'Tips for using the app' })).toBeInTheDocument()
    skipTips()
    expect(await screen.findByText(/Only the owner can do this/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add services' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Add your services and prices' })).toBeNull()
  })

  it('a barber: no card, the tips, then whether booking alerts are on (with Turn on)', async () => {
    state.shop = { ...state.shop, myRole: 'BARBER' }
    show()
    const tips = await screen.findByRole('region', { name: 'Tips for using the app' })
    expect(tips).toHaveTextContent('your column')
    // One card at a time: the alerts line waits for the tips
    expect(screen.queryByText(/Booking alerts are off/)).toBeNull()
    skipTips()
    expect(screen.getByText('Booking alerts are off. You may miss bookings.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on booking alerts' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Get your salon ready' })).toBeNull()
  })
})

describe('skipped steps are never a dead end', () => {
  it('the card counts them at the bottom; Show them brings them back', async () => {
    readySalon()
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    localStorage.setItem('adp.guide.skips.u1.shop1', JSON.stringify(['team', 'share']))
    show()
    expect(await screen.findByText(/2 steps skipped/)).toBeInTheDocument()
    expect(screen.getByText('4 of 6 done')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(await screen.findByText('4 of 8 done')).toBeInTheDocument()
    expect(screen.queryByText(/steps? skipped/)).toBeNull()
    expect(JSON.parse(localStorage.getItem('adp.guide.skips.u1.shop1')!)).toEqual([])
  })

  it('a step done after skipping it isn\'t counted', async () => {
    readySalon()
    state.offers = [{}]
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    localStorage.setItem('adp.guide.skips.u1.shop1', JSON.stringify(['offer', 'share']))
    show()
    expect(await screen.findByText(/1 step skipped/)).toBeInTheDocument()
  })

  it('the phone\'s old "Not now" counts as skipped; Show them brings the step back for this account only', async () => {
    readySalon()
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    localStorage.setItem('adp.pushPromptDismissed', '1')
    show()
    expect(await screen.findByText(/1 step skipped/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Next step' })).not.toHaveTextContent('notification')
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument()
    // The phone-wide mark stays (another person on this phone isn't asked again because of this)
    expect(localStorage.getItem('adp.pushPromptDismissed')).toBe('1')
    // Skipped again: gone again
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText(/1 step skipped/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })

  it('once the card is gone, the Salon tab\'s row brings them back and opens Today', async () => {
    readySalon()
    state.pushOn = true
    state.offers = [{}]
    state.staff = [barber('b1', 'Raju', { loginPhone: '9000000002' })]
    localStorage.setItem('adp.guide.skips.u1.shop1', JSON.stringify(['share']))
    show('/setup', <SkippedStepsRow />)
    fireEvent.click(await screen.findByRole('button', { name: /Step you skipped \(1\)/ }))
    await waitFor(() => expect(where).toBe('/salon/day'))
    expect(JSON.parse(localStorage.getItem('adp.guide.skips.u1.shop1')!)).toEqual([])
  })

  it('no row while the card is still on Today, or with nothing skipped', async () => {
    readySalon()
    localStorage.setItem('adp.guide.skips.u1.shop1', JSON.stringify(['share']))
    const { unmount } = show('/setup', <SkippedStepsRow />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /skipped/ })).toBeNull()
    unmount()
    state.pushOn = true
    state.offers = [{}]
    state.staff = [barber('b1', 'Raju', { loginPhone: '9000000002' })]
    localStorage.removeItem('adp.guide.skips.u1.shop1')
    localStorage.setItem('adp.guide.shared.shop1.u1', '1')
    show('/setup', <SkippedStepsRow />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /skipped/ })).toBeNull()
  })
})

describe('the tips', () => {
  it('reopen from ?tips=1 (Help links there), which is then taken out of the address', async () => {
    readySalon()
    state.shop = { ...state.shop, myRole: 'BARBER' }
    localStorage.setItem('adp.guide.tips.BARBER.u1', '1')
    show(`/salon/day?tips=1&date=${todayIst()}`)
    expect(await screen.findByRole('region', { name: 'Tips for using the app' })).toBeInTheDocument()
    await waitFor(() => expect(where).not.toContain('tips=1'))
    expect(where).toContain('date=')
    fireEvent.click(screen.getByRole('button', { name: 'Skip tips' }))
    expect(screen.queryByRole('region', { name: 'Tips for using the app' })).toBeNull()
  })

  it('are per role: a barber who saw his becomes an owner and is shown the owner’s once', async () => {
    readySalon()
    localStorage.setItem('adp.guide.tips.BARBER.u1', '1')
    show()
    expect(await screen.findByRole('region', { name: 'Tips for using the app' })).toHaveTextContent('Tip 1 of 6')
  })

  it('a second account on the same phone sees them once too', async () => {
    state.shop = { ...state.shop, myRole: 'BARBER' }
    show()
    skipTips()
    act(() => useSession.setState({ user: { id: 'u2', phone: '9000000003' } as unknown as User }))
    expect(await screen.findByRole('region', { name: 'Tips for using the app' })).toBeInTheDocument()
  })

  it('off the app: none (unless asked for)', async () => {
    state.shop = { ...state.shop, myRole: 'BARBER', status: 'SUSPENDED' }
    show()
    await act(async () => {})
    expect(screen.queryByRole('region', { name: 'Tips for using the app' })).toBeNull()
  })
})

describe('one next step at a time', () => {
  it('the language offer open (never chosen): no tips and no setup card until it is answered', async () => {
    readySalon()
    act(() => useLanguageOffer.setState({ open: true }))
    show()
    await act(async () => {})
    expect(screen.queryByRole('region', { name: 'Tips for using the app' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Get your salon ready' })).toBeNull()
    act(() => useLanguageOffer.setState({ open: false }))
    expect(await screen.findByRole('region', { name: 'Tips for using the app' })).toBeInTheDocument()
  })

  it('a new owner with needed steps: the empty board has no second "Add barbers", and no "Too busy?" yet', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Get your salon ready' })).toBeInTheDocument()
    expect(screen.getByText('No barbers yet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add barbers' })).toBeNull()
    expect(screen.getByText('Pause not offered')).toBeInTheDocument()
  })

  it('customers can book: "Too busy?" is offered', async () => {
    readySalon()
    show()
    expect(await screen.findByText('Pause offered')).toBeInTheDocument()
  })

  it('suspended with everything done: no "All set" or "ready" banner', async () => {
    state.shop = { ...state.shop, status: 'SUSPENDED' }
    readySalon()
    show()
    await act(async () => {})
    expect(screen.queryByText(/Your salon is ready|All set/)).toBeNull()
    expect(localStorage.getItem('adp.guide.ready.shop1.u1')).toBeNull()
  })

  it("a list the card needs couldn't be read: said, with Try again (not a card that silently isn't there)", async () => {
    state.servicesFail = true
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    show()
    expect(await screen.findByText(/Couldn't check your setup\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(state.refetch).toHaveBeenCalledTimes(1)
  })

  it("a helper whose next step is the owner's can still turn on notifications from its row", async () => {
    state.shop = { ...state.shop, myRole: 'HELPER' }
    localStorage.setItem('adp.guide.tips.HELPER.u1', '1')
    state.turnOn.mockResolvedValue('on')
    show()
    expect(await screen.findByText(/Only the owner can do this/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await waitFor(() => expect(state.turnOn).toHaveBeenCalledTimes(1))
  })

  it("Skip on notifications is this account's only: the phone-wide mark (a barber's own prompt) isn't set", async () => {
    readySalon()
    localStorage.setItem('adp.guide.tips.OWNER.u1', '1')
    show()
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText(/1 step skipped/)).toBeInTheDocument()
    expect(localStorage.getItem('adp.pushPromptDismissed')).toBeNull()
    expect(JSON.parse(localStorage.getItem('adp.guide.skips.u1.shop1')!)).toEqual(['notifications'])
  })
})
