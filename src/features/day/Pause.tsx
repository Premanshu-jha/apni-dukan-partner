import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { messageOf } from '../../api/errors'
import { dayApi, salonKeys, usePause } from '../../api/salon'
import { Banner, Button, Chip, Sheet } from '../../components/ui'
import { useT } from '../../i18n'
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
 * Owner or helper. `offer` false: the "Too busy?" link waits (the salon can't take bookings yet); a pause already on
 * is still said, with Resume.
 */
export function PauseControl({ offer = true }: { offer?: boolean }) {
  const t = useT()
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
            <span>{t('day.pausedUntil', { time: dateTimeIst(until!) })}</span>
            <Button variant="secondary" busy={busy} onClick={() => act(dayApi.resume)} className="min-h-10 px-3 text-sm">
              {t('day.resume')}
            </Button>
          </span>
        </Banner>
      ) : offer ? (
        <button type="button" className="self-start text-sm text-muted underline" onClick={() => setOpen(true)}>
          {t('day.pauseLink')}
        </button>
      ) : null}
      {error && !open && <Banner tone="bad">{error}</Banner>}
      <Sheet open={open} title={t('day.pauseTitle')} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('day.pauseExplain')}</p>
          <div className="flex flex-wrap gap-2">
            <Chip selected={choice === 'hour'} onClick={() => setChoice('hour')}>
              {t('day.pauseHour')}
            </Chip>
            <Chip selected={choice === 'today'} onClick={() => setChoice('today')}>
              {t('day.pauseToday')}
            </Chip>
            <Chip selected={choice === 'tomorrow'} onClick={() => setChoice('tomorrow')}>
              {t('day.pauseTomorrow')}
            </Chip>
          </div>
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} onClick={() => act(() => dayApi.pauseUntil(pauseEnd(choice)))}>
            {t('day.pause')}
          </Button>
          {/* "Back", not "Cancel": next to Pause, "Cancel" reads as cancelling the day's bookings */}
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('common.back')}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
