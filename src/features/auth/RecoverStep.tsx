import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { isApiError, messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Turnstile } from '../../components/Turnstile'
import { useT } from '../../i18n'
import { TURNSTILE_SITE_KEY } from '../../lib/config'
import { Banner, Button, Field, Page } from '../../components/ui'
import { formatPhone, looksLikeEmail, normalizePhone } from '../../lib/phone'
import { useSession } from '../../store/session'
import { nextAfterSignIn } from './flow'

/**
 * Lost the old phone number: prove the account's email, prove the new number, and the account moves to it.
 * The backend sends one code to the email and one by SMS to the new number.
 */
export function RecoverStep() {
  const t = useT()
  const navigate = useNavigate()
  const signIn = useSession((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [started, setStarted] = useState<{ email: string; phone: string } | null>(null)
  const [emailCode, setEmailCode] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const newPhone = normalizePhone(phone)
  const canStart = looksLikeEmail(email) && Boolean(newPhone) && (!TURNSTILE_SITE_KEY || Boolean(captcha))

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!canStart || !newPhone) return
    setBusy(true)
    setError(null)
    try {
      await authApi.startRecovery(email.trim(), newPhone, captcha)
      setStarted({ email: email.trim(), phone: newPhone })
    } catch (err) {
      setError(messageOf(err))
      if (TURNSTILE_SITE_KEY || isApiError(err, 'CAPTCHA_FAILED') || isApiError(err, 'CAPTCHA_REQUIRED')) setResetKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    if (!started) return
    setBusy(true)
    setError(null)
    try {
      const tokens = await authApi.completeRecovery(started.email, emailCode, started.phone, phoneCode)
      signIn(tokens)
      navigate(nextAfterSignIn(tokens.user), { replace: true })
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title={t('auth.recoverTitle')} back="/signin">
      {!started ? (
        <form onSubmit={start} className="flex flex-col gap-4" noValidate>
          <p className="text-muted">
            {t('auth.recoverIntro')}
          </p>
          <Field
            id="recover-email"
            label={t('auth.recoverEmailLabel')}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            id="recover-phone"
            label={t('auth.recoverPhoneLabel')}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Turnstile onToken={setCaptcha} resetKey={resetKey} />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button type="submit" busy={busy} disabled={!canStart}>
            {t('auth.recoverSendCodes')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            {t('auth.recoverSentBefore')}<span className="text-ink">{started.email}</span>{t('auth.recoverSentMiddle')}
            <span className="text-ink">+91 {formatPhone(started.phone)}</span>{t('auth.recoverSentAfter')}
          </p>
          <CodeInput id="recover-email-code" label={t('auth.recoverEmailCode')} value={emailCode} onChange={setEmailCode} />
          <CodeInput id="recover-phone-code" label={t('auth.recoverSmsCode')} value={phoneCode} onChange={setPhoneCode} autoFocus={false} />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} disabled={emailCode.length !== 6 || phoneCode.length !== 6} onClick={complete}>
            {t('auth.recoverSubmit')}
          </Button>
          <Button variant="ghost" onClick={() => setStarted(null)}>
            {t('auth.recoverStartAgain')}
          </Button>
        </div>
      )}
    </Page>
  )
}
