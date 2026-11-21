import { readFileSync } from 'node:fs'
import { useWriteToUsHref } from './HelpButton'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { MyRequest, Shop, ShopRole } from '../../api/types'
import { ErrorState, Page } from '../../components/ui'
import { useSession } from '../../store/session'
import { HOWTOS, howToFor, matches } from './howto'
import { helpHref, isHelpPage, isKiranaScreen, safeFrom, topicFor } from './links'
import { typedByThem } from './NeedHelp'
import { unreadReplies, useHelpSeen } from './seen'

const state = vi.hoisted(() => ({ mine: vi.fn() }))
// GET /helpdesk/tickets (My requests); nothing else is asked for here
vi.mock('../../api/client', async (orig) => ({
  ...(await orig<typeof import('../../api/client')>()),
  api: (method: string, path: string) => (method === 'GET' && path === '/api/v1/helpdesk/tickets' ? state.mine() : Promise.reject(new Error(path))),
}))

const USER = { id: 'u1', phone: '9876543210', name: 'Ravi', email: 'ravi@example.com', emailVerified: true, admin: false }

function request(over: Partial<MyRequest>): MyRequest {
  return { id: 't1', number: 'CLZ-1001', subject: 'Payout', status: 'OPEN', createdAt: '2026-11-01T10:00:00Z', lastMessageAt: '2026-11-02T10:00:00Z', ...over }
}

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

function renderAt(path: string, ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<>{ui}<Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  state.mine.mockReset()
  state.mine.mockResolvedValue([])
  useHelpSeen.setState({ userId: null, seen: {} })
  useSession.setState({ status: 'signedOut', user: null })
})

describe('where Help goes', () => {
  it('puts what it knows in the address, and only paths of this app come back', () => {
    expect(helpHref()).toBe('/help')
    expect(helpHref({ from: '/salon/walk-in', topic: 'Walk-in' })).toBe('/help?from=%2Fsalon%2Fwalk-in&topic=Walk-in')
    expect(helpHref({ about: 'Booking SB1', text: 'x', write: true })).toBe('/help?about=Booking+SB1&text=x&write=1')
    expect(safeFrom('/setup/services')).toBe('/setup/services')
    expect(safeFrom('//evil.example')).toBeNull()
    expect(safeFrom('https://evil.example')).toBeNull()
    expect(safeFrom('/\\evil.example')).toBeNull()
    // The browser drops a tab or a line break inside an address: "/<tab>/host" is "//host", another site
    expect(safeFrom('/\t/evil.example')).toBeNull()
    expect(safeFrom('/\n/evil.example')).toBeNull()
    expect(safeFrom('/salon/day?date=2026-11-21')).toBe('/salon/day?date=2026-11-21')
    expect(safeFrom(null)).toBeNull()
  })

  it('knows each screen by its address, and which are help or kirana screens', () => {
    expect(topicFor('/salon/walk-in')).toBe('Walk-in')
    expect(topicFor('/setup/staff/s1')).toBe('Barbers')
    expect(topicFor('/register')).toBe('Registering: salon details')
    // A kirana registering: a shop's details, never a salon's
    expect(topicFor('/register', 'KIRANA')).toBe('Registering: shop details')
    expect(topicFor('/register', 'SALON')).toBe('Registering: salon details')
    expect(topicFor('/register/photos')).toBe('Registering: photos and papers')
    expect(topicFor('/more')).toBeNull()
    expect(isHelpPage('/help')).toBe(true)
    expect(isHelpPage('/help/requests/t1')).toBe(true)
    expect(isHelpPage('/contact')).toBe(true)
    expect(isHelpPage('/helpers')).toBe(false)
    expect(isKiranaScreen('/kirana/counter', undefined)).toBe(true)
    expect(isKiranaScreen('/more', 'KIRANA')).toBe(true)
    expect(isKiranaScreen('/more', 'SALON')).toBe(false)
  })
})

describe('a screen\'s own "Write to us" link', () => {
  function WriteLink() {
    return <a href={useWriteToUsHref()}>Write to us</a>
  }
  it('opens the form itself, about the screen it is on, and comes back there after sending', () => {
    renderAt('/subscription?x=1', <WriteLink />)
    const href = screen.getByRole('link', { name: 'Write to us' }).getAttribute('href')!
    const q = new URLSearchParams(href.split('?')[1])
    expect(href.startsWith('/help?')).toBe(true)
    expect(q.get('write')).toBe('1')
    expect(q.get('from')).toBe('/subscription?x=1')
    expect(q.get('topic')).toBeTruthy()
  })
  it('a screen with no topic still opens the form', () => {
    renderAt('/', <WriteLink />)
    const q = new URLSearchParams(screen.getByRole('link', { name: 'Write to us' }).getAttribute('href')!.split('?')[1])
    expect(q.get('write')).toBe('1')
    expect(q.get('topic')).toBeNull()
  })
})

