import { inEnglish, language, t } from '../i18n'

/** The service list's names (GET /salon/service-catalog), each with its text key in `service.json`. */
const CATALOG = [
  'haircut', 'beardTrim', 'haircutAndBeard', 'cleanShave', 'kidsHaircut', 'womensHaircut', 'hairWash', 'headMassage',
  'hairColour', 'beardColour', 'hairSpa', 'hairStraightening', 'facial', 'faceCleanup', 'threading', 'waxing',
  'manicure', 'pedicure',
].map((k) => `service.${k}`)

/** Capitals and extra spaces ignored, as the backend compares names ("hair  WASH" is "Hair wash"). */
const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

let byName: Map<string, string> | undefined

/**
 * A service's name as the reader reads it: a name from the service list is spelt in the chosen language's script
 * ("Haircut" → "हेयरकट"); a name the salon typed itself is shown as typed. Names are always saved as the salon gave
 * them, so everyone sees the service in their own language. In English the name shows exactly as saved.
 */
export function serviceName(name: string): string {
  if (language() === 'en') return name
  byName ??= new Map(CATALOG.map((k) => [nameKey(inEnglish(k)), k]))
  const key = byName.get(nameKey(name))
  return key === undefined ? name : t(key)
}
