import { useEffect, useState } from 'react'
import { currentSubscription, needsHomeScreen, pushSupported, turnOffPush, turnOnPush, type PushResult } from '../../api/push'
import { messageOf } from '../../api/errors'
import { Banner, Button, Card } from '../../components/ui'
import { storage } from '../../lib/storage'

const DISMISSED = 'adp.pushPromptDismissed'

function useSubscribed() {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    void currentSubscription().then((s) => setOn(Boolean(s)))
  }, [])
  return [on, setOn] as const
}

function resultText(r: PushResult): string | null {
  if (r === 'denied') return 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
  if (r === 'unsupported') return "This browser can't show notifications. On iPhone, add Clozest Partner to your Home Screen first."
  if (r === 'not-configured') return "Notifications aren't set up on the server yet."
  return null
}

/** On the day board until answered: one card offering a notification for each new booking. */
export function NotificationsPrompt() {
  const [on, setOn] = useSubscribed()
  const [dismissed, setDismissed] = useState(storage.get(DISMISSED) === '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!pushSupported() || on !== false || dismissed) return null
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-semibold">Know the moment someone books?</p>
      <p className="text-sm text-muted">We'll notify this phone about new bookings, changes and cancellations.</p>
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
          Turn on
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            storage.set(DISMISSED, '1')
            setDismissed(true)
          }}
        >
          Not now
        </Button>
      </div>
    </Card>
  )
}

/** The switch on the profile screen. */
export function NotificationsRow() {
  const [on, setOn] = useSubscribed()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!pushSupported()) {
    return (
      <p className="text-sm text-muted">
        {needsHomeScreen()
          ? 'To get booking notifications on iPhone, tap Share, then "Add to Home Screen", and open Clozest Partner from there.'
          : "This browser can't show notifications. You'll still see every message under the bell."}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Booking notifications</p>
          <p className="text-sm text-muted">New bookings, changes and cancellations, on this device</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(on)}
          aria-label="Booking notifications"
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
