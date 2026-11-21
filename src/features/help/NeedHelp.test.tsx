import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { MyRequest, Shop, ShopRole } from '../../api/types'
import { provideForTests, resetLanguageForTests, setLanguage } from '../../i18n'
import { useSession } from '../../store/session'
import { NeedHelp } from './NeedHelp'
import { useHelpSeen } from './seen'

const state = vi.hoisted(() => ({ mine: vi.fn(), shop: null as Shop | null }))
// GET /helpdesk/tickets (My requests); nothing else is asked for here
vi.mock('../../api/client', async (orig) => ({
  ...(await orig<typeof import('../../api/client')>()),
  api: (method: string, path: string) => (method === 'GET' && path === '/api/v1/helpdesk/tickets' ? state.mine() : Promise.reject(new Error(path))),
}))
vi.mock('../../api/shop', async (orig) => ({
  ...(await orig<typeof import('../../api/shop')>()),
  useMyShop: () => ({ data: state.shop }),
}))

const USER = { id: 'u1', phone: '9876543210', name: 'Ravi', email: 'ravi@example.com', emailVerified: true, admin: false }
const shop = (myRole: ShopRole, status: Shop['status'] = 'APPROVED') => ({ myRole, status, type: 'SALON', name: 'Style Studio' }) as Shop
const request = (over: Partial<MyRequest>): MyRequest => ({
  id: 't1', number: 'CLZ-1001', subject: 'Payout', status: 'OPEN', createdAt: '2026-11-01T10:00:00Z', lastMessageAt: '2026-11-02T10:00:00Z', ...over,
})

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function open(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/help" element={<><NeedHelp /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  resetLanguageForTests()
  state.mine.mockReset()
  state.mine.mockResolvedValue([])
  state.shop = shop('OWNER')
  useHelpSeen.setState({ userId: null, seen: {} })
  useSession.setState({ status: 'signedIn', user: USER })
})

