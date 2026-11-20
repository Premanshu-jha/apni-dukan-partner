import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasText, resetLanguageForTests, setLanguage } from '../../i18n'
import { titleOf } from '../notifications/Inbox'
import { MemoryRouter } from 'react-router'
import { fixPath, REVIEW_REASONS, reasonText, shopAsk, teamAsk, TeamReasons } from './TeamReasons'

const read = (lang: string, area: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `src/i18n/${lang}/${area}.json`), 'utf8')) as Record<string, string>

describe("the field team's reasons", () => {
  afterEach(() => resetLanguageForTests())

  it('every reason code has words', () => {
    for (const code of REVIEW_REASONS) expect(hasText(`review.reason${code}`), code).toBe(true)
  })

  it('shows each code in the reader\'s language as a list of what to fix, then the note as written', async () => {
    await setLanguage('te')
    const te = read('te', 'review')
    render(<TeamReasons ask={teamAsk(['BOARD_NOT_VISIBLE', 'LICENCE_EXPIRED', 'BOARD_NOT_VISIBLE'], 'Board is behind a tree')!} />)
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual([te.reasonBOARD_NOT_VISIBLE, te.reasonLICENCE_EXPIRED]) // once each
    expect(screen.getByText(te.noteFromTeam)).toBeInTheDocument()
    expect(screen.getByText('Board is behind a tree')).toBeInTheDocument() // the team's words: never translated
  })

  it('a code this app doesn\'t know yet reads as "Something else"; nothing asked is null', () => {
    expect(reasonText('NEW_CODE_FROM_A_NEWER_BACKEND')).toBe(reasonText('OTHER'))
    expect(teamAsk([], '  ')).toBeNull()
    expect(shopAsk({ statusReason: null })).toBeNull()
    expect(shopAsk({ statusReason: null, statusReasonCodes: ['HOURS_MISSING'] })).toEqual({ codes: ['HOURS_MISSING'], note: null })
    // An old row: no codes, the reason is the note
    expect(shopAsk({ statusReason: 'Fix the photo' })).toEqual({ codes: [], note: 'Fix the photo' })
  })
})

describe('where each reason is fixed', () => {
  afterEach(() => resetLanguageForTests())

  it('a sent-back draft: the registration step; after registration: the Salon tab page; a verified address: the request', () => {
    const draft = { status: 'DRAFT' }
    expect(fixPath('INSIDE_PHOTOS', draft)).toBe('/register/photos')
    expect(fixPath('VIDEO_UNCLEAR', draft)).toBe('/register/photos')
    expect(fixPath('LICENCE_EXPIRED', draft)).toBe('/register/photos')
    expect(fixPath('SERVICES_MISSING', draft)).toBe('/register/services')
    expect(fixPath('HOURS_MISSING', draft)).toBe('/register/hours')
    expect(fixPath('OWNER_NAME', draft)).toBe('/register')
    expect(fixPath('PIN_WRONG_PLACE', draft)).toBe('/register')
    expect(fixPath('ADDRESS_WRONG', { status: 'DRAFT', addressLocked: true })).toBe('/setup/address')
    const live = { status: 'APPROVED', addressLocked: true }
    expect(fixPath('BOARD_NOT_VISIBLE', live)).toBe('/setup/photos')
    expect(fixPath('LICENCE_WRONG_TYPE', live)).toBe('/setup/document')
    expect(fixPath('SERVICES_MISSING', live)).toBe('/setup/services')
    expect(fixPath('HOURS_MISSING', live)).toBe('/setup/hours')
    expect(fixPath('OWNER_NAME', live)).toBe('/setup/details')
    expect(fixPath('ADDRESS_WRONG', live)).toBe('/setup/address')
    expect(fixPath('ADDRESS_WRONG', { status: 'APPROVED' })).toBe('/setup/details')
    expect(fixPath('OTHER', live)).toBeNull()
    expect(fixPath('NEW_CODE', live)).toBeNull()
    // Every code has a place but "Something else"
    for (const code of REVIEW_REASONS) expect(fixPath(code, draft) === null, code).toBe(code === 'OTHER')
  })

  it("a kirana's: its licence on the Licences page, no services or hours, the rest as a salon's", () => {
    const draft = { status: 'DRAFT', type: 'KIRANA' }
    expect(fixPath('LICENCE_EXPIRED', draft)).toBe('/register/licences')
    expect(fixPath('SHOP_FRONT_PHOTO', draft)).toBe('/register/photos')
    expect(fixPath('OWNER_NAME', draft)).toBe('/register')
    expect(fixPath('SERVICES_MISSING', draft)).toBeNull()
    expect(fixPath('HOURS_MISSING', draft)).toBeNull()
    expect(fixPath('ADDRESS_WRONG', { ...draft, addressLocked: true })).toBe('/setup/address')
    const live = { status: 'APPROVED', type: 'KIRANA' }
    expect(fixPath('LICENCE_NAME_MISMATCH', live)).toBe('/kirana/licences')
    expect(fixPath('INSIDE_PHOTOS', live)).toBe('/setup/photos')
    expect(fixPath('PIN_WRONG_PLACE', live)).toBe('/setup/details')
    expect(fixPath('HOURS_MISSING', live)).toBeNull()
  })

  it('each reason links to its page ("Fix ›" in the reader\'s language); this page\'s own come first, without a link', async () => {
    await setLanguage('kn')
    const kn = read('kn', 'review')
    render(
      <MemoryRouter>
        <TeamReasons
          ask={teamAsk(['HOURS_MISSING', 'OTHER', 'INSIDE_PHOTOS', 'LICENCE_EXPIRED'], null)!}
          fixes={{ shop: { status: 'DRAFT' }, here: '/register/photos' }}
        />
      </MemoryRouter>,
    )
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.dataset.code)).toEqual(['INSIDE_PHOTOS', 'LICENCE_EXPIRED', 'HOURS_MISSING', 'OTHER'])
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1) // hours only: photos and licence are fixed here, "Something else" nowhere
    expect(links[0]).toHaveAttribute('href', '/register/hours')
    expect(links[0]).toHaveTextContent(kn.fixLink)
    expect(links[0]).toHaveAccessibleName(kn.fixAria.replace('{reason}', kn.reasonHOURS_MISSING))
  })
})

describe('an old message in the inbox', () => {
  afterEach(() => resetLanguageForTests())

  it('shows the title its type has in the reader\'s language when the backend wrote it in English only', async () => {
    const old = { type: 'SALON_NEW_BOOKING', title: 'New booking, 4:30 PM' }
    expect(titleOf(old)).toBe('New booking, 4:30 PM') // English: as sent
    await setLanguage('hi')
    expect(titleOf(old)).toBe(read('hi', 'notifications').typeSALON_NEW_BOOKING)
    // Written in Hindi by the backend already: as sent; an unknown type: as sent
    expect(titleOf({ type: 'SALON_NEW_BOOKING', title: 'नई बुकिंग, 4:30 PM' })).toBe('नई बुकिंग, 4:30 PM')
    expect(titleOf({ type: 'SOMETHING_NEW', title: 'Something new' })).toBe('Something new')
    // The subscription's messages too
    expect(titleOf({ type: 'SUBSCRIPTION_PAID', title: 'Payment received' })).toBe(read('hi', 'notifications').typeSUBSCRIPTION_PAID)
    expect(titleOf({ type: 'SUBSCRIPTION_ENDING', title: 'Your free trial ends on 12 Dec' })).toBe(read('hi', 'notifications').typeSUBSCRIPTION_ENDING)
  })
})
