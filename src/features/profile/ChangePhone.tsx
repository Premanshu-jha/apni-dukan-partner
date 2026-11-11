import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { replacingSession } from '../../api/client'
import { isApiError, messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Field, Page } from '../../components/ui'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { useSession } from '../../store/session'

/** Answers about the email code: the person stays on the codes step, with the email box in error. */
const EMAIL_CODE_ERRORS = new Set(['EMAIL_CODE_REQUIRED'])

/**
 * Changing the mobile number while signed in: 1) the new number, 2) the code sent to it, and the code sent to the
 * verified email (if there is one). The same account moves to the new number (its shop, bookings and history
 * stay); every other device is signed out and this one carries on.
 */
export function ChangePhone() {
  const navigate = useNavigate()
  const user = useSession((s) => s.user)!
  const [step, setStep] = useState<'number' | 'codes'>('number')
  const [input, setInput] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  /** Whether an email code was sent (the account had a verified email when the codes went out). */
  const [emailToo, setEmailToo] = useState(false)
  const [phoneCode, setPhoneCode] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const newPhone = normalizePhone(input)
  const same = newPhone !== null && newPhone === user.phone

  async function send() {
    if (!newPhone || same) return
    setBusy(true)
    setError(null)
    try {
      await authApi.sendPhoneChangeCode(newPhone)
      setSentTo(newPhone)
      setEmailToo(user.emailVerified)
      setPhoneCode('')
      setEmailCode('')
      setStep('codes')
    } catch (e) {
      setError(isApiError(e, 'PHONE_IN_USE') ? 'This number already has its own Clozest account. Use another number.' : messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function change() {
    if (!sentTo) return
    setBusy(true)
    setError(null)
    try {
      const tokens = await replacingSession(() => authApi.changePhone(sentTo, phoneCode, emailToo ? emailCode : null))
      navigate('/more', { replace: true, state: { phoneChanged: tokens.user.phone } })
    } catch (e) {
      if (isApiError(e) && EMAIL_CODE_ERRORS.has(e.code)) {
        // The email was verified on another device meanwhile: a code went there too
        setEmailToo(true)
        setError('Enter the code we emailed you too.')
      } else if (isApiError(e, 'PHONE_IN_USE')) {
        setError('This number got its own Clozest account meanwhile. Use another number.')
        setStep('number')
      } else if (isApiError(e, 'CODE_EXPIRED') || isApiError(e, 'TOO_MANY_ATTEMPTS')) {
        setError(`${messageOf(e)} Tap "Send the codes again".`)
      } else {
        setError(messageOf(e))
      }
    } finally {
      setBusy(false)
    }
  }

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
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} disabled={!newPhone || same} onClick={send}>
            {user.emailVerified ? 'Send codes' : 'Send code'}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            We sent a code to <span className="text-ink">+91 {formatPhone(sentTo)}</span>
            {emailToo && (
              <>
                {' '}
                and one to <span className="text-ink">{user.email}</span>
              </>
            )}
            .
          </p>
          <CodeInput id="new-phone-code" label="Code sent to the new number" value={phoneCode} onChange={setPhoneCode} />
          {emailToo && <CodeInput id="phone-change-email-code" label="Code sent to your email" value={emailCode} onChange={setEmailCode} autoFocus={false} />}
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} disabled={phoneCode.length !== 6 || (emailToo && emailCode.length !== 6)} onClick={change}>
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
