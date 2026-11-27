import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PhotoNeeded, SetupView } from '../../api/kiranaSetup'
import { setupPollMs } from '../../api/kiranaSetup'
import { askOwnerHref, lineProductName, lineProgress, nextAction, onceRef, pageFailureKey, percent, photoQueue, photoRefusalKey, photosToTake, setupOpen } from './setupSteps'

const view = (over: Partial<SetupView> = {}): SetupView => ({
  readyAt: null, products: 0, uncounted: 0, uncountedProducts: [], linesToCheck: 0, linesAdded: 0, linesSkipped: 0, pagesReading: 0,
  pagesFailed: 0, pagesLeft: 60, pages: [], photosMissing: 0, photosChecking: 0, photosRefused: 0, photosFinding: 0, photosLeftToday: 300,
  nextStep: 'ADD', canFinish: false, youCanFinish: false, beforeApproval: false, ...over,
})

describe('the setup card offers one next step, from the backend’s nextStep', () => {
  it('no products: photograph the list; a page being read: wait; a page that failed: take it again first', () => {
    expect(nextAction(view(), true)).toEqual({ kind: 'photographList', to: '/kirana/setup/list' })
    expect(nextAction(view({ nextStep: 'LIST', pagesReading: 1 }), true).kind).toBe('reading')
    const failed = { readId: 'r 1', pageNo: 1, status: 'FAILED' } as SetupView['pages'][number]
    // The backend says ADD (no products yet) though a page couldn't be read: retaking it comes first
    expect(nextAction(view({ nextStep: 'ADD', pagesFailed: 1, pages: [failed] }), true)).toMatchObject({ kind: 'retakePages', to: '/kirana/setup/list?retake=r%201', pages: 1 })
  })

  it('lines, counts and photos say how many are left; photos being checked are not "to take"', () => {
    expect(nextAction(view({ nextStep: 'LIST', linesToCheck: 37 }), true)).toEqual({ kind: 'checkLines', to: '/kirana/setup/lines', left: 37 })
    expect(nextAction(view({ nextStep: 'COUNT', uncounted: 5 }), true)).toMatchObject({ kind: 'count', left: 5 })
    const v = view({ nextStep: 'PHOTOS', photosMissing: 12, photosChecking: 3, photosFinding: 2 })
    expect(photosToTake(v)).toBe(7)
    expect(nextAction(v, true)).toMatchObject({ kind: 'photos', left: 7 })
    expect(nextAction(view({ nextStep: 'WAIT', photosChecking: 2, photosFinding: 1 }), true)).toMatchObject({ kind: 'wait', checking: 3 })
  })

  it('finishing is the owner’s; a helper is told to ask; done closes the card', () => {
    expect(nextAction(view({ nextStep: 'FINISH' }), true).kind).toBe('finish')
    expect(nextAction(view({ nextStep: 'FINISH' }), false).kind).toBe('askOwner')
    expect(setupOpen(view({ nextStep: 'DONE' }))).toBe(false)
    expect(setupOpen(view({ nextStep: 'PHOTOS', readyAt: '2026-11-27T00:00:00Z', beforeApproval: true }))).toBe(true)
  })
})

describe('progress', () => {
  it('"37 of 412": the line being looked at among all read, and how many are left', () => {
    expect(lineProgress({ linesToCheck: 376, linesAdded: 30, linesSkipped: 6 })).toEqual({ at: 37, total: 412, left: 376, done: 36 })
    expect(lineProgress({ linesToCheck: 0, linesAdded: 3, linesSkipped: 0 })).toEqual({ at: 3, total: 3, left: 0, done: 3 })
    expect(percent(36, 412)).toBe(9)
    expect(percent(0, 0)).toBe(0)
  })
})

