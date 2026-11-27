import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('drawing failed')
}

describe('the crash screen', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.history.replaceState(null, '', '/salon/day')
  })
  afterEach(() => vi.restoreAllMocks())

  it('says the shop\'s data is safe (a salon\'s or a kirana\'s) and never traps: More, Write to us, Call us, WhatsApp us', () => {
    // No router around it: every way out is a plain link (a fresh page load leaves the broken screen behind)
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong on this screen')).toBeInTheDocument()
    expect(screen.getByText("Your shop's data is safe. Start again to carry on.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start again' })).toBeInTheDocument()
    // Today itself may be what breaks: More is reachable without it
    expect(screen.getByRole('link', { name: 'Open More (help, language, sign out)' })).toHaveAttribute('href', '/more')
    const write = new URL(screen.getByRole('link', { name: 'Write to us' }).getAttribute('href')!, 'https://x.test')
    expect(write.pathname).toBe('/help')
    expect(write.searchParams.get('write')).toBe('1')
    expect(write.searchParams.get('about')).toBe('A problem in the app')
    expect(write.searchParams.get('text')).toBe('The app said: “Something went wrong on this screen”\nScreen: /salon/day')
    expect(screen.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919381251613')
    const chat = new URL(screen.getByRole('link', { name: 'WhatsApp us' }).getAttribute('href')!)
    expect(chat.origin + chat.pathname).toBe('https://wa.me/919381251613')
    expect(chat.searchParams.get('text')).toBe('Hello Clozest, I need help. Screen: /salon/day')
  })
})
