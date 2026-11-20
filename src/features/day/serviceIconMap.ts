import { useMemo } from 'react'
import { useServices } from '../../api/salon'

/** Each service id's picture as the salon chose it (null: none chosen, the one its name fits is drawn). */
export type ServiceIconMap = ReadonlyMap<string, string | null | undefined>

export const NO_ICONS: ServiceIconMap = new Map()

/**
 * The salon's services' pictures by id, for the booking cards (one map for every card, so memoised cards aren't drawn
 * again). Empty until the services arrive: the cards then draw the picture each name fits.
 */
export function useServiceIcons(): ServiceIconMap {
  const services = useServices()
  return useMemo(
    () => (services.data ? new Map(services.data.map((s) => [s.id, s.icon])) : NO_ICONS),
    [services.data],
  )
}
