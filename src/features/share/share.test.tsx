import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ServiceItem, ShopRole, ShopStatus, Staff, SubscriptionView } from '../../api/types'
import { linkState, posterFileName, salonLink, whatsMissing, whatsappHref } from './link'
import { fitLines, layoutPoster, LINK_BASELINE, POSTER_HEIGHT, type Measure, type PosterLayout } from './poster'
import QRCode from 'qrcode'
import { SharePage } from './SharePage'
import { SubscriptionBanner } from '../subscription/SubscriptionBanner'

const state = vi.hoisted(() => ({
  status: 'APPROVED' as ShopStatus,
  role: 'OWNER' as ShopRole,
  sub: null as SubscriptionView | null,
  pausedUntil: null as string | null,
  services: undefined as ServiceItem[] | undefined,
  staff: undefined as Staff[] | undefined,
  draw: vi.fn(),
  app: false,
  shareText: vi.fn(),
  sharePng: vi.fn(),
  savePng: vi.fn(),
}))

vi.mock('../../lib/platform', () => ({ isApp: () => state.app }))
vi.mock('../../lib/appShare', () => ({
  shareTextInApp: (...a: unknown[]) => state.shareText(...a),
  sharePngInApp: (...a: unknown[]) => state.sharePng(...a),
  savePngInApp: (...a: unknown[]) => state.savePng(...a),
}))

vi.mock('../../api/shop', async (orig) => ({
  ...(await orig<typeof import('../../api/shop')>()),
  useShop: () => ({ id: 'shop1', name: 'Shine Unisex Salon', ownerName: 'Ravi Kumar', myRole: state.role, status: state.status }),
}))
vi.mock('../../api/subscription', async (orig) => ({
  ...(await orig<typeof import('../../api/subscription')>()),
  useSubscription: () => ({ data: state.sub ?? undefined }),
}))
vi.mock('../../api/salon', async (orig) => ({
  ...(await orig<typeof import('../../api/salon')>()),
  usePause: () => ({ data: { pausedUntil: state.pausedUntil } }),
  useServices: () => ({ data: state.services }),
  useStaff: () => ({ data: state.staff }),
}))
vi.mock('./poster', async (orig) => ({
  ...(await orig<typeof import('./poster')>()),
  drawPoster: (...args: unknown[]) => state.draw(...args),
  posterBlob: async () => new Blob(['png'], { type: 'image/png' }),
}))

const LINK = 'https://clozest.in/salons/shop1'

const service = (id: string, active = true) => ({ id, name: 'Haircut', durationMinutes: 30, pricePaise: 10000, priceIsFrom: false, active, sortOrder: 0 }) as ServiceItem
const barber = (over: Partial<Staff>) =>
  ({ id: 'st1', name: 'Raju', active: true, serviceIds: ['sv1'], hours: [{ weekday: 1, start: '10:00', end: '19:00' }], loginPhone: null, photoFileId: null, version: 0, createdAt: '', updatedAt: '', ...over }) as Staff

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SharePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function sub(over: Partial<SubscriptionView>): SubscriptionView {
  const later = new Date(Date.now() + 20 * 86_400_000).toISOString()
  return {
    state: 'TRIAL', trialEndsAt: later, paidUntil: null, accessUntil: later, hiddenFrom: later, razorpayStatus: null,
    pricePerMonth: 500, enforced: true, canPay: true, paymentsReady: true, testMode: false, ...over,
  }
}

beforeEach(() => {
  state.status = 'APPROVED'
  state.role = 'OWNER'
  state.sub = sub({})
  state.pausedUntil = null
  state.services = [service('sv1')]
  state.staff = [barber({})]
  state.draw.mockReset().mockResolvedValue(undefined)
  URL.createObjectURL = vi.fn(() => 'blob:poster')
  URL.revokeObjectURL = vi.fn()
  Reflect.deleteProperty(navigator, 'share')
  Reflect.deleteProperty(navigator, 'canShare')
})

describe('the salon link', () => {
  it('is the customer app’s salon page, and WhatsApp gets the whole message', () => {
    expect(salonLink('shop1')).toBe(LINK)
    expect(whatsappHref('Book at A & B: https://x.in/s?1')).toBe('https://wa.me/?text=Book%20at%20A%20%26%20B%3A%20https%3A%2F%2Fx.in%2Fs%3F1')
  })

  it('works only for an approved salon', () => {
    expect(linkState('APPROVED')).toBe('live')
    expect(linkState('SUSPENDED')).toBe('suspended')
    for (const s of ['DRAFT', 'PENDING_VISIT', 'CLOSED'] as const) expect(linkState(s)).toBe('notLive')
  })

  it('names the poster after the salon, in its own script', () => {
    expect(posterFileName('Shine Unisex Salon')).toBe('shine-unisex-salon-clozest-poster.png')
    expect(posterFileName('शाइन सैलून!')).toBe('शाइन-सैलून-clozest-poster.png')
    expect(posterFileName('***')).toBe('clozest-poster.png')
  })
})

