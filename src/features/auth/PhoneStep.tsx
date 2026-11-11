import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { isApiError, messageOf } from '../../api/errors'
import { Banner, Button, Field, Page } from '../../components/ui'
import { Turnstile } from '../../components/Turnstile'
import { TURNSTILE_SITE_KEY } from '../../lib/config'
import { formatPhone, normalizePhone } from '../../lib/phone'
import { takePhoneMove } from '../../lib/phoneMoved'
import { Brand } from './Brand'

export function PhoneStep() {
  const navigate = useNavigate()
  const deleted = Boolean((useLocation().state as { deleted?: boolean } | null)?.deleted)
  // A phone change whose answer was lost and which ended the session: it most likely went through
  const [movedTo] = useState(takePhoneMove)
  const [phone, setPhone] = useState(movedTo ?? '')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const normalized = normalizePhone(phone)
  const needsCaptcha = Boolean(TURNSTILE_SITE_KEY)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!normalized) {
      setError('Enter a 10-digit Indian mobile number')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await authApi.sendCode(normalized, captcha)
      navigate('/signin/code', { state: { phone: normalized } })
    } catch (err) {
      setError(messageOf(err))
      // A robot-check token works once; any failure needs a fresh one.
      if (needsCaptcha || isApiError(err, 'CAPTCHA_FAILED') || isApiError(err, 'CAPTCHA_REQUIRED')) setResetKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <Brand subtitle="For salon owners, helpers and barbers. Sign in with your mobile number." />
      {deleted && <Banner tone="info">Your account has been deleted.</Banner>}
      {movedTo && (
        <Banner tone="info">
          Your number was probably changed to +91 {formatPhone(movedTo)}. Sign in with that number to keep your account.
        </Banner>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          id="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98480 12345"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint="We'll send a 6-digit code by SMS."
        />
        <Turnstile onToken={setCaptcha} resetKey={resetKey} />
        {error && <Banner tone="bad">{error}</Banner>}
        <Button type="submit" busy={busy} disabled={!normalized || (needsCaptcha && !captcha)}>
          Send code
        </Button>
      </form>
      <p className="mt-2 text-center text-sm text-muted">
        Lost your phone number?{' '}
        <Link to="/signin/recover" className="text-link underline">
          Recover with your email
        </Link>
      </p>
    </Page>
  )
}
