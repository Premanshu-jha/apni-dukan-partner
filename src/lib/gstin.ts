/**
 * The backend's GSTIN and Udyam checks (ShopService.gstin / udyam), so a typo shows under the field before Save
 * instead of after it. The backend has the final say.
 */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const UDYAM = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** As the backend stores it: spaces removed, capitals. */
export function compact(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * The 15th character from the first 14 (the government's "Luhn mod 36" rule): one wrong character gives a different
 * answer, so a mistyped GSTIN is caught.
 */
export function gstinCheckChar(gstin: string): string {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(value / 36) + (value % 36)
  }
  return CHARS[(36 - (sum % 36)) % 36]
}

/** True for a GSTIN the backend takes (shape, state code 01–38, 97 or 99, check character). */
export function validGstin(value: string): boolean {
  const v = compact(value)
  if (!GSTIN.test(v)) return false
  const state = Number(v.slice(0, 2))
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99)) return false
  return gstinCheckChar(v) === v[14]
}

/**
 * An Udyam number as the backend wants it: capitals, and spaces between the parts turned into dashes ("udyam ts 02
 * 0012345" → "UDYAM-TS-02-0012345"), since the backend only removes spaces.
 */
export function normUdyam(value: string): string {
  return value.trim().toUpperCase().replace(/\s*-\s*|\s+/g, '-')
}

/** True for an Udyam number the backend takes: UDYAM-XX-00-0000000 (typed with spaces or dashes). */
export function validUdyam(value: string): boolean {
  return UDYAM.test(normUdyam(value))
}