describe('fitting words on the poster', () => {
  // Every character half the font size wide
  const measure: Measure = (text, size) => [...text].length * size * 0.5
  it('keeps the biggest size that fits in the lines allowed', () => {
    expect(fitLines('Shine Salon', 1000, [150, 100], 2, measure)).toEqual({ size: 150, lines: ['Shine Salon'] })
    // 35 characters: three lines at 150 (75 px a character, 13 to a line), two at 100 (20 to a line)
    const long = fitLines('Shine Unisex Salon And Spa Of Noida', 1000, [150, 100], 2, measure)
    expect(long.size).toBe(100)
    expect(long.lines.length).toBeLessThanOrEqual(2)
    expect(long.lines.every((l) => measure(l, long.size) <= 1000)).toBe(true)
  })

  it('shortens a name that never fits with "…", and breaks a single long word', () => {
    const out = fitLines('A B C D E F G H I J K L M N O P Q R S T', 200, [100], 2, measure)
    expect(out.lines).toHaveLength(2)
    expect(out.lines[1].endsWith('…')).toBe(true)
    expect(out.lines.every((l) => measure(l, 100) <= 200)).toBe(true)
    expect(fitLines('ABCDEFGH', 200, [100], 3, measure).lines).toEqual(['ABCD', 'EFGH'])
  })

  it('never cuts a letter from its vowel sign', () => {
    // "कि" is two code points, one letter: it stays whole
    const out = fitLines('किकिकिकि', 100, [100], 4, (text) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length * 50)
    expect(out.lines).toEqual(['किकि', 'किकि'])
  })
})

