import { useEffect, useState } from 'react'
import { currentSubscription, needsHomeScreen, pushSupported, turnOffPush, turnOnPush, type PushResult } from '../../api/push'
import { messageOf } from '../../api/errors'
import { Banner, Button, Card } from '../../components/ui'
import { storage } from '../../lib/storage'
import { t, useT } from '../../i18n'

/** "Not now" on the day board's card; the setup card's Skip sets it too (one answer, never asked twice). */
export const DISMISSED = 'adp.pushPromptDismissed'

/** Whether this phone gets booking notifications (null while checking). Also the setup card's step. */
export function useSubscribed() {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    void currentSubscription().then((s) => setOn(Boolean(s)))
  }, [])
  return [on, setOn] as const
}

export function resultText(r: PushResult): string | null {
  if (r === 'denied') return t('profile.pushDenied')
  if (r === 'unsupported') return t('profile.pushUnsupported')
  if (r === 'not-configured') return t('profile.pushNotConfigured')
  return null
}

/** On the day board until answered: one card offering a notification for each new booking. */
export function NotificationsPrompt() {
  const t = useT()
  const [on, setOn] = useSubscribed()
  const [dismissed, setDismissed] = useState(storage.get(DISMISSED) === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!pushSupported() || on !== false || dismissed) return null
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-semibold">{t('profile.pushPromptTitle')}</p>
      <p className="text-sm text-muted">{t('profile.pushPromptBody')}</p>
      {error && <Banner tone="warn">{error}</Banner>}
      <div className="flex gap-2">
        <Button
          busy={busy}
          className="flex-1"
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              const r = await turnOnPush()
              if (r === 'on') setOn(true)
              else setError(resultText(r))
            } catch (e) {
              setError(messageOf(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('profile.turnOn')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            storage.set(DISMISSED, '1')
            setDismissed(true)
          }}
        >
          {t('profile.notNow')}
        </Button>
      </div>
    </Card>
  )
}

/** The switch on the profile screen. */
export function NotificationsRow() {
  const t = useT()
  const [on, setOn] = useSubscribed()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!pushSupported()) {
    return (
      <p className="text-sm text-muted">
        {needsHomeScreen()
          ? t('profile.pushIphoneHint')
          : t('profile.pushCantShow')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{t('profile.bookingNotifications')}</p>
          <p className="text-sm text-muted">{t('profile.bookingNotificationsBody')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(on)}
          aria-label={t('profile.bookingNotifications')}
          disabled={busy || on === null}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              if (on) {
                await turnOffPush()
                setOn(false)
              } else {
                const r = await turnOnPush()
                if (r === 'on') setOn(true)
                else setError(resultText(r))
              }
            } catch (e) {
              setError(messageOf(e))
            } finally {
              setBusy(false)
            }
          }}
          className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? 'bg-brand' : 'bg-line'} disabled:opacity-50`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-ink transition ${on ? 'left-7' : 'left-1'}`} />
        </button>
      </div>
      {error && <Banner tone="warn">{error}</Banner>}
    </div>
  )
}
