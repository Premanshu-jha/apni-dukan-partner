import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
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

describe('public pages', () => {
  beforeEach(() => useSession.setState({ status: 'signedOut', user: null }))

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
    expect(screen.getByText(/Cancel any time; payment stops from the next month/)).toBeInTheDocument()
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
    expect(screen.getByText(/Payment stops from the next month/)).toBeInTheDocument()
    expect(screen.getByText(/keeps taking online bookings until the end of the month already paid/)).toBeInTheDocument()
    expect(screen.getByText(/stopping the AutoPay mandate in your UPI app or bank, or by writing to us/)).toBeInTheDocument()
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
    expect(screen.getByText(`Last updated: ${BUSINESS.policiesUpdated}`)).toBeInTheDocument()
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
})
