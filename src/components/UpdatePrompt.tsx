import { reloadToUpdate, useUpdateWaiting } from '../lib/swUpdate'

/** "New version available — Reload", at the top of every screen while a new version waits. */
export function UpdatePrompt() {
  const waiting = useUpdateWaiting()
  if (!waiting) return null
  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-line bg-raised pt-[env(safe-area-inset-top)]">
      <div role="status" className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-2">
        <p className="text-sm">New version available</p>
        <button
          type="button"
          className="min-h-10 rounded-xl bg-brand px-4 font-semibold text-brand-ink"
          onClick={reloadToUpdate}
        >
          Reload
        </button>
      </div>
    </div>
  )
}