describe('the help page', () => {
  it('opens with Write to us and My requests first, with what is waiting', async () => {
    state.mine.mockResolvedValue([request({}), request({ id: 't2', status: 'WAITING' }), request({ id: 't3', status: 'RESOLVED' })])
    open('/help?from=%2Fsalon%2Fwalk-in&topic=Walk-in')
    // The first thing on the page, before My requests and the answers
    const write = screen.getByRole('button', { name: 'Write to us' })
    expect(write.compareDocumentPosition(screen.getByRole('link', { name: /My requests/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/About: Walk-in/)).toBeInTheDocument()
    expect(await screen.findByText('With us: 1 · We replied: 1')).toBeInTheDocument()
    expect(screen.getByText('1 new reply from us')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument()
  })

  it('Write to us opens the form with the screen as the subject', () => {
    open('/help?from=%2Fsalon%2Fwalk-in&topic=Walk-in')
    fireEvent.click(screen.getByRole('button', { name: 'Write to us' }))
    expect(screen.getByLabelText("What's it about? (optional)")).toHaveValue('Walk-in')
    expect(screen.getByTestId('where').textContent).toContain('write=1')
  })

  it('the screen it came from comes first, and only answers for screens this role can open', () => {
    state.shop = shop('BARBER')
    open('/help?from=%2Fsalon%2Fday')
    const here = screen.getByRole('heading', { name: 'About this screen' }).parentElement!
    expect(within(here).getByText("What is the customer's 4-digit code?")).toBeInTheDocument()
    expect(screen.queryByText('How do I add or change a service, its price or picture?')).not.toBeInTheDocument()
    expect(screen.queryByText('Too busy: how do I stop online bookings for a while?')).not.toBeInTheDocument()
  })

  it('search narrows the answers as they type; each answer says the screen\'s own button words and goes there', () => {
    open('/help')
    fireEvent.change(screen.getByLabelText('Search the answers'), { target: { value: 'holiday' } })
    expect(screen.getByText('1 answer')).toBeInTheDocument()
    expect(screen.getByText(/More › “Closed days” \(also in the Salon tab\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Take me there: How do I close the salon for a festival or holiday?' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/salon/closures')
  })

  it('a helper is told the owner changes it; nothing matching offers to ask us with the words typed', () => {
    state.shop = shop('HELPER')
    open('/help')
    fireEvent.change(screen.getByLabelText('Search the answers'), { target: { value: 'opening hours' } })
    expect(screen.getAllByText('Only the owner can change this; you can see it there.').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Search the answers'), { target: { value: 'gst invoice' } })
    expect(screen.getByText('No answer for “gst invoice” yet.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask us instead' }))
    // What they searched for is the subject; the message is theirs to write, so nothing is red before they do
    expect(screen.getByLabelText("What's it about? (optional)")).toHaveValue('gst invoice')
    expect(screen.getByLabelText('Your message')).toHaveValue('')
    expect(screen.queryByText(/at least|too short/i, { selector: '.text-bad' })).toBeNull()
    expect(screen.getByLabelText('Your message')).not.toHaveAttribute('aria-invalid')
  })

  it('in another language, the English words find an answer too', async () => {
    provideForTests('hi', { howto: { closedDaysQ: 'त्योहार पर सैलून कैसे बंद करें?', closedDaysA: '{more} › “{closed}”' } })
    await act(() => setLanguage('hi'))
    open('/help')
    fireEvent.change(screen.getByLabelText('Search the answers'), { target: { value: 'holiday' } })
    expect(screen.getByText('त्योहार पर सैलून कैसे बंद करें?')).toBeInTheDocument()
  })

  it('"Show the app tips again" is right under the search box, and first in "About this screen" from Today', () => {
    const first = open('/help?from=%2Fsetup')
    const search = screen.getByLabelText('Search the answers')
    const tips = screen.getByRole('link', { name: 'Show the app tips again' })
    expect(search.parentElement!.nextElementSibling).toBe(tips)
    first.unmount()
    open('/help?from=%2Fsalon%2Fday')
    const here = screen.getByRole('heading', { name: 'About this screen' }).parentElement!
    expect(here.children[1]).toBe(screen.getByRole('link', { name: 'Show the app tips again' }))
    expect(screen.getAllByRole('link', { name: 'Show the app tips again' })).toHaveLength(1)
  })

  it('the share answer says where it is and the buttons by their names', () => {
    open('/help')
    fireEvent.change(screen.getByLabelText('Search the answers'), { target: { value: 'share' } })
    // Where every role finds it (More), not the Salon tab barbers don't have
    expect(screen.getByText(/More › “Share your salon”\. Tap “Share on WhatsApp”.*“Download poster”/)).toBeInTheDocument()
  })

  it('no answers (only Write to us) while the salon is still a draft', () => {
    state.shop = shop('OWNER', 'DRAFT')
    open('/help')
    expect(screen.getByRole('button', { name: 'Write to us' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Search the answers')).not.toBeInTheDocument()
  })
})

describe('the form never loses what was typed', () => {
  it('a link fills subject and message when nothing was typed', () => {
    open('/help?about=Booking+SB7K3Q9X&text=SB7K3Q9X+%C2%B7+4%3A00+PM')
    expect(screen.getByLabelText("What's it about? (optional)")).toHaveValue('Booking SB7K3Q9X')
    expect(screen.getByLabelText('Your message')).toHaveValue('SB7K3Q9X · 4:00 PM')
  })

  it('their own draft stays; they choose whether to start the linked one', () => {
    localStorage.setItem('pd.helpDraft.u1', JSON.stringify({ subject: 'Payout', message: 'My payout has not come.' }))
    open('/help?about=Walk-in&write=1')
    expect(screen.getByLabelText('Your message')).toHaveValue('My payout has not come.')
    expect(screen.getByText("You had started a message before: it's kept below.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start a new one about “Walk-in” (clears the one below)' }))
    expect(screen.getByLabelText("What's it about? (optional)")).toHaveValue('Walk-in')
    expect(screen.getByLabelText('Your message')).toHaveValue('')
  })

  it('Keep mine keeps it; a draft that is only what the app filled in is replaced without asking', () => {
    localStorage.setItem('pd.helpDraft.u1', JSON.stringify({ subject: 'Payout', message: 'My payout has not come.' }))
    const first = open('/help?about=Walk-in')
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
    expect(screen.queryByText("You had started a message before: it's kept below.")).not.toBeInTheDocument()
    expect(screen.getByLabelText("What's it about? (optional)")).toHaveValue('Payout')
    first.unmount()

    localStorage.setItem('pd.helpDraft.u1', JSON.stringify({ subject: 'Walk-in', message: '', auto: { subject: 'Walk-in', message: '' } }))
    open('/help?about=Offers')
    expect(screen.getByLabelText("What's it about? (optional)")).toHaveValue('Offers')
    expect(screen.queryByText("You had started a message before: it's kept below.")).not.toBeInTheDocument()
  })

  it('the hub says Continue your message when one is waiting, and opens it as it was', () => {
    localStorage.setItem('pd.helpDraft.u1', JSON.stringify({ subject: 'Payout', message: 'My payout has not come.' }))
    open('/help?from=%2Fsalon%2Fwalk-in&topic=Walk-in')
    fireEvent.click(screen.getByRole('button', { name: 'Continue your message' }))
    expect(screen.getByLabelText('Your message')).toHaveValue('My payout has not come.')
    expect(screen.queryByText("You had started a message before: it's kept below.")).not.toBeInTheDocument()
  })
})
