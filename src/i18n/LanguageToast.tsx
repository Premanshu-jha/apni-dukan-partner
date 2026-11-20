import { useEffect, useSyncExternalStore } from 'react'
import { useT } from './index'

/** How long the confirmation stays. */
const SHOWN_MS = 5000

let shownAt = 0
const listeners = new Set<() => void>()

/**
 * Says, in the language just chosen, that it changed and where to change it again (More → Language, in its own
 * words): someone who tapped a script by mistake can find the way back.
 */
export function announceLanguageChosen(): void {
  shownAt = Date.now()
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The confirmation, at the bottom of the screen above the tabs; once on every screen (mounted at the app's root). */
export function LanguageToast() {
  const t = useT()
  const at = useSyncExternalStore(subscribe, () => shownAt, () => 0)
  const open = at > 0 && Date.now() - at < SHOWN_MS
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      shownAt = 0
      listeners.forEach((l) => l())
    }, SHOWN_MS - (Date.now() - at))
    return () => clearTimeout(timer)
  }, [open, at])
  if (!open) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4">
      <p role="status" className="max-w-md rounded-xl border border-line bg-raised px-4 py-2 text-sm shadow-lg">
        {t('language.changedToast')}
      </p>
    </div>
  )
}
