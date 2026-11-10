import { describe, expect, it } from 'vitest'
import type { CatalogService, ServiceItem } from './api/types'
import { ApiError } from './api/errors'
import { checkService, comeBackText, serviceIn } from './features/setup/Services'
import { batchMessage, catalogRows, checkRows, type Row } from './features/shop/RegisterServices'
import { docKind, docLabel, docProblem, MAX_DOC_BYTES } from './features/shop/RegistrationDoc'
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
