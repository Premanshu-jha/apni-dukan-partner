import { ApiError } from '../../api/errors'
import type { GeocodeIn, GeocodePrecision } from '../../api/types'

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

/** For tests only. */
export function resetAddressSearch(): void {
  searchOff = false
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
