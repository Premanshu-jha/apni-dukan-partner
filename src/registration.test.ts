import { describe, expect, it } from 'vitest'
import type { CatalogService, ServiceItem } from './api/types'
import { ApiError } from './api/errors'
import { checkService, comeBackText, serviceIn } from './features/setup/Services'
import { batchMessage, catalogRows, checkRows, type Row } from './features/shop/RegisterServices'
import { ALL_REASONS, CHECK_AGAIN_REASONS, docKind, docLabel, docProblem, indiaToday, licenceReasonText, licenceState, licenceSummary, MAX_DOC_BYTES, shortDate } from './features/shop/RegistrationDoc'
import { newestShop } from './api/shop'
import type { Shop } from './api/types'
import {
  checkSalonWeek,
  defaultWeek,
  fromSalonWeek,
  salonShifts,
  toSalonWeek,
  weekLines,
} from './lib/salonHours'

const CATALOG: CatalogService[] = [
  { name: 'Haircut', durationMinutes: 30, returnAfterDays: 21 },
  { name: 'Beard trim', durationMinutes: 15, returnAfterDays: 7 },
  { name: 'Hair wash', durationMinutes: 15, returnAfterDays: 0 },
]

function service(name: string, active = true): ServiceItem {
  return {
    id: name,
    name,
    durationMinutes: 30,
    pricePaise: 15000,
    priceIsFrom: false,
    active,
    sortOrder: 0,
    returnAfterDays: 14,
    version: 0,
    createdAt: '',
    updatedAt: '',
  }
}

describe('the salon’s opening hours', () => {
  it('goes between the backend’s open days and the editor’s week', () => {
    const days = [
      { weekday: 1, open: '10:00', close: '21:00' },
      { weekday: 6, open: '09:00', close: '24:00' },
    ]
    const week = toSalonWeek(days)
    expect(week[1]).toEqual({ open: '10:00', close: '21:00' })
    expect(week[2]).toBeNull()
    expect(fromSalonWeek(week)).toEqual(days)
    expect(fromSalonWeek(defaultWeek())).toHaveLength(7)
  })

  it('needs one open day, close after open and 15-minute steps', () => {
    expect(checkSalonWeek(defaultWeek())).toBeNull()
    expect(checkSalonWeek(toSalonWeek([]))).toMatch(/at least one day/)
    expect(checkSalonWeek(toSalonWeek([{ weekday: 2, open: '21:00', close: '10:00' }]))).toMatch(/Tue.*after opening/)
    expect(checkSalonWeek(toSalonWeek([{ weekday: 3, open: '10:10', close: '20:00' }]))).toMatch(/15-minute/)
    expect(checkSalonWeek(toSalonWeek([{ weekday: 3, open: '10:00', close: '24:00' }]))).toBeNull()
  })

  it('lists every day, closed ones too, and gives a barber the same week', () => {
    const days = [{ weekday: 1, open: '10:00', close: '21:00' }]
    expect(weekLines(days, (t) => t)).toEqual([
      'Mon: 10:00 – 21:00',
      'Tue: Closed',
      'Wed: Closed',
      'Thu: Closed',
      'Fri: Closed',
      'Sat: Closed',
      'Sun: Closed',
    ])
    expect(salonShifts(days)).toEqual([{ weekday: 1, start: '10:00', end: '21:00' }])
  })
})

describe('services at registration', () => {
  it('offers the catalog’s services the salon doesn’t have yet, unticked, with the suggestions', () => {
    const rows = catalogRows(CATALOG, [service('haircut'), service('Hair wash', false)])
    expect(rows.map((r) => r.form.name)).toEqual(['Beard trim', 'Hair wash'])
    expect(rows[0]).toMatchObject({ ticked: false, custom: false, form: { minutes: '15', returnDays: '7', rupees: '' } })
  })

  it('checks only the ticked ones: a price each, no name twice', () => {
    const rows = catalogRows(CATALOG, [])
    expect(checkRows(rows, [])).toBeNull()
    const ticked: Row[] = rows.map((r, i) => (i === 0 ? { ...r, ticked: true } : r))
    expect(checkRows(ticked, [])).toMatch(/Haircut: enter the price/)
    ticked[0] = { ...ticked[0], form: { ...ticked[0].form, rupees: '150' } }
    expect(checkRows(ticked, [])).toBeNull()
    const own: Row = { key: 'own', ticked: true, custom: true, form: { name: 'HAIRCUT', minutes: '30', rupees: '100', from: false, returnDays: '14' } }
    expect(checkRows([...ticked, own], [])).toMatch(/twice/)
    expect(checkRows([own], [service('Haircut')])).toMatch(/twice/)
    expect(checkRows([{ ...own, form: { ...own.form, returnDays: '200' } }], [])).toMatch(/come-back/)
  })

  it('says when the customer is reminded to come back', () => {
    expect(comeBackText(0)).toBeNull()
    expect(comeBackText(7)).toBe('back in 1 week')
    expect(comeBackText(21)).toBe('back in 3 weeks')
    expect(comeBackText(10)).toBe('back in 10 days')
  })
})

