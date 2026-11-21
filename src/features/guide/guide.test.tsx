import { act, fireEvent, render, screen } from '@testing-library/react'
import type { User } from '../../api/types'
import { provideForTests, resetLanguageForTests, setLanguage } from '../../i18n'
import { useSession } from '../../store/session'
import { FirstTimeHint } from './FirstTimeHint'
import { seenKey, skippedSteps, skipStep, skipsKey, unskipSteps } from './storage'
import { Tips, tipsFor } from './Tips'

const user = (id: string) => ({ id, phone: '9000000001', name: 'Ravi', email: 'r@x.in', emailVerified: true }) as unknown as User
const signIn = (id: string) => act(() => useSession.setState({ status: 'signedIn', user: user(id) }))

beforeEach(() => {
  localStorage.clear()
  resetLanguageForTests()
  useSession.setState({ status: 'signedIn', user: user('u1') })
})

describe('a first-time hint', () => {
  it('shows once per account: Got it hides it for good, also after a reload', () => {
    const { unmount } = render(<FirstTimeHint screen="bookings" text="All bookings coming up." />)
    expect(screen.getByText('All bookings coming up.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText('All bookings coming up.')).toBeNull()
    expect(localStorage.getItem(seenKey('u1', 'hint.bookings'))).toBe('1')
    unmount()
    render(<FirstTimeHint screen="bookings" text="All bookings coming up." />)
    expect(screen.queryByText('All bookings coming up.')).toBeNull()
  })

  it('on a shared phone, the next account sees it once too', () => {
    render(<FirstTimeHint screen="services" text="Your services." />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    signIn('u2')
    expect(screen.getByText('Your services.')).toBeInTheDocument()
    signIn('u1')
    expect(screen.queryByText('Your services.')).toBeNull()
  })

  it('each screen is remembered on its own', () => {
    render(
      <>
        <FirstTimeHint screen="services" text="Services hint" />
        <FirstTimeHint screen="barbers" text="Barbers hint" />
      </>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Got it' })[0])
    expect(screen.queryByText('Services hint')).toBeNull()
    expect(screen.getByText('Barbers hint')).toBeInTheDocument()
  })

  it('hidden in another tab: goes here too, without a reload', () => {
    render(<FirstTimeHint screen="offers" text="Offers hint" />)
    act(() => {
      localStorage.setItem(seenKey('u1', 'hint.offers'), '1')
      window.dispatchEvent(new StorageEvent('storage', { key: seenKey('u1', 'hint.offers'), newValue: '1' }))
    })
    expect(screen.queryByText('Offers hint')).toBeNull()
  })

  it('waits while another note is up (show false), and is not marked seen meanwhile', () => {
    const { rerender } = render(<FirstTimeHint screen="services" text="Services hint" show={false} />)
    expect(screen.queryByText('Services hint')).toBeNull()
    rerender(<FirstTimeHint screen="services" text="Services hint" show />)
    expect(screen.getByText('Services hint')).toBeInTheDocument()
  })

  it('signed out: nothing', () => {
    useSession.setState({ status: 'signedOut', user: null })
    render(<FirstTimeHint screen="hours" text="Hours hint" />)
    expect(screen.queryByText('Hours hint')).toBeNull()
  })

  it('storage blocked: shows, and Got it still hides it for this visit', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<FirstTimeHint screen="walkIn" text="Walk-in hint" />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText('Walk-in hint')).toBeNull()
    set.mockRestore()
  })
})

describe('the setup skips', () => {
  it('are kept per account and salon, each step once', () => {
    skipStep('u1', 's1', 'offer')
    skipStep('u1', 's1', 'offer')
    skipStep('u1', 's1', 'share')
    expect(skippedSteps('u1', 's1')).toEqual(['offer', 'share'])
    expect(skippedSteps('u2', 's1')).toEqual([])
    expect(skippedSteps('u1', 's2')).toEqual([])
  })

  it('come back when shown again, only the ones asked for', () => {
    skipStep('u1', 's1', 'offer')
    skipStep('u1', 's1', 'share')
    skipStep('u1', 's1', 'team')
    unskipSteps('u1', 's1', ['offer', 'team'])
    expect(skippedSteps('u1', 's1')).toEqual(['share'])
  })

  it('a broken saved value counts as none', () => {
    localStorage.setItem(skipsKey('u1', 's1'), '{not json')
    expect(skippedSteps('u1', 's1')).toEqual([])
    localStorage.setItem(skipsKey('u1', 's1'), '{"a":1}')
    expect(skippedSteps('u1', 's1')).toEqual([])
  })
})

describe('the first-time tips', () => {
  it('owner and helpers: five tips with the app’s real button names', () => {
    const tips = tipsFor('OWNER')
    expect(tips).toHaveLength(5)
    const all = tips.map((x) => `${x.title} ${x.body}`).join('\n')
    for (const button of ['Start', '+ Walk-in', 'Done early', 'Mark no-show', 'Give to another barber', 'Too busy? Pause online bookings', 'Add break']) {
      expect(all).toContain(`“${button}”`)
    }
    expect(all).toContain('4-digit code')
    expect(all).toContain('“Customer can\'t show the code: start anyway”')
  })

  it('a barber: his own column, no pausing or giving away, his own breaks (today or tomorrow, up to 4 h)', () => {
    const all = tipsFor('BARBER').map((x) => `${x.title} ${x.body}`).join('\n')
    expect(all).toContain('your column')
    expect(all).not.toContain('Pause online bookings')
    expect(all).not.toContain('“Give to another barber”')
    expect(all).not.toContain('start anyway')
    expect(all).toContain('today or tomorrow, up to 4 hours a day')
    expect(all).toContain('If the owner lets you')
  })

  it('Next walks through them with dots; the last one says Done; Skip tips closes at once', () => {
    const onClose = vi.fn()
    render(<Tips role="OWNER" onClose={onClose} />)
    expect(screen.getByText('Tip 1 of 5')).toBeInTheDocument()
    expect(screen.getByTestId('tip-dots').children).toHaveLength(5)
    for (let i = 2; i <= 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.getByText(`Tip ${i} of 5`)).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Skip tips' })).toBeNull()
    expect(screen.getByText('You can see these tips again from Help.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Skip tips closes them', () => {
    const onClose = vi.fn()
    render(<Tips role="BARBER" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip tips' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a helper starts without walk-ins: his tip says "if the owner lets you", as a barber\'s does; the owner\'s doesn\'t', () => {
    expect(tipsFor('HELPER')[2].body).toMatch(/^Someone came without booking\? If the owner lets you, tap “\+ Walk-in”/)
    expect(tipsFor('BARBER')[2].body).toContain('If the owner lets you')
    expect(tipsFor('OWNER')[2].body).not.toContain('owner')
  })

  it('in another language, the button names in the tips are that language’s', async () => {
    provideForTests('hi', {
      guide: { quoted: '“{text}”', tipWalkInBody: '{walkIn} दबाएँ' },
      day: { addWalkIn: '+ वॉक-इन' },
    })
    await setLanguage('hi')
    expect(tipsFor('OWNER')[2].body).toBe('“+ वॉक-इन” दबाएँ')
  })
})
