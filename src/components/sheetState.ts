import { createContext } from 'react'

/** What a sheet tells its Help: whether a field was changed since it opened, and whether something is on its way. */
export interface SheetState {
  typed: () => boolean
  busy: () => boolean
}
export const SheetContext = createContext<SheetState | null>(null)
