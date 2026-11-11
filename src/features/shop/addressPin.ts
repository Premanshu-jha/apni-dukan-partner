import { ApiError } from '../../api/errors'
import type { Described, GeocodeIn, GeocodePrecision } from '../../api/types'

/**
 * "Find my salon on the map" (registration step 1): the typed address becomes a pin through POST /shops/geocode,
 * and the owner drags it onto the door. The phone's GPS stays the other way.
 */

/** The fields the address search sends; editing one after a search makes its pin out of date. */
export const ADDRESS_FIELDS = ['addressLine', 'area', 'city', 'pincode'] as const

/** How close the map starts: the building, the street, or the whole area. GPS points use 18. */
export function zoomFor(p: GeocodePrecision): number {
  return p === 'EXACT' ? 18 : p === 'STREET' ? 17 : 15
}

/** The address fields the search needs, as the backend checks them (the same limits as registering). */
export function canSearchAddress(f: GeocodeIn): boolean {
  const len = (v: string, min: number, max: number) => v.trim().length >= min && v.trim().length <= max
  return len(f.addressLine, 5, 200) && len(f.area, 2, 100) && len(f.city, 2, 60) && /^[1-9]\d{5}$/.test(f.pincode.trim())
}

/** What to tell the owner about a pin from the address. */
export function precisionHint(p: GeocodePrecision): string {
  return p === 'EXACT' ? 'Check the pin is on your door.' : "This is only close by. Drag the pin onto your salon's door."
}

/**
 * Turned off on the backend (no Google key): hide the button for the rest of this visit. Module-level, so a reload
 * asks again (the key may have been added meanwhile).
 */
let searchOff = false

export function addressSearchOff(): boolean {
  return searchOff
}

/** The backend said address search is off: remember it for the visit. */
export function markAddressSearchOff(): void {
  searchOff = true
}

/** For tests only. */
export function resetAddressSearch(): void {
  searchOff = false
}

/**
 * When a wait of `seconds` from now ends, in India time: "11:15 PM", or "tomorrow, 9:00 AM" when it ends on another
 * day. The day's address searches run in a 24-hour window from the first one, not until midnight.
 */
export function waitEndsText(seconds: number, now: Date = new Date()): string {
  const end = new Date(now.getTime() + seconds * 1000)
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const time = end.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
  return day(end) === day(now) ? time : `tomorrow, ${time}`
}

/** What a failed search means for the screen: hide the button, or the words to show. */
export function searchFailure(e: unknown): { hide: true } | { hide: false; text: string } {
  const code = e instanceof ApiError ? e.code : 'UNKNOWN'
  if (code === 'GEOCODING_OFF') {
    searchOff = true
    return { hide: true }
  }
  if (code === 'ADDRESS_NOT_FOUND') {
    return { hide: false, text: "Couldn't find that address. Check the pincode and area, or use your location." }
  }
  if (code === 'TRY_LATER' && e instanceof ApiError) {
    const minutes = Math.max(1, Math.ceil((e.retryAfterSeconds ?? 60) / 60))
    // The day's lookups (10 a person, in 24 hours from the first) are used up: say when they come back
    if (minutes > 60) {
      return {
        hide: false,
        text: `You've used your searches for new addresses for now. Try again after ${waitEndsText(e.retryAfterSeconds ?? 0)}, or use your location.`,
      }
    }
    return {
      hide: false,
      text: `Many address searches in a short time. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, or use your location.`,
    }
  }
  if (code === 'VALIDATION_FAILED') {
    return { hide: false, text: 'Check the address, area, city and pincode above, then try again.' }
  }
  // GEOCODING_UNAVAILABLE, SERVICE_BUSY, offline, anything else
  return { hide: false, text: "Address search isn't working right now. Use your location, or try again later." }
}

/**
 * After "Use my location": the address at the GPS point fills only the fields still empty (never what the owner
 * typed, even if they typed it while the answer was on its way). Returns the same object when nothing changes.
 */
export function fillEmpty<F extends GeocodeIn>(form: F, at: Described): F {
  let next = form
  for (const k of ADDRESS_FIELDS) {
    const value = (at[k] ?? '').trim()
    if (k === 'pincode' && !/^[1-9]\d{5}$/.test(value)) continue
    if (!form[k].trim() && value) next = { ...next, [k]: value }
  }
  return next
}

export const FILLED_TEXT = "We filled the address from your location. Check it and correct anything that's wrong."