describe('the how-to answers', () => {
  const en = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/en/howto.json'), 'utf8')) as Record<string, string>
  const enAll = (area: string) => JSON.parse(readFileSync(join(process.cwd(), `src/i18n/en/${area}.json`), 'utf8')) as Record<string, unknown>
  const shop = (myRole: ShopRole, status: Shop['status'] = 'APPROVED', type: Shop['type'] = 'SALON') => ({ myRole, status, type, name: 'Style Studio' }) as Shop

  it('every answer has its question and answer, and every button name it uses is a real text with a blank for it', () => {
    for (const h of HOWTOS) {
      expect(en[`${h.id}Q`], h.id).toBeTruthy()
      const answer = en[`${h.id}A`]
      expect(answer, h.id).toBeTruthy()
      const blanks = [...new Set([...answer.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
      expect(blanks, h.id).toEqual(Object.keys(h.words ?? {}).sort())
      for (const key of Object.values(h.words ?? {})) {
        const [area, k] = key.split('.')
        expect(enAll(area)[k], key).toBeTruthy()
      }
    }
  })

  it('shows each role only the screens it can open (the routes in App.tsx)', () => {
    const ids = (role: ShopRole) => howToFor(shop(role)).map((h) => h.id)
    expect(ids('OWNER')).toEqual(expect.arrayContaining(['services', 'closedDays', 'inviteHelper', 'leave', 'handover', 'close']))
    expect(ids('OWNER')).not.toContain('leaveSalon')
    expect(ids('HELPER')).toEqual(expect.arrayContaining(['services', 'hours', 'pause', 'offers', 'leaveSalon']))
    expect(ids('HELPER')).not.toEqual(expect.arrayContaining(['closedDays']))
    for (const ownerOnly of ['closedDays', 'inviteBarber', 'inviteHelper', 'leave', 'details', 'handover', 'close']) expect(ids('HELPER')).not.toContain(ownerOnly)
    for (const notBarber of ['services', 'hours', 'addBarbers', 'rules', 'pause', 'reassign', 'offers', 'ratings']) expect(ids('BARBER')).not.toContain(notBarber)
    expect(ids('BARBER')).toEqual(expect.arrayContaining(['startCode', 'walkIn', 'breaks', 'customersSee', 'leaveSalon']))
    // A barber's break starts from his own column on Today
    expect(howToFor(shop('BARBER')).find((h) => h.id === 'breaks')!.to).toBeTypeOf('function')
  })

  it('none before the salon is past registration, nor for a kirana', () => {
    expect(howToFor(shop('OWNER', 'DRAFT'))).toEqual([])
    expect(howToFor(shop('OWNER', 'PENDING_VISIT')).length).toBeGreaterThan(0)
    expect(howToFor(shop('HELPER', 'PENDING_VISIT'))).toEqual([])
    expect(howToFor(shop('OWNER', 'APPROVED', 'KIRANA'))).toEqual([])
    expect(howToFor(null)).toEqual([])
  })

  it('search finds every typed word, in any order and case, in Indian scripts too', () => {
    expect(matches('barber HOURS', "How do I set a barber's hours and services?")).toBe(true)
    expect(matches('hours barber', "How do I set a barber's hours")).toBe(true)
    expect(matches('price holiday', 'How do I change a price?')).toBe(false)
    expect(matches('  ', 'anything')).toBe(true)
    expect(matches('छुट्टी', 'बार्बर को पूरे दिनों की छुट्टी कैसे दें?')).toBe(true)
  })
})

describe('drafts and replies', () => {
  it('a draft is the person\'s own only when they typed or changed something', () => {
    expect(typedByThem(null)).toBe(false)
    expect(typedByThem({ subject: ' ', message: '' })).toBe(false)
    expect(typedByThem({ subject: 'Walk-in', message: '', auto: { subject: 'Walk-in', message: '' } })).toBe(false)
    expect(typedByThem({ subject: 'Walk-in', message: 'It shows the wrong price', auto: { subject: 'Walk-in', message: '' } })).toBe(true)
    expect(typedByThem({ subject: 'Payout', message: '' })).toBe(true)   // a draft from before this change
  })

  it('a reply that also resolves the request lights it too (lastReplyAt, whatever the status)', () => {
    const resolved = request({ status: 'RESOLVED', lastReplyAt: '2026-11-02T10:00:00Z' })
    expect(unreadReplies([resolved], {})).toEqual([resolved])
    // Opened later than the reply: read
    expect(unreadReplies([resolved], { t1: '2026-11-02T10:00:00Z' })).toEqual([])
    // Their own message after support's (OPEN again): nothing new from support
    expect(unreadReplies([request({ status: 'OPEN', lastReplyAt: '2026-11-01T12:00:00Z' })], { t1: '2026-11-01T12:00:00Z' })).toEqual([])
    expect(unreadReplies([request({ status: 'OPEN', lastReplyAt: null })], {})).toEqual([])
  })

  it('times are compared, not matched: a newer reply opened from a message clears the dot even with an older list', () => {
    // The request was opened from a push: its newest message (14:00) is marked
    useHelpSeen.getState().mark('u1', 't1', '2026-11-03T14:00:00Z')
    // The list in the cache is older (support's reply at 13:00 is what it knows)
    const cached = request({ status: 'WAITING', lastMessageAt: '2026-11-03T13:00:00Z', lastReplyAt: '2026-11-03T13:00:00Z' })
    expect(unreadReplies([cached], useHelpSeen.getState().seen)).toEqual([])
    // An older list read later never takes the mark back
    useHelpSeen.getState().mark('u1', 't1', '2026-11-03T13:00:00Z')
    expect(useHelpSeen.getState().seen.t1).toBe('2026-11-03T14:00:00Z')
    // A reply after that is new again
    expect(unreadReplies([{ ...cached, lastReplyAt: '2026-11-03T15:00:00Z' }], useHelpSeen.getState().seen)).toHaveLength(1)
  })

  it('a reply counts as new until that request is opened, and again with support\'s next one', () => {
    const waiting = request({ status: 'WAITING' })
    expect(unreadReplies([waiting, request({ id: 't2' })], {})).toEqual([waiting])
    useHelpSeen.getState().mark('u1', 't1', waiting.lastMessageAt)
    expect(unreadReplies([waiting], useHelpSeen.getState().seen)).toEqual([])
    expect(JSON.parse(localStorage.getItem('pd.helpSeen.u1')!)).toEqual({ t1: waiting.lastMessageAt })
    const again = { ...waiting, lastMessageAt: '2026-11-03T10:00:00Z' }
    expect(unreadReplies([again], useHelpSeen.getState().seen)).toEqual([again])
    // Another person on the same phone has their own marks
    useHelpSeen.getState().load('u2')
    expect(useHelpSeen.getState().seen).toEqual({})
  })
})

describe('the Help button in every screen', () => {
  it('signed out: Contact (help needs sign-in), and no call for requests', async () => {
    renderAt('/signin/code', <Page title="Enter the code" back="/signin"><p>code</p></Page>)
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/contact')
    expect(state.mine).not.toHaveBeenCalled()
  })

  it('a screen with no title bar gets it too (Today, sign-in)', () => {
    renderAt('/signin', <Page><p>sign in</p></Page>)
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/contact')
  })

  it('signed in: the help page with this screen and its subject; a dot while a reply is unread, gone once opened', async () => {
    useSession.setState({ status: 'signedIn', user: USER })
    state.mine.mockResolvedValue([request({ status: 'WAITING' })])
    renderAt('/salon/walk-in', <Page title="New walk-in" back="/salon/day"><p>walk-in</p></Page>)
    const link = await screen.findByRole('link', { name: /^Help ?\(Support replied\)$/ })
    expect(link).toHaveAttribute('href', '/help?from=%2Fsalon%2Fwalk-in&topic=Walk-in')
    expect(screen.getByTestId('help-replied-dot')).toBeInTheDocument()
    useHelpSeen.getState().mark('u1', 't1', '2026-11-02T10:00:00Z')
    await waitFor(() => expect(screen.queryByTestId('help-replied-dot')).not.toBeInTheDocument())
    expect(state.mine).toHaveBeenCalledTimes(1)
  })

  it('moving between screens asks for the requests only once', async () => {
    useSession.setState({ status: 'signedIn', user: USER })
    const qc = new QueryClient()
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/salon/day']}><Page title="A"><p /></Page></MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(state.mine).toHaveBeenCalledTimes(1))
    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/setup']}><Page title="B"><p /></Page></MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByRole('link', { name: 'Help' })
    expect(state.mine).toHaveBeenCalledTimes(1)
  })

  it('not on the help pages themselves', () => {
    useSession.setState({ status: 'signedIn', user: USER })
    renderAt('/help/requests', <Page title="My requests" back="/"><p /></Page>)
    expect(screen.queryByRole('link', { name: /^Help/ })).not.toBeInTheDocument()
  })

  it('asks first when the screen warns about leaving (an upload under way)', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt('/register/photos', <Page title="Photos" back="/register" leaveWarning="A photo is still uploading."><p /></Page>)
    fireEvent.click(screen.getByRole('link', { name: 'Help' }))
    expect(confirm).toHaveBeenCalledWith('A photo is still uploading.')
    expect(screen.getByTestId('where')).toHaveTextContent('/register/photos')
    confirm.mockRestore()
  })
})

describe('every error offers support', () => {
  it('signed in: the form at once, with the screen as subject and the error in the message', () => {
    useSession.setState({ status: 'signedIn', user: USER })
    renderAt('/setup/services', <ErrorState message="You're offline." onRetry={() => {}} />)
    const link = screen.getByRole('link', { name: 'Write to us' })
    const q = new URLSearchParams(link.getAttribute('href')!.split('?')[1])
    expect(q.get('about')).toBe('Services and prices')
    expect(q.get('text')).toBe('The app said: “You\'re offline.”\nWhat I was doing: ')
    expect(q.get('write')).toBe('1')
    expect(q.get('from')).toBe('/setup/services')
  })

  it('signed out: Contact', () => {
    renderAt('/signin', <ErrorState message="No internet" />)
    expect(screen.getByRole('link', { name: 'Write to us' })).toHaveAttribute('href', '/contact')
  })
})
