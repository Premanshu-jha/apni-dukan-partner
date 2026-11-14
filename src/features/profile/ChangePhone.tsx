import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi, type PhoneChangeSent } from '../../api/auth'
import { refreshSession, replacingSession } from '../../api/client'
import { isApiError, messageOf } from '../../api/errors'
import { claimSubscription } from '../../api/push'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Field, Page } from '../../components/ui'
import { goBack } from '../../lib/nav'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { flashPhoneChanged, rememberPhoneMove, takePhoneMove } from '../../lib/phoneMoved'
import { useSession } from '../../store/session'

/**
 * Changing the mobile number while signed in: 1) the new number, 2) the code sent to it, and a second code (to the
 * verified email, or without one to the number the account has now: the backend says which). The same account moves
 * to the new number (its shop, bookings and history stay); every other device is signed out and this one carries on.
 */
export function ChangePhone() {
  const navigate = useNavigate()
  const user = useSession((s) => s.user)!
  const [step, setStep] = useState<'number' | 'codes'>('number')
  const [input, setInput] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [second, setSecond] = useState<PhoneChangeSent | null>(null)
  const [phoneCode, setPhoneCode] = useState('')
  const [secondCode, setSecondCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  const newPhone = normalizePhone(input)
  const same = newPhone !== null && newPhone === user.phone

  // Each failure moves the focus to its message, once React has drawn it (a next-frame focus could run before the
  // message existed, and the focus was lost)
  const [failures, setFailures] = useState(0)
  useEffect(() => {
    if (failures > 0) errorRef.current?.focus()
  }, [failures])

  function fail(text: string) {
    setError(text)
    setFailures((n) => n + 1)
  }

  async function send() {
    if (!newPhone || same) return
    setBusy(true)
    setError(null)
    try {
      const sent = await authApi.sendPhoneChangeCode(newPhone)
      setSentTo(newPhone)
      setSecond(sent)
      setPhoneCode('')
      setSecondCode('')
      setStep('codes')
    } catch (e) {
      fail(isApiError(e, 'PHONE_IN_USE') ? 'This number already has its own Clozest account. Use another number.' : messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function change() {
    if (!sentTo) return
    setBusy(true)
    setError(null)
    try {
      const tokens = await replacingSession(() => authApi.changePhone(sentTo, phoneCode, secondCode))
      // The backend forgot this device's notification address with every other: give it again
      void claimSubscription()
      flashPhoneChanged(tokens.user.phone ?? sentTo)
      goBack(navigate, '/more')
    } catch (e) {
      if (isApiError(e) && (e.status === 0 || e.status >= 500)) {
        // The answer was lost: if the change went through, every old token has ended. Ask the backend which
        rememberPhoneMove(sentTo)
        const stillIn = await refreshSession()
        if (useSession.getState().status !== 'signedIn') return   // ended: sign-in says the number may have moved
        if (stillIn) {
          // The old tokens still work: the change didn't go through
          takePhoneMove()
          fail("Couldn't change your number (no answer). Your number is still the same. Try again.")
        } else {
          // No answer at all (offline): not known yet; if it went through, sign-in will say so
          fail("No answer from Clozest, so we can't tell yet whether your number changed. Check your connection, then open this screen again.")
        }
      } else if (isApiError(e, 'SEND_CODES_AGAIN')) {
        fail(`${messageOf(e)} Tap "Send the codes again".`)
      } else if (isApiError(e, 'PHONE_IN_USE')) {
        fail('This number got its own Clozest account meanwhile. Use another number.')
        setStep('number')
      } else if (isApiError(e, 'WRONG_CODE')) {
        const left = Number(e.details.attemptsLeft)
        fail(Number.isFinite(left) ? `One of the codes isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : messageOf(e))
      } else if (isApiError(e, 'CODE_EXPIRED') || isApiError(e, 'TOO_MANY_ATTEMPTS')) {
        fail(`${messageOf(e)} Tap "Send the codes again".`)
      } else {
        fail(messageOf(e))
      }
    } finally {
      setBusy(false)
    }
  }

  const secondLabel = second?.secondCodeTo === 'EMAIL' ? `Code sent to your email (${second.sentTo})` : `Code sent to your current number (${second?.sentTo ?? ''})`
  return (
    <Page back="/more" title="Change mobile number">
      <p className="text-muted">
        Now: <span className="text-ink">+91 {formatPhone(user.phone)}</span>
      </p>
      {step === 'number' ? (
        <div className="flex flex-col gap-4">
          <Field
            id="new-phone"
            label="New mobile number"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98480 12345"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            error={same ? 'This is already your number.' : undefined}
            hint="Your shop, bookings and history stay with your account. Other devices will be signed out."
          />
          {error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <Banner tone="bad">{error}</Banner>
            </div>
          )}
          <Button busy={busy} disabled={!newPhone || same} onClick={send}>
            Send codes
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            We sent a code to <span className="text-ink">+91 {formatPhone(sentTo)}</span> and one to{' '}
            <span className="text-ink">{second?.secondCodeTo === 'EMAIL' ? second.sentTo : `your current number (${second?.sentTo})`}</span>.
          </p>
          <CodeInput id="new-phone-code" label="Code sent to the new number" value={phoneCode} onChange={setPhoneCode} />
          <CodeInput id="phone-change-second-code" label={secondLabel} value={secondCode} onChange={setSecondCode} autoFocus={false} />
          {error && (
            <div ref={errorRef} tabIndex={-1} className="outline-none">
              <Banner tone="bad">{error}</Banner>
            </div>
          )}
          <Button busy={busy} disabled={phoneCode.length !== 6 || secondCode.length !== 6} onClick={change}>
            Change number
          </Button>
          <Button variant="ghost" disabled={busy} onClick={send}>
            Send the codes again
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setStep('number')
              setError(null)
            }}
          >
            Use a different number
          </Button>
        </div>
      )}
    </Page>
  )
}