describe('the poster\'s layout: everything ends above the link line', () => {
  const area = (lang: string) => JSON.parse(readFileSync(join(process.cwd(), `src/i18n/${lang}/share.json`), 'utf8')) as Record<string, string>
  const LONG: Record<string, string> = {
    en: 'Sri Venkateswara Gents Beauty Parlour and Spa',
    hi: 'श्री वेंकटेश्वर जेंट्स ब्यूटी पार्लर एंड स्पा',
    te: 'శ్రీ వెంకటేశ్వర జెంట్స్ బ్యూటీ పార్లర్ అండ్ స్పా',
    mr: 'श्री व्यंकटेश्वर जेंट्स ब्युटी पार्लर अँड स्पा',
    ta: 'ஸ்ரீ வெங்கடேஸ்வரா ஜென்ட்ஸ் பியூட்டி பார்லர் அண்ட் ஸ்பா',
    kn: 'ಶ್ರೀ ವೆಂಕಟೇಶ್ವರ ಜೆಂಟ್ಸ್ ಬ್ಯೂಟಿ ಪಾರ್ಲರ್ ಅಂಡ್ ಸ್ಪಾ',
  }
  const letters = (text: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length
  // Indian letters drawn wider than Latin ones (as Noto Sans draws them); a second, wider still, to be sure
  const measures: Array<[string, Measure]> = [
    ['as drawn', (text, size) => letters(text) * size * (/[\u0900-\u0DFF]/.test(text) ? 0.72 : 0.56)],
    ['wide', (text, size) => letters(text) * size * 0.9],
  ]
  const link = salonLink('5f0c6f0e-3b7a-4d2e-9c55-2a8f4f1d9e01')
  const modules = QRCode.create(link, { errorCorrectionLevel: 'Q' }).modules.size

  function check(layout: PosterLayout, label: string) {
    const lastName = layout.name.baselines[layout.name.baselines.length - 1]
    const firstScanTop = layout.scan.baselines[0] - layout.scan.size
    const lastScan = layout.scan.baselines[layout.scan.baselines.length - 1]
    expect(firstScanTop, `${label}: scan under the name`).toBeGreaterThanOrEqual(lastName)
    expect(layout.qr.y, `${label}: code under the scan line`).toBeGreaterThanOrEqual(lastScan)
    expect(layout.steps.centres[0] - 42, `${label}: steps under the code`).toBeGreaterThanOrEqual(layout.qr.y + layout.qr.side)
    const lastStep = layout.steps.centres[layout.steps.centres.length - 1]
    expect(layout.pay.baselines[0] - layout.pay.size, `${label}: pay under the steps`).toBeGreaterThanOrEqual(lastStep + 42)
    expect(layout.bottomOfPay + 40, `${label}: pay ends above the link line`).toBeLessThanOrEqual(layout.topOfLink)
    expect(layout.link.baselines[0]).toBe(LINK_BASELINE)
    expect(layout.link.baselines[0], `${label}: inside the frame`).toBeLessThan(POSTER_HEIGHT - 60)
    // Never a code too small to scan from the counter
    expect(layout.qr.side, `${label}: code size`).toBeGreaterThanOrEqual(600)
  }

  for (const lang of ['en', 'hi', 'te', 'mr', 'ta', 'kn']) {
    it(`${lang}: a long salon name and the language's own words`, () => {
      const w = area(lang)
      for (const [how, measure] of measures) {
        for (const salon of [LONG[lang], LONG.en, 'Ravi Salon', `${LONG[lang]} ${LONG[lang]}`]) {
          const texts = { salon, scan: w.posterScan, steps: [w.posterStep1, w.posterStep2, w.posterStep3] as [string, string, string], pay: w.posterPay, link }
          check(layoutPoster(texts, modules, measure), `${lang} ${how} "${salon}"`)
        }
      }
    })
  }

  it('the worst case (name and scan line both on two lines at their biggest) still fits, with the code made smaller', () => {
    // Every text exactly too wide for one line at any size: two lines each, at the biggest size allowed
    const twoLines: Measure = (text) => (text.includes(' ') ? 1e6 : 10)
    const texts = { salon: 'Long name', scan: 'Scan this', steps: ['a', 'b', 'c'] as [string, string, string], pay: 'Pay', link }
    const layout = layoutPoster(texts, modules, twoLines)
    expect(layout.name.lines).toHaveLength(2)
    expect(layout.scan.lines).toHaveLength(2)
    check(layout, 'worst')
    // A short name keeps the biggest code
    const roomy = layoutPoster({ ...texts, salon: 'Ravi', scan: 'Scan' }, modules, twoLines)
    expect(roomy.qr.side).toBeGreaterThan(layout.qr.side)
  })
})

describe('Share your salon', () => {
  it('a live salon: the link, WhatsApp with the message ready, copy with "Copied", and the poster drawn for it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    show()
    expect(screen.getByRole('heading', { name: 'Share your salon' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: "Your salon's link" })).toHaveValue(LINK)
    const wa = screen.getByRole('link', { name: 'Share on WhatsApp' })
    expect(wa).toHaveAttribute('href', whatsappHref(`Book your time at Shine Unisex Salon on Clozest, no waiting at the salon: ${LINK}`))
    expect(wa).toHaveAttribute('target', '_blank')
    // No share sheet in this browser: no button for it
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByRole('button', { name: 'Copied' })
    expect(writeText).toHaveBeenCalledWith(LINK)

    const poster = await screen.findByRole('img', { name: 'Poster for Shine Unisex Salon: scan to book your time' })
    expect(poster).toHaveAttribute('src', 'blob:poster')
    expect(state.draw).toHaveBeenCalledWith(expect.anything(), LINK, {
      salon: 'Shine Unisex Salon',
      scan: 'Scan to book your time',
      steps: ['Scan this code', 'Pick your services', 'Pick a time'],
      pay: 'Pay at the salon',
      link: 'clozest.in/salons/shop1',
    })
    const download = screen.getByRole('link', { name: 'Download poster' })
    expect(download).toHaveAttribute('download', 'shine-unisex-salon-clozest-poster.png')
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalled()
    // The printer's copy sits straight under <body>
    expect(document.body.querySelector(':scope > .share-print img')).toHaveAttribute('src', 'blob:poster')
  })

  it('no clipboard: says so and selects the link to copy by hand', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByText(/Couldn't copy\. The link is selected above/)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('the phone’s share sheet, where it has one, gets the same message', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError'))
    Object.assign(navigator, { share })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({
      title: 'Shine Unisex Salon on Clozest',
      text: `Book your time at Shine Unisex Salon on Clozest, no waiting at the salon: ${LINK}`,
    }))
    // Closing the sheet says nothing
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a poster that couldn’t be drawn says so and tries again on a tap', async () => {
    state.draw.mockRejectedValueOnce(new Error('no canvas'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('img', { name: /Poster for Shine Unisex Salon/ })).toBeInTheDocument()
    expect(state.draw).toHaveBeenCalledTimes(2)
  })

  it.each(['PENDING_VISIT', 'DRAFT'] as const)('%s: not live yet, said plainly, with nothing to send or print', (status) => {
    state.status = status
    show()
    expect(screen.getByText("Your salon isn't live yet")).toBeInTheDocument()
    expect(screen.getByText(/only see "No such salon"/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Share on WhatsApp' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull()
    expect(state.draw).not.toHaveBeenCalled()
  })

  it('suspended: what customers see now, where to see why, and help', () => {
    state.status = 'SUSPENDED'
    show()
    expect(screen.getByText('Your salon is off the app for now')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See why on Home' })).toHaveAttribute('href', '/')
    // Straight to the form (they asked to write), about this screen, back here after sending
    expect(screen.getByRole('link', { name: 'Write to us' }).getAttribute('href')).toMatch(/^\/help\?from=.+&write=1$/)
    expect(screen.queryByRole('link', { name: 'Share on WhatsApp' })).toBeNull()
  })

  it('hidden for an unpaid subscription: the subscription’s own banner, and what the link shows', () => {
    state.sub = sub({ state: 'HIDDEN', accessUntil: new Date(Date.now() - 5 * 86_400_000).toISOString(), hiddenFrom: new Date(Date.now() - 86_400_000).toISOString() })
    show()
    expect(screen.getByText(/Right now customers can't find your salon in the app\. Anyone opening your link sees your salon but can't book\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pay now' })).toHaveAttribute('href', '/subscription')
    // Still shareable: the poster outlasts the payment
    expect(screen.getByRole('link', { name: 'Share on WhatsApp' })).toBeInTheDocument()
  })

  it('not yet enforced: no "can’t find" line', () => {
    state.sub = sub({ state: 'HIDDEN', enforced: false })
    show()
    expect(screen.queryByText(/Right now customers can't find/)).toBeNull()
  })

  it('paused: said, with the way to start again for the owner or a helper, not a barber', () => {
    state.pausedUntil = new Date(Date.now() + 3_600_000).toISOString()
    state.role = 'HELPER'
    const { unmount } = show()
    expect(screen.getByText(/Online bookings are paused until .*can't pick a time\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start them again on Today' })).toHaveAttribute('href', '/salon/day')
    unmount()
    state.role = 'BARBER'
    show()
    expect(screen.getByText(/Online bookings are paused until/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Start them again on Today' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Share on WhatsApp' })).toBeInTheDocument()
  })

  it('a pause that has ended says nothing', () => {
    state.pausedUntil = new Date(Date.now() - 60_000).toISOString()
    show()
    expect(screen.queryByText(/Online bookings are paused/)).toBeNull()
  })
})

describe('a live salon customers can’t book yet', () => {
  it('follows Today’s checklist rule', () => {
    expect(whatsMissing([service('sv1')], [barber({})])).toBeNull()
    expect(whatsMissing([], [barber({})])).toBe('services')
    expect(whatsMissing([service('sv1', false)], [barber({})])).toBe('services')
    expect(whatsMissing([service('sv1')], [])).toBe('barbers')
    expect(whatsMissing([service('sv1')], [barber({ active: false })])).toBe('barbers')
    expect(whatsMissing([service('sv1')], [barber({ hours: [] })])).toBe('hours')
    expect(whatsMissing([service('sv1'), service('sv2', false)], [barber({ serviceIds: ['sv2'] })])).toBe('hours')
  })

  it('the owner: what customers will see, one tap to fix it, and sharing still there', () => {
    state.services = []
    show()
    expect(screen.getByText("Customers will see your salon but can't book yet: add your services and prices.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add services' })).toHaveAttribute('href', '/setup/services')
    expect(screen.getByRole('link', { name: 'Share on WhatsApp' })).toBeInTheDocument()
  })

  it('no barber with hours: to the barbers', () => {
    state.staff = [barber({ hours: [] })]
    show()
    expect(screen.getByText(/give a barber his services and weekly hours/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Set up barbers' })).toHaveAttribute('href', '/setup/staff')
  })

  it('a helper or barber is told to ask the owner (only he edits the setup)', () => {
    state.staff = []
    state.role = 'HELPER'
    show()
    expect(screen.getByText(/add your barbers\./)).toBeInTheDocument()
    expect(screen.getByText('Ask Ravi Kumar to set this up. You can still share the link now.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Set up barbers' })).toBeNull()
  })

  it('says nothing until both lists are in', () => {
    state.services = []
    state.staff = undefined
    show()
    expect(screen.queryByText(/can't book yet/)).toBeNull()
  })
})

describe('paused', () => {
  it('"Start them again on Today" is a full-size tap target', () => {
    state.pausedUntil = new Date(Date.now() + 3_600_000).toISOString()
    show()
    expect(screen.getByRole('link', { name: 'Start them again on Today' })).toHaveClass('min-h-11')
  })
})

describe('the subscription on the share page', () => {
  it('grace, or a trial ending this week: the very banner Today shows', () => {
    const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
    for (const s of [
      sub({ state: 'GRACE', trialEndsAt: soon(-3), accessUntil: soon(-1), hiddenFrom: soon(4) }),
      sub({ state: 'TRIAL', trialEndsAt: soon(3), accessUntil: soon(3), hiddenFrom: soon(10) }),
    ]) {
      state.sub = s
      const qc = new QueryClient()
      const alone = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <SubscriptionBanner />
          </MemoryRouter>
        </QueryClientProvider>,
      )
      const words = alone.container.textContent!
      alone.unmount()
      expect(words, s.state).not.toBe('')
      const page = show()
      expect(page.container.textContent, s.state).toContain(words)
      page.unmount()
    }
  })
})

describe('Share poster', () => {
  it('where the phone can share files: sends the PNG with the message', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn((d: ShareData) => Boolean(d.files?.length))
    Object.assign(navigator, { share, canShare })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Share poster' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const sent = share.mock.calls[0][0] as ShareData
    expect(sent.files?.[0].name).toBe('shine-unisex-salon-clozest-poster.png')
    expect(sent.files?.[0].type).toBe('image/png')
    expect(sent.text).toBe(`Book your time at Shine Unisex Salon on Clozest, no waiting at the salon: ${LINK}`)
  })

  it('hidden where files can’t be shared, or there is no share sheet', async () => {
    Object.assign(navigator, { share: vi.fn(), canShare: () => false })
    const { unmount } = show()
    await screen.findByRole('link', { name: 'Download poster' })
    expect(screen.queryByRole('button', { name: 'Share poster' })).toBeNull()
    unmount()
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'canShare')
    show()
    await screen.findByRole('link', { name: 'Download poster' })
    expect(screen.queryByRole('button', { name: 'Share poster' })).toBeNull()
  })
})

describe('sharing in the Play Store app', () => {
  afterEach(() => {
    state.app = false
  })

  it('Share and Share poster use Android’s share sheet with the same message; no Download or Print (a web view can’t)', async () => {
    state.app = true
    state.shareText.mockReset().mockResolvedValue(undefined)
    state.sharePng.mockReset().mockResolvedValue('done')
    // No navigator.share in the app's web view: the button is there all the same
    Object.assign(navigator, { share: undefined, canShare: undefined })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const message = `Book your time at Shine Unisex Salon on Clozest, no waiting at the salon: ${LINK}`
    await waitFor(() => expect(state.shareText).toHaveBeenCalledWith('Shine Unisex Salon on Clozest', message))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share poster' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Share poster' }))
    await waitFor(() => expect(state.sharePng).toHaveBeenCalledWith(expect.any(Blob), 'shine-unisex-salon-clozest-poster.png',
      'Shine Unisex Salon on Clozest', message))
    expect(screen.queryByRole('link', { name: 'Download poster' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull()
    // WhatsApp is still a link (Android opens WhatsApp for it)
    expect(screen.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute('target', '_blank')
  })

  it('a share that fails (the phone full) says so; Save to phone saves to the pictures, or says why not', async () => {
    state.app = true
    state.sharePng.mockReset().mockResolvedValue('failed')
    state.savePng.mockReset().mockResolvedValueOnce('saved').mockResolvedValueOnce('failed')
    Object.assign(navigator, { share: undefined, canShare: undefined })
    show()
    // Greyed while the poster draws, then there
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share poster' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Share poster' }))
    expect(await screen.findByText(/Couldn't share the poster\. Free some space/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save to phone' }))
    expect(await screen.findByText(/Saved in your phone's Pictures › Clozest/)).toBeInTheDocument()
    expect(state.savePng).toHaveBeenCalledWith(expect.any(Blob), 'shine-unisex-salon-clozest-poster.png')
    fireEvent.click(screen.getByRole('button', { name: 'Save to phone' }))
    expect(await screen.findByText(/Couldn't save the poster/)).toBeInTheDocument()
  })

  it('an older phone that can’t save to its pictures gets the share sheet instead', async () => {
    state.app = true
    state.sharePng.mockReset().mockResolvedValue('done')
    state.savePng.mockReset().mockResolvedValue('unsupported')
    Object.assign(navigator, { share: undefined, canShare: undefined })
    show()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save to phone' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Save to phone' }))
    await waitFor(() => expect(state.sharePng).toHaveBeenCalled())
    expect(screen.queryByText(/Couldn't save/)).toBeNull()
  })
})
