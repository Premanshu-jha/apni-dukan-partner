import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MemoryRouter } from 'react-router'
import { resetLanguageForTests, setLanguage } from '../../i18n'
import { BUSINESS, OPERATED_BY } from '../../lib/business'
import { useSession } from '../../store/session'
import { About } from './About'
import { Contact } from './Contact'
import { Delivery } from './Delivery'
import { Privacy } from './Privacy'
import { Refunds } from './Refunds'
import { Terms } from './Terms'

function at(path: string, page: React.ReactNode) {
  render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>)
}

const words = (lang: string, area: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `src/i18n/${lang}/${area}.json`), 'utf8')) as Record<string, string>

describe('public pages', () => {
  beforeEach(() => useSession.setState({ status: 'signedOut', user: null }))
  afterEach(() => {
    resetLanguageForTests()
    window.localStorage.clear()
  })

  it.each([
    ['/about', <About key="a" />, 'Clozest for salons'],
    ['/contact', <Contact key="c" />, 'Contact us'],
    ['/terms', <Terms key="t" />, 'Terms of service'],
    ['/privacy', <Privacy key="p" />, 'Privacy policy'],
    ['/refunds', <Refunds key="r" />, 'Refunds and cancellation'],
    ['/delivery', <Delivery key="d" />, 'Shipping and delivery'],
  ])('%s says who runs Clozest and links to the other pages, itself not as a link', (path, page, title) => {
    at(path, page)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(OPERATED_BY)).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'About Clozest' })
    const links = Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(links).toHaveLength(5)
    expect(links).not.toContain(path)
    expect(nav.querySelector('[aria-current="page"]')).not.toBeNull()
  })

  it('About (the front page) shows the logo, the price, the trial and how salons pay, and that customers pay nothing', () => {
    at('/about', <About />)
    expect(screen.getByText('Clozest Partner', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.getByText(/₹500 a month per salon, after a free trial of 30 days/)).toBeInTheDocument()
    expect(screen.getByText(/The trial starts when the field team approves your salon/)).toBeInTheDocument()
    expect(screen.getByText(/UPI AutoPay .*card or netbanking, through Razorpay/)).toBeInTheDocument()
    expect(screen.getByText(/Cancel any time: you keep the month already paid, and nothing more is taken/)).toBeInTheDocument()
    expect(screen.getByText(/Customers book on Clozest for free and pay nothing to Clozest/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in or sign up' })).toHaveAttribute('href', '/signin')
    expect(screen.getByText(/no GST is added/)).toBeInTheDocument()
    expect(screen.getByText(/we tell you before the first payment/)).toBeInTheDocument()
    expect(screen.getByText(/the owner adds pay nothing/)).toBeInTheDocument()
  })

  it('About: signed in, the button opens the salon; while the session is starting, no button at all', () => {
    useSession.setState({ status: 'signedIn' })
    const { unmount } = render(<MemoryRouter initialEntries={['/about']}><About /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Open my salon' })).toHaveAttribute('href', '/')
    unmount()
    useSession.setState({ status: 'starting' })
    at('/about', <About />)
    expect(screen.queryByRole('link', { name: /Sign in or sign up|Open my salon/ })).toBeNull()
  })

  it('the refund policy: no refunds, and cancelling stops payment from the next month', () => {
    at('/refunds', <Refunds />)
    expect(screen.getByText(/Subscription payments are not refunded/)).toBeInTheDocument()
    expect(screen.getByText(/including for a month that has already started/)).toBeInTheDocument()
    expect(screen.getByText(/You keep the month already paid; nothing more is charged after you cancel/)).toBeInTheDocument()
    expect(screen.getByText(/keeps taking online bookings until the end of the month already paid/)).toBeInTheDocument()
    expect(screen.getByText(/stop Clozest's AutoPay in your UPI app .* or with your bank, or\s+write to us and we'll stop it/)).toBeInTheDocument()
    expect(screen.getByText(/Customers pay Clozest nothing/)).toBeInTheDocument()
    // Cancelling never points to an in-app button that doesn't exist yet
    expect(document.body.textContent).not.toMatch(/partner app or/)
  })

  it('Terms: the subscription, the 3-day lapse, and customers paying the salon', () => {
    at('/terms', <Terms />)
    expect(screen.getByText(/the subscription is ₹\s*500 a month, paid in advance through Razorpay/)).toBeInTheDocument()
    expect(screen.getByText(/not paid within 3 days of its start, the salon is hidden from customers/)).toBeInTheDocument()
    expect(screen.getByText(/Customers book for free and pay you at the salon/)).toBeInTheDocument()
    expect(screen.getByText(/is responsible for what they\s+do in it/)).toBeInTheDocument()
  })

  it('Privacy: customers never see the owner\'s phone, email or documents', () => {
    at('/privacy', <Privacy />)
    expect(screen.getByText(/never the\s+owner's phone, email or documents/)).toBeInTheDocument()
    expect(screen.getByText(/an owner closes or hands over the salon first/)).toBeInTheDocument()
    expect(screen.getByText('Last updated: 15 November 2026')).toBeInTheDocument()
  })

  it('Contact gives an email, a phone to tap and the address, and points to More → Write to support', () => {
    at('/contact', <Contact />)
    expect(screen.getAllByRole('link', { name: BUSINESS.email })[0]).toHaveAttribute('href', `mailto:${BUSINESS.email}`)
    expect(screen.getByRole('link', { name: BUSINESS.phone })).toHaveAttribute('href', 'tel:+919381251613')
    expect(screen.getByText(new RegExp(BUSINESS.address))).toBeInTheDocument()
    // The full registered (Udyam) address, with its PIN code: Razorpay's website check wants a full address
    expect(BUSINESS.address).toMatch(/G-10, A Block, G\.K\. Habitat Royal, Yapral, Secunderabad, Hyderabad, Telangana 500094/)
    expect(screen.getByText('Write to support')).toBeInTheDocument()
  })

  it('Delivery: nothing is shipped; the subscription starts once paid', () => {
    at('/delivery', <Delivery />)
    expect(screen.getByText(/We sell and ship no physical goods/)).toBeInTheDocument()
    expect(screen.getByText(/starts as soon as it is paid/)).toBeInTheDocument()
  })

  it('About in Hindi: picked on the page (under the logo, kept as the phone\'s choice), every text in Hindi, the amounts unchanged', async () => {
    const hi = words('hi', 'about')
    at('/about', <About />)
    const picker = screen.getByRole('group', { name: 'Choose your language' })
    // Under the logo and the tagline, before everything else
    expect(screen.getByText('Near You. For You.').compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'हिन्दी' }))
    expect(await screen.findByRole('heading', { level: 1, name: hi.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'हिन्दी' })).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('language')).toBe('hi')
    // The price and the trial: the same figures, in the Hindi sentence
    const price = hi.priceLine.replace('{price}', '500').replace('{days}', '30')
    expect(price).toMatch(/₹500/)
    expect(screen.getByText(price)).toBeInTheDocument()
    expect(screen.getByText(hi.priceNoGst.replace('{price}', '500'))).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: hi.priceTitle })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: hi.signInOrUp })).toHaveAttribute('href', '/signin')
    expect(screen.getByRole('link', { name: hi.customersRefundLink })).toHaveAttribute('href', '/refunds')
    // Nothing of the English page is left, but the tagline and who runs Clozest stay in English
    expect(document.body.textContent).not.toMatch(/What you get|Online bookings|Cancel any time|Questions\?|Sign in or sign up/)
    expect(screen.getByText('Near You. For You.')).toBeInTheDocument()
    expect(screen.getByText(OPERATED_BY)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: words('hi', 'misc').legalNavAria })).toBeInTheDocument()
  })

  it('About offers the languages only to someone signed out (signed in, it is under More)', () => {
    useSession.setState({ status: 'signedIn' })
    at('/about', <About />)
    expect(screen.queryByRole('group', { name: 'Choose your language' })).toBeNull()
  })

  it('Contact in Telugu: the words translated, the email, phone and address as they are', async () => {
    const te = words('te', 'about')
    await act(async () => {
      await setLanguage('te')
    })
    at('/contact', <Contact />)
    expect(screen.getByRole('heading', { level: 1, name: te.contactTitle })).toBeInTheDocument()
    expect(screen.getByText(te.contactPhone)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: BUSINESS.phone })).toHaveAttribute('href', 'tel:+919381251613')
    expect(screen.getAllByRole('link', { name: BUSINESS.email })[0]).toHaveAttribute('href', `mailto:${BUSINESS.email}`)
    expect(screen.getByText(new RegExp(BUSINESS.address))).toBeInTheDocument()
    expect(screen.getByText(words('te', 'help').writeToSupport)).toBeInTheDocument()
    expect(document.body.textContent).toContain(words('te', 'app').tabMore)
    expect(document.body.textContent).not.toMatch(/Write or call|Grievance officer|Signed in\?/)
  })

  it.each([
    ['/terms', <Terms key="t" />, 'termsTitle', 'Law and disputes'],
    ['/privacy', <Privacy key="p" />, 'privacyTitle', 'What we collect'],
    ['/refunds', <Refunds key="r" />, 'refundsTitle', 'Cancelling'],
    ['/delivery', <Delivery key="d" />, 'deliveryTitle', 'Nothing is shipped'],
  ])('%s: the policy stays in English; in another language its title and links are translated and a line says the English applies', async (path, page, title, english) => {
    const en = words('en', 'about')
    const { unmount } = render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>)
    expect(screen.queryByText(en.englishApplies)).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
    unmount()

    const ta = words('ta', 'about')
    await act(async () => {
      await setLanguage('ta')
    })
    at(path, page)
    expect(screen.getByRole('heading', { level: 1, name: ta[title] })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(ta.englishApplies)
    const policy = screen.getByRole('heading', { level: 2, name: english })
    expect(policy.closest('[lang="en"]')).not.toBeNull()
    expect(screen.getByText(OPERATED_BY)).toHaveAttribute('lang', 'en')
    const nav = screen.getByRole('navigation', { name: words('ta', 'misc').legalNavAria })
    expect(nav).toHaveTextContent(words('ta', 'misc').legalContact)
  })
})
