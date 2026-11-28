import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { languageChosen, provideForTests, resetLanguageForTests, restoreLanguage } from './index'
import { LanguageFirst, LanguageFirstGate, LanguageLine } from './LanguageFirst'

function Where() {
  const location = useLocation()
  return (
    <p>
      at {location.pathname} {JSON.stringify(location.state)}
    </p>
  )
}

function app(start: string | { pathname: string; state: unknown }) {
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path="/language" element={<LanguageFirst />} />
        <Route
          path="/signin"
          element={
            <LanguageFirstGate>
              <h1>Sign in</h1>
              <LanguageLine />
              <Where />
            </LanguageFirstGate>
          }
        />
        <Route path="/about" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('the language screen first', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetLanguageForTests()
  })

  it('opens first on a phone where no language was chosen, then goes on to sign-in in the language picked, with its notices', async () => {
    provideForTests('te', { language: { shownIn: 'భాష:', change: 'మార్చండి' } })
    app({ pathname: '/signin', state: { deleted: true } })
    expect(screen.getByRole('heading', { name: 'Choose your language' })).toBeInTheDocument()
    // No Back before a first choice
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^తెలుగు/ }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText(/at \/signin/)).toHaveTextContent('{"deleted":true}')
    expect(languageChosen()).toBe(true)
    expect(window.localStorage.getItem('language')).toBe('te')
    // "Change" also in English, for someone helping
    expect(screen.getByRole('link', { name: /^మార్చండి.*\(Change\)$/ })).toBeInTheDocument()
  })

  it('goes where it was sent from (About on a new phone)', async () => {
    app({ pathname: '/language', state: { next: '/about' } })
    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText(/at \/about/)).toBeInTheDocument()
  })

  it('shows each language in its own script, with its English name for a helper', () => {
    app('/language')
    for (const [name, english, code] of [['हिन्दी', 'Hindi', 'hi'], ['తెలుగు', 'Telugu', 'te'], ['मराठी', 'Marathi', 'mr'], ['தமிழ்', 'Tamil', 'ta'], ['ಕನ್ನಡ', 'Kannada', 'kn']]) {
      // Named as shown: its own script, then its English name
      const button = screen.getByRole('button', { name: `${name}, ${english}` })
      expect(button).toHaveTextContent(english)
      expect(button).toHaveAttribute('lang', code)
    }
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en')
  })

  it('on a Tamil phone, Tamil is first and the question is in Tamil from the first draw (nothing moves when its words arrive)', async () => {
    Object.defineProperty(window.navigator, 'languages', { value: ['ta-IN'], configurable: true })
    try {
      app('/language')
      const first = () => screen.getAllByRole('button')[0]
      expect(first()).toHaveAccessibleName('தமிழ், Tamil')
      for (const [code, ask] of [['ta', 'உங்கள் மொழியைத் தேர்ந்தெடுங்கள்']] as const) {
        expect(screen.getByRole('heading', { name: ask })).toHaveAttribute('lang', code)
      }
      expect(screen.getByText('Choose your language')).toHaveAttribute('lang', 'en')
      // The phone's language finishes downloading: the order stays
      provideForTests('ta', {})
      await restoreLanguage()
      expect(first()).toHaveAccessibleName('தமிழ், Tamil')
      expect(screen.getAllByRole('button')[1]).toHaveAccessibleName('English')
    } finally {
      Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true })
    }
  })

  it('from Change, choosing goes back the step it came (no second sign-in in the history), keeping what sign-in had', async () => {
    window.localStorage.setItem('language', 'en')
    void restoreLanguage()
    render(
      <MemoryRouter initialEntries={['/before', { pathname: '/signin', state: { deleted: true } }]} initialIndex={1}>
        <Routes>
          <Route path="/language" element={<LanguageFirst />} />
          <Route
            path="/signin"
            element={
              <>
                <h1>Sign in</h1>
                <LanguageLine />
                <Where />
              </>
            }
          />
          <Route path="/before" element={<p>before</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Change' }))
    // Came to change it: Back is there, and the chosen language is marked as the current one
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-current', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText(/at \/signin/)).toHaveTextContent('{"deleted":true}')
  })

  it('a phone with a language chosen goes straight to sign-in, which says the language with Change', () => {
    window.localStorage.setItem('language', 'en')
    // Start-up marks a saved language as chosen
    void restoreLanguage()
    app('/signin')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
