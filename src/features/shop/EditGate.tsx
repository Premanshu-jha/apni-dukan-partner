import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { authApi, type EditUnlock } from '../../api/auth'
import { EDIT_LOCKED_EVENT } from '../../api/client'
import { messageOf } from '../../api/errors'
import { useShop } from '../../api/shop'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Sheet } from '../../components/ui'
import { timeIst } from '../../lib/ist'
import { formatPhone } from '../../lib/phone'
import { useSession } from '../../store/session'

export const editKeys = { unlock: ['auth', 'edit-unlock'] as const }

/** Resending a code is offered after this long (the backend allows 3 codes in 10 minutes). */
const RESEND_AFTER_MS = 30_000

/** The unlock as this phone counts it: from the seconds the backend said were left, not from the phone's clock. */
interface Unlock {
  /** When it ends, on this phone's clock (ms); 0 when off. */
  end: number
}

function counted(u: EditUnlock, at = Date.now()): Unlock {
  if (!u.until) return { end: 0 }
  // An older backend sends no secondsLeft: then the phone's clock it is
  const left = typeof u.secondsLeft === 'number' ? u.secondsLeft * 1000 : Date.parse(u.until) - at
  return { end: left > 0 ? at + left : 0 }
}

/**
 * Around the screens that change a verified salon's details (Salon details, Photos and video, Registration document,
 * Request address change) or end it (Close, Hand over). The backend takes those changes only within 15 minutes of a code sent to the owner's own
 * phone, on that device only (403 EDIT_LOCKED otherwise), so a phone left signed in can't be used to change them. Everything can be read
 * and typed as usual; a bar on top says so, with Start editing (the code sheet; it also opens by itself when More's
 * Edit was tapped, or when a save was refused because the time ran out). One code turns every edit on for 15
 * minutes: the bar then counts down, with Done. Closing the sheet only closes it: what was typed stays, and Save works
 * after the code. A salon still registering (a draft) asks for nothing.
 */
export function EditGate({ children, ending = false }: { children: ReactNode; ending?: boolean }) {
  const shop = useShop()
  const needed = Boolean(shop.addressLocked) && shop.status !== 'DRAFT'
  const qc = useQueryClient()
  const location = useLocation()
  const unlock = useQuery({
    queryKey: editKeys.unlock,
    queryFn: async () => counted(await authApi.editUnlock()),
    enabled: needed,
  })
  const [asking, setAsking] = useState(() => Boolean((location.state as { edit?: boolean } | null)?.edit))
  const [now, setNow] = useState(() => Date.now())
  const end = unlock.data?.end ?? 0
  const on = end > now

  // The bar's minutes, and the bar turning back by itself when the time is up
  useEffect(() => {
    if (!needed || !end) return
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    const done = window.setTimeout(() => setNow(Date.now()), Math.max(0, end - Date.now()) + 100)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(done)
    }
  }, [needed, end])

  // Already on (More's Edit tapped while on): nothing to ask; Done or the time running out don't open the sheet
  useEffect(() => {
    if (on && asking) setAsking(false)
  }, [on, asking])

  // A save refused because the time ran out (another phone said Done): ask for a code over what was typed
  useEffect(() => {
    const locked = () => {
      qc.setQueryData<Unlock>(editKeys.unlock, { end: 0 })
      setAsking(true)
    }
    window.addEventListener(EDIT_LOCKED_EVENT, locked)
    return () => window.removeEventListener(EDIT_LOCKED_EVENT, locked)
  }, [qc])

  if (!needed) return <>{children}</>

  async function done() {
    qc.setQueryData<Unlock>(editKeys.unlock, { end: 0 })
    try {
      await authApi.lockEditing()
    } catch {
      // Off here anyway; it also ends by itself within 15 minutes
    }
  }

  const minutes = on ? Math.max(1, Math.ceil((end - now) / 60_000)) : 0
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-raised px-4 py-2 text-sm" role="status">
        {on ? (
          <>
            <span>
              {ending ? 'Confirmed' : 'Editing is on'} until {timeIst(new Date(end).toISOString())} ({minutes} min left)
            </span>
            <button type="button" className="shrink-0 text-link underline" onClick={done}>
              Done
            </button>
          </>
        ) : (
          <>
            <span>
              {ending
                ? 'Your salon is verified: this needs a code we send to your phone.'
                : 'Your salon is verified: changes need a code we send to your phone.'}
            </span>
            <button type="button" className="shrink-0 text-link underline" onClick={() => setAsking(true)}>
              {ending ? 'Get the code' : 'Start editing'}
            </button>
          </>
        )}
      </div>
      {children}
      <UnlockSheet
        ending={ending}
        open={asking && !on && !unlock.isPending}
        loadError={unlock.isError ? unlock.error : null}
        onUnlocked={(u) => {
          qc.setQueryData(editKeys.unlock, counted(u))
          setNow(Date.now())
          setAsking(false)
        }}
        onClose={() => setAsking(false)}
      />
    </>
  )
}

function UnlockSheet({
  ending,
  open,
  loadError,
  onUnlocked,
  onClose,
}: {
  /** Closing or handing over, not editing: the words say so */
  ending: boolean
  open: boolean
  loadError: unknown
  onUnlocked: (u: EditUnlock) => void
  onClose: () => void
}) {
  const phone = useSession((s) => s.user?.phone)
  // Kept while the sheet is closed: a code already sent can still be typed when it opens again
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)

  // "Send again" becomes available after a while
  useEffect(() => {
    if (sentAt === null) return
    const id = window.setTimeout(() => tick((n) => n + 1), Math.max(0, sentAt + RESEND_AFTER_MS - Date.now()) + 50)
    return () => window.clearTimeout(id)
  }, [sentAt])

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await authApi.sendEditCode()
      setSentAt(Date.now())   // a code typed meanwhile (the SMS can be quicker than this answer) stays
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function check() {
    setBusy(true)
    setError(null)
    try {
      const u = await authApi.unlockEditing(code)
      setSentAt(null)
      setCode('')
      onUnlocked(u)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const wait = sentAt === null ? 0 : Math.max(0, Math.ceil((sentAt + RESEND_AFTER_MS - Date.now()) / 1000))
  return (
    <Sheet open={open} title="Confirm it's you" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-muted">
          Your salon is verified, so we check it's you first. One code to +91 {formatPhone(phone ?? null)}{' '}
          {ending ? 'confirms it on this phone for 15 minutes.' : 'lets you change everything on this phone for 15 minutes.'}
        </p>
        {loadError !== null && <Banner tone="warn">{messageOf(loadError)}</Banner>}
        <Button variant={sentAt === null ? 'primary' : 'secondary'} busy={busy && code.length !== 6} disabled={wait > 0} onClick={send}>
          {sentAt === null ? 'Send code' : wait > 0 ? 'Sent. You can send again after 30 seconds' : 'Send the code again'}
        </Button>
        <CodeInput id="edit-code" label="SMS code" value={code} onChange={setCode} autoFocus={sentAt !== null} />
        <Button busy={busy && code.length === 6} disabled={code.length !== 6} onClick={check}>
          {ending ? 'Confirm' : 'Start editing'}
        </Button>
        {error && <Banner tone="bad">{error}</Banner>}
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
      </div>
    </Sheet>
  )
}
