import { describe, expect, it } from 'vitest'
import { compact, gstinCheckChar, normUdyam, validGstin, validUdyam } from './gstin'

describe('GSTIN and Udyam checks (as the backend)', () => {
  it('takes a real GSTIN, with spaces or small letters too', () => {
    expect(gstinCheckChar('27AAPFU0939F1ZV')).toBe('V')
    expect(validGstin('27AAPFU0939F1ZV')).toBe(true)
    expect(validGstin(' 27aapfu0939f1zv ')).toBe(true)
    expect(compact('27 aapfu 0939f1zv')).toBe('27AAPFU0939F1ZV')
  })

  it('catches one mistyped character, a wrong state code and a wrong shape', () => {
    expect(validGstin('27AAPFU0939F1ZW')).toBe(false)   // check character
    expect(validGstin('27AAPFU0938F1ZV')).toBe(false)   // a digit typed wrong
    expect(validGstin('45AAPFU0939F1ZV')).toBe(false)   // no such state
    expect(validGstin('27AAPFU0939F1Z')).toBe(false)    // 14 characters
  })

  it('takes an Udyam number in the official shape only', () => {
    expect(validUdyam('UDYAM-TS-02-0012345')).toBe(true)
    expect(validUdyam('udyam-ts-02-0012345')).toBe(true)
    expect(validUdyam('UDYAM TS 02 0012345')).toBe(true)   // spaces for dashes
    expect(normUdyam(' udyam - ts-02 0012345')).toBe('UDYAM-TS-02-0012345')
    expect(validUdyam('UDYAM-TS-2-0012345')).toBe(false)
    expect(validUdyam('TS-02-0012345')).toBe(false)
  })
})
