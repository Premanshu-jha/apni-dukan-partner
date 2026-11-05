/**
 * The same rule as the backend's PhoneNumbers.normalize: "+91 98480 12345" or "098480-12345" becomes
 * "9848012345". Returns null when it is not a 10-digit Indian mobile number.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

/** "98480 12345" for showing a stored 10-digit number. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone
}

/** A light check before sending; the backend has the final say. */
export function looksLikeEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
}
