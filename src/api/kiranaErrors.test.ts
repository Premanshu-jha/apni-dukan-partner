import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LANGUAGES, provideForTests, resetLanguageForTests, setLanguage, type Messages } from '../i18n'
import { ApiError, messageOf } from './errors'

/**
 * The kirana backend's own error codes (in.apnidukan.kirana and the kirana parts of shops, origin/kirana) that the
 * partner app can meet, each with words in every language (error.json). Codes shared with the salon (OWNER_ONLY,
 * NOT_FOUND, NO_SHOP, WRONG_STATUS, VALIDATION_FAILED…) have none: their kirana messages are in server.json, so a
 * salon message the app has no words for still shows as the backend wrote it. Left to the backend's own text, as its
 * message names something its details don't carry: ITEM_IN_LIST and STOCK_OUT_OF_RANGE (which product of the bill),
 * NOT_ACCEPTED_YET and WAITING_FOR_SHOP (another shop's name).
 */
const KIRANA_CODES = [
  'NOT_A_KIRANA', 'PRODUCT_GONE', 'BILL_HAS_RETURNS', 'BILL_CHANGED', 'KHATA_ALREADY_PAID', 'RETURN_REPEATED',
  'BILL_VOIDED', 'BILL_NOT_FOUND', 'PRODUCT_NOT_FOUND', 'PRODUCT_CHANGED', 'PRODUCT_SOLD', 'HAS_BARCODE', 'NOT_MATCHED',
  'TOO_MANY_BARCODES', 'BARCODE_NOT_FOUND', 'BARCODE_TAKEN', 'STOCK_CHANGE_REPEATED', 'UNITS_DIFFER', 'PHOTO_NEEDED',
  'TOO_MANY_PHOTOS_TODAY', 'PRODUCT_REMOVED', 'NAME_TAKEN', 'ALREADY_COUNTED', 'NO_PRODUCTS', 'LINES_TO_CHECK',
  'PAGES_FAILED', 'PHOTOS_NEEDED', 'PRODUCTS_NOT_COUNTED', 'AUTO_COUNTED', 'LINE_ADDED', 'LINE_NOT_FOUND',
  'PURCHASE_DONE', 'UNKNOWN_NOT_FOUND', 'UNKNOWN_DONE', 'TOO_MANY_LINES', 'BILL_ALREADY_ADDED', 'PURCHASE_NOT_ADDED',
  'LINE_NOT_ADDED', 'PURCHASE_CHANGED', 'PURCHASE_NOT_FOUND', 'TOO_MANY_PAGES', 'TOO_MANY_PAGES_TODAY', 'READ_CHANGED',
  'READ_USED', 'READ_NOT_FOUND', 'READ_NOT_READY', 'CATALOGUE_NOT_FOUND', 'KHATA_CHANGED', 'STILL_OWES',
  'MORE_THAN_OWED', 'MORE_THAN_ADVANCE', 'KHATA_ENTRY_NOT_FOUND', 'PAYMENT_REVERSED', 'KHATA_LIMIT',
  'KHATA_CUSTOMER_NOT_FOUND', 'PAYMENT_REPEATED', 'PHONE_TAKEN', 'FSSAI_REQUIRED', 'TOO_LATE', 'CODE_LOCKED',
  'HAS_BARBERS', 'HAS_COUNTER_DATA',
] as const

const root = join(process.cwd(), 'src/i18n')
const file = (lang: string, name: string) =>
  JSON.parse(readFileSync(join(root, lang, `${name}.json`), 'utf8')) as Messages[string]

afterEach(() => resetLanguageForTests())

describe('the kirana backend errors', () => {
  it.each(LANGUAGES.map((l) => l.code))('have words for every kirana code in %s', (lang) => {
    const errors = file(lang, 'error')
    expect(KIRANA_CODES.filter((code) => typeof errors[code] !== 'string' || !(errors[code] as string).trim())).toEqual([])
  })

  it('show the exact message first, then the code\'s words with the details filled in, else the backend\'s text', async () => {
    provideForTests('hi', { error: file('hi', 'error'), server: file('hi', 'server') })
    await setLanguage('hi')
    // A fixed message: its own words (one code, several messages)
    expect(messageOf(new ApiError(409, { code: 'BILL_HAS_RETURNS', message: "Items of this bill were returned already, so its payment can't be changed." })))
      .toBe('इस बिल की कुछ चीज़ें पहले ही वापस हो चुकी हैं, इसलिए इसका पेमेंट बदला नहीं जा सकता।')
    // Built with a name and amounts: the code's words, the amounts from the details in rupees
    const limit = new ApiError(409, {
      code: 'KHATA_LIMIT',
      message: 'Ravi can buy ₹250.50 more on khata (limit ₹2,000). Take payment for their khata first, bill fewer items, or ask the owner to raise the limit.',
      details: { availablePaise: 25050, limitPaise: 200000, balancePaise: 174950 },
    })
    expect(messageOf(limit)).toBe(
      'वे खाते पर ₹250.50 का और सामान ले सकते हैं (लिमिट ₹2,000)। पहले उनके खाते का पेमेंट लें, कम सामान बिल करें, या मालिक से लिमिट बढ़वाएँ।',
    )
    // A shared code's message the app has no words for, and a kirana message naming a product: as the backend wrote it
    expect(messageOf(new ApiError(403, { code: 'OWNER_ONLY', message: 'Only the owner can do something new.' }))).toBe('Only the owner can do something new.')
    expect(messageOf(new ApiError(409, { code: 'ITEM_IN_LIST', message: '"Tata Salt 1 kg" is in your list: scan or pick it, so its price and stock are right.' })))
      .toBe('"Tata Salt 1 kg" is in your list: scan or pick it, so its price and stock are right.')
  })

  it("shows the backend's own words in English (a message built with a name says more than the code's words)", () => {
    const limit = { code: 'KHATA_LIMIT', message: 'Ravi can buy ₹250.50 more on khata (limit ₹2,000). Take payment for their khata first, bill fewer items, or ask the owner to raise the limit.', details: { availablePaise: 25050, limitPaise: 200000 } }
    expect(messageOf(new ApiError(409, limit))).toBe(limit.message)
  })

  it('fills each code\'s blanks from what its errors carry in their details', () => {
    const en = file('en', 'error')
    const blanks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    // The details the backend sends with each code that has blanks (amounts in paise become rupees without "Paise")
    const sent: Record<string, string> = {
      KHATA_ALREADY_PAID: 'advanceAfter', TOO_MANY_PHOTOS_TODAY: 'max', ALREADY_COUNTED: 'name,stock', PAGES_FAILED: 'pages',
      PRODUCTS_NOT_COUNTED: 'uncounted', TOO_MANY_PAGES: 'max', TOO_MANY_PAGES_TODAY: 'max', MORE_THAN_OWED: 'advance',
      MORE_THAN_ADVANCE: 'advance', KHATA_LIMIT: 'available,limit',
    }
    for (const code of KIRANA_CODES) {
      expect([code, blanks(en[code] as string)]).toEqual([code, sent[code] ?? ''])
    }
  })
})
