import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { provideForTests, resetLanguageForTests, useT } from './index'
import { LanguagePicker } from './LanguagePicker'

function Screen() {
  const t = useT()
  return (
    <>
      <h1>{t('language.title')}</h1>
      <input aria-label="typed" />
      <LanguagePicker />
    </>
  )
}

describe('choosing a language', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetLanguageForTests()
  })

  it('changes the screen at once, keeps what was typed, and is remembered on this phone', async () => {
    provideForTests('hi', { language: { title: 'भाषा', choose: 'अपनी भाषा चुनें' } })
    render(<Screen />)
    await userEvent.type(screen.getByLabelText('typed'), 'Sharma Stores')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'हिन्दी' }))
    expect(await screen.findByRole('heading', { name: 'भाषा' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'हिन्दी' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('typed')).toHaveValue('Sharma Stores')
    expect(window.localStorage.getItem('language')).toBe('hi')
    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByRole('heading', { name: 'Language' })).toBeInTheDocument()
  })

  it('shows every language in its own script', () => {
    render(<LanguagePicker />)
    for (const name of ['English', 'हिन्दी', 'తెలుగు', 'मराठी', 'தமிழ்', 'ಕನ್ನಡ']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })
})