describe('a refused batch of services', () => {
  it('names the service a field error is about, not its path', () => {
    const e = new ApiError(400, { code: 'VALIDATION_FAILED', message: 'Some fields are not valid', details: { 'services[1].name': 'must have at least 2 letters or digits' } })
    expect(batchMessage(e, ['Haircut', '--'])).toBe('--: the name must have at least 2 letters or digits.')
    expect(batchMessage(new ApiError(409, { code: 'SERVICE_NAME_TAKEN', message: 'Haircut is already a service.' }), [])).toBe('Haircut is already a service.')
  })

  it('checks the backend’s text rule and sends inner spaces once', () => {
    const form = { name: '--', minutes: '30', rupees: '100', from: false, returnDays: '14' }
    expect(checkService(form).name).toMatch(/2 letters or digits/)
    expect(checkService({ ...form, name: 'A.' }).name).toMatch(/2 letters or digits/)
    expect(checkService({ ...form, name: 'Hair  wash' }).name).toBeUndefined()
    expect(serviceIn({ ...form, name: ' Hair  wash ' }).name).toBe('Hair wash')
  })
})

describe('the registration document', () => {
  it('takes a photo or a PDF up to 10 MB', () => {
    expect(docProblem({ type: 'image/jpeg', size: 50 * 1024 * 1024 })).toBeNull()   // made smaller before sending
    expect(docProblem({ type: 'application/pdf', size: MAX_DOC_BYTES })).toBeNull()
    expect(docProblem({ type: 'application/pdf', size: MAX_DOC_BYTES + 1 })).toMatch(/10 MB/)
    expect(docProblem({ type: 'application/msword', size: 10 })).toMatch(/photo or a PDF/)
    // A picker that gives no type: the name decides
    expect(docKind({ type: '', name: 'Licence.PDF' })).toBe('pdf')
    expect(docKind({ type: 'application/octet-stream', name: 'scan.jpg' })).toBe('photo')
    expect(docProblem({ type: '', name: 'notes.docx', size: 10 })).toMatch(/photo or a PDF/)
    expect(docProblem({ type: '', name: 'big.pdf', size: MAX_DOC_BYTES + 1 })).toMatch(/10 MB/)
    expect(docLabel('TRADE_LICENCE')).toBe('Trade licence')
    expect(docLabel(null)).toBeNull()
  })
})

describe('the trade licence check, as the owner sees it', () => {
  const doc = { registrationDocFileId: 'f1', registrationDocType: 'TRADE_LICENCE' as const }

  it('tells none, checking, licensed, expired, not accepted and an old kind apart', () => {
    expect(licenceState({ registrationDocFileId: null })).toBe('NONE')
    expect(licenceState({ ...doc, licenceCheck: 'PENDING' })).toBe('CHECKING')
    expect(licenceState({ ...doc, licenceCheck: null })).toBe('CHECKING')   // an older backend: still waiting
    expect(licenceState({ ...doc, licenceCheck: 'PASSED', licenceValidUntil: '2027-03-31' }, '2027-03-31')).toBe('LICENSED')
    expect(licenceState({ ...doc, licenceCheck: 'PASSED', licenceValidUntil: '2027-03-31' }, '2027-04-01')).toBe('EXPIRED')
    expect(licenceState({ ...doc, licenceCheck: 'FAILED' })).toBe('NOT_ACCEPTED')
    expect(licenceState({ registrationDocFileId: 'f1', registrationDocType: 'UDYAM', licenceCheck: 'FAILED' })).toBe('OLD_KIND')
  })

  it('says each one in a line, and why a licence wasn’t accepted with what to do', () => {
    expect(licenceSummary({ registrationDocFileId: null })).toMatch(/Not added/)
    expect(licenceSummary({ ...doc, licenceCheck: 'PASSED', licenceValidUntil: '2099-03-31' })).toBe('Checked: customers see "Licensed" until 31 Mar 2099')
    expect(licenceReasonText('NAME_MISMATCH')).toMatch(/checked again by itself/)
    expect(licenceReasonText('EXPIRED')).toMatch(/renewed/)
    expect(licenceReasonText(null)).toMatch(/Upload another/)
    expect(shortDate('2027-03-31')).toBe('31 Mar 2027')
  })

  it('has words for every reason the backend gives, and for an address only the field team can change', () => {
    expect(ALL_REASONS).toHaveLength(11)
    for (const r of ALL_REASONS) expect(licenceReasonText(r)).not.toMatch(/^Upload another photo or the PDF of your trade licence\.$/)
    expect(licenceReasonText('ADDRESS_MISMATCH', true)).toMatch(/Request address change/)
    expect(licenceReasonText('ADDRESS_MISMATCH', false)).toMatch(/change it in Salon details/)
    expect(CHECK_AGAIN_REASONS).toEqual(['NAME_MISMATCH', 'ADDRESS_MISMATCH', 'NOT_READ'])
  })

  it('keeps a save’s newer version over a read that started before it', () => {
    const v = (version: number, id = 's1') => ({ id, version }) as Shop
    expect(newestShop(v(3), v(4))).toEqual(v(4))   // the read is older than the save: kept
    expect(newestShop(v(4), v(4))).toEqual(v(4))   // the same version (a licence answer): the fresh one
    expect(newestShop(v(5), v(4))).toEqual(v(5))
    expect(newestShop(v(1, 's2'), v(4))).toEqual(v(1, 's2'))   // another shop now (a hand-over)
    expect(newestShop(null, v(4))).toBeNull()
  })

  it('counts the day in India', () => {
    expect(indiaToday(new Date('2026-11-14T18:29:00Z'))).toBe('2026-11-14')
    expect(indiaToday(new Date('2026-11-14T18:31:00Z'))).toBe('2026-11-15')   // past midnight in India
  })
})
