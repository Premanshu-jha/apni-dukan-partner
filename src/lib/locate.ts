export interface Fix {
  lat: number
  lng: number
  /** Metres, as the phone reported it. */
  accuracy: number
}

export type LocateError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

/** Worse than this and the pin is probably off (a laptop guessing from its internet connection). */
export const ROUGH_METRES = 150

/** The phone's GPS position, once, with high accuracy (the salon's pin is taken while standing in the salon). */
export function locateOnce(): Promise<Fix> {
  return new Promise((resolve, reject: (e: LocateError) => void) => {
    if (!('geolocation' in navigator)) {
      reject('unsupported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => reject(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    )
  })
}

/** 'denied' when the browser already says no, so the guide can show without asking again. */
export async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state
  } catch {
    return 'unknown'
  }
}

/** The backend takes India only: latitude 6–37.6, longitude 68–97.5. */
export function insideIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5
}

/** Six decimals (about 10 cm) is all the backend keeps. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/** Metres between two points (haversine), to tell the owner how far they moved the pin. */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * r * Math.asin(Math.sqrt(h)))
}
