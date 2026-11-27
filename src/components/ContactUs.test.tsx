import { render, screen } from '@testing-library/react'
import { isApp } from '../lib/platform'
import { ContactUs } from './ContactUs'

vi.mock('../lib/platform', () => ({ isApp: vi.fn(() => false) }))

describe('Call us and WhatsApp us', () => {
  it('on the website WhatsApp opens in a new tab (the app stays behind it)', () => {
    render(<ContactUs screen="Today" shopCode={482913} />)
    const chat = screen.getByRole('link', { name: 'WhatsApp us' })
    expect(chat).toHaveAttribute('target', '_blank')
    expect(new URL(chat.getAttribute('href')!).searchParams.get('text')).toBe('Hello Clozest, I need help. Screen: Today. Shop code: 482913')
    expect(screen.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919381251613')
    expect(screen.getByText('Our number: +91 93812 51613')).toBeInTheDocument()
  })

  it('in the Play Store app a plain link (a new tab does nothing in the WebView)', () => {
    vi.mocked(isApp).mockReturnValue(true)
    render(<ContactUs screen="Today" />)
    expect(screen.getByRole('link', { name: 'WhatsApp us' })).not.toHaveAttribute('target')
  })
})