describe('polling', () => {
  it('only while something is on its way: a page read every 8 s, photo checks every 20 s, otherwise never', () => {
    expect(setupPollMs(undefined)).toBe(false)
    expect(setupPollMs(view())).toBe(false)
    expect(setupPollMs(view({ pagesReading: 1, photosChecking: 4 }))).toBe(8_000)
    expect(setupPollMs(view({ photosChecking: 1 }))).toBe(20_000)
    expect(setupPollMs(view({ photosFinding: 1 }))).toBe(20_000)
  })
  it('backs off the longer it waits, then stops (AB#2: a photo can stay "checking" for hours)', () => {
    const v = view({ photosChecking: 1 })
    expect(setupPollMs(v, 60_000)).toBe(20_000)
    expect(setupPollMs(v, 3 * 60_000)).toBe(60_000)
    expect(setupPollMs(v, 15 * 60_000)).toBe(300_000)
    expect(setupPollMs(v, 31 * 60_000)).toBe(false)
    expect(setupPollMs(view({ pagesReading: 1 }), 9 * 60_000)).toBe(60_000)
  })
})

describe('a line as a new product', () => {
  it('is named brand, name and size as read (as the backend names it), else the wording', () => {
    expect(lineProductName({ wording: 'tata namak 1kg', brand: 'Tata', name: 'Salt', size: '1 kg' })).toBe('Tata Salt 1 kg')
    expect(lineProductName({ wording: 'x', brand: 'Amul', name: 'Amul Taaza', size: '500 ml' })).toBe('Amul Taaza 500 ml')
    expect(lineProductName({ wording: 'Toor dal loose', brand: null, name: null, size: null })).toBe('Toor dal loose')
  })
})

describe('photos one at a time', () => {
  const p = (productId: string, over: Partial<PhotoNeeded> = {}): PhotoNeeded => ({
    productId, name: productId, loose: false, sizeToShow: null, photoCheck: null, code: null, reason: null, seen: null, newPhotoUrl: null, findingPicture: false, ...over,
  })
  it('to take or retake first, pictures still being looked for last, never one being checked, sent or skipped', () => {
    const q = photoQueue([p('a', { findingPicture: true }), p('b', { photoCheck: 'CHECKING' }), p('c', { photoCheck: 'REFUSED' }), p('d'), p('e')], new Set(['e']), new Set(['d']))
    expect(q.map((x) => x.productId)).toEqual(['c', 'a'])
  })
})

describe('codes in plain words', () => {
  const setup = JSON.parse(readFileSync(join(process.cwd(), 'src/i18n/en/kiranaSetup.json'), 'utf8')) as Record<string, unknown>
  it('every page failure and photo refusal the backend has gets the app’s own words; an unknown one the backend’s', () => {
    for (const code of ['NOT_A_LIST', 'LIST_UNREADABLE', 'CANT_OPEN', 'TOO_LARGE', 'FILE_PASSWORD', 'FILE_CANT_OPEN', 'TOO_LONG', 'TRY_LATER', 'READING_OFF', 'PHOTO_UNREADABLE']) {
      expect(setup[pageFailureKey(code)!.slice('kiranaSetup.'.length)], code).toBeTruthy()
    }
    for (const code of ['NOT_GOODS', 'PEOPLE', 'MANY', 'BLURRY', 'OTHER_PRODUCT', 'NOT_FRONT', 'NEED_SIZE', 'SIZE_UNREADABLE', 'WRONG_SIZE']) {
      expect(setup[photoRefusalKey(code)!.slice('kiranaSetup.'.length)], code).toBeTruthy()
    }
    expect(pageFailureKey('OTHER')).toBeNull()
    expect(photoRefusalKey('SOMETHING_NEW')).toBeNull()
  })
})

describe('sending once', () => {
  afterEach(() => sessionStorage.clear())
  it('the same id until the answer came (a retry after a lost answer is the same send), a new one after', () => {
    const a = onceRef('page.f1')
    expect(onceRef('page.f1').ref).toBe(a.ref)
    expect(onceRef('page.f2').ref).not.toBe(a.ref)
    a.forget()
    expect(onceRef('page.f1').ref).not.toBe(a.ref)
  })
  it('asks the owner on WhatsApp with the message typed in, and no number (the helper picks the owner)', () => {
    expect(askOwnerHref('Bill 12: please cancel it')).toBe('https://wa.me/?text=Bill%2012%3A%20please%20cancel%20it')
  })
})
