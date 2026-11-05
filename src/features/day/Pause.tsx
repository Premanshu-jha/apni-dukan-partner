import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { messageOf } from '../../api/errors'
import { dayApi, salonKeys, usePause } from '../../api/salon'
import { Banner, Button, Chip, Sheet } from '../../components/ui'
import { addDays, dateTimeIst, istInstant, todayIst } from '../../lib/ist'
import { useNow } from '../../lib/useNow'

type Choice = 'today' | 'hour' | 'tomorrow'

/** When each choice ends: the end of today (the backend's default), an hour from now, or the end of tomorrow. */
export function pauseEnd(choice: Choice, now = new Date()): string | null {
  if (choice === 'today') return null
  if (choice === 'hour') return new Date(now.getTime() + 3600_000).toISOString()
  return istInstant(addDays(todayIst(now), 2), '00:00')
}

/**
 * Pausing stops new online bookings for a while (a rush, a power cut); bookings already made and walk-ins carry on.
 * Owner or helper.
 */
export function PauseControl() {
  const qc = useQueryClient()
  const pause = usePause()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<Choice>('today')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const until = pause.data?.pausedUntil
  // Ticks, so the banner goes away by itself when the pause ends
  const now = useNow()
  const paused = Boolean(until && new Date(until).getTime() > now)

  async function act(call: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(salonKeys.pause, await call())
      setOpen(false)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  if (pause.isPending || pause.isError) return null
  return (
    <>
      {paused ? (
        <Banner tone="warn">
          <span className="flex items-center justify-between gap-3">
            <span>Online bookings paused until {dateTimeIst(until!)}.</span>
            <Button variant="secondary" busy={busy} onClick={() => act(dayApi.resume)} className="min-h-10 px-3 text-sm">
              Resume
            </Button>
          </span>
        </Banner>
      ) : (
        <button type="button" className="self-start text-sm text-muted underline" onClick={() => setOpen(true)}>
          Too busy? Pause online bookings
        </button>
      )}
      {error && !open && <Banner tone="bad">{error}</Banner>}
      <Sheet open={open} title="Pause online bookings" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Customers can't book until then. Bookings already made and walk-ins carry on.</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={choice === 'hour'} onClick={() => setChoice('hour')}>
              For 1 hour
            </Chip>
            <Chip selected={choice === 'today'} onClick={() => setChoice('today')}>
              Rest of today
            </Chip>
            <Chip selected={choice === 'tomorrow'} onClick={() => setChoice('tomorrow')}>
              Till end of tomorrow
            </Chip>
          </div>
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} onClick={() => act(() => dayApi.pauseUntil(pauseEnd(choice)))}>
            Pause
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  )
}
