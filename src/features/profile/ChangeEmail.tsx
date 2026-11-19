import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { isApiError, messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Field, Page } from '../../components/ui'
import { formatPhone, looksLikeEmail } from '../../lib/phone'
import { useSession } from '../../store/session'
import { useT } from '../../i18n'

/**
 * A verified email is how a lost phone is recovered, so replacing it needs proof of the phone first:
 * 1) SMS code to the phone, 2) new email + that code, 3) the code sent to the new email.
 */
/** The backend's answers about the SMS code (OtpService), which send the person back to the phone step. */
const PHONE_CODE_ERRORS = new Set(['WRONG_CODE', 'CODE_EXPIRED', 'TOO_MANY_ATTEMPTS', 'LOCKED_FOR_TODAY', 'PHONE_CODE_REQUIRED'])

export function ChangeEmail() {
  const t = useT()
  const navigate = useNavigate()
  const user = useSession((s) => s.user)!
  const setUser = useSession((s) => s.setUser)
  const needsPhone = user.emailVerified
  const [step, setStep] = useState<'phone' | 'email' | 'code'>(needsPhone ? 'phone' : 'email')
  const [phoneSent, setPhoneSent] = useState(false)
  const [phoneCode, setPhoneCode] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page back="/more" title={t('profile.changeEmailTitle')}>
      <p className="text-muted">
        {t('profile.now')} <span className="text-ink">{user.email}</span>
      </p>
      {step === 'phone' && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">{t('profile.changeEmailPhoneFirst', { phone: formatPhone(user.phone) })}</p>
          {phoneSent && <CodeInput id="change-phone-code" label={t('profile.smsCode')} value={phoneCode} onChange={setPhoneCode} />}
          {error && <Banner tone="bad">{error}</Banner>}
          {!phoneSent ? (
            <Button busy={busy} onClick={() => run(async () => { await authApi.sendChangeEmailPhoneCode(); setPhoneSent(true) })}>
              {t('profile.sendSmsCode')}
            </Button>
          ) : (
            <Button disabled={phoneCode.length !== 6} onClick={() => setStep('email')}>
              {t('common.continue')}
            </Button>
          )}
        </div>
      )}
      {step === 'email' && (
        <div className="flex flex-col gap-4">
          <Field
            id="new-email"
            label={t('profile.newEmail')}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button
            busy={busy}
            disabled={!looksLikeEmail(email)}
            onClick={() =>
              run(async () => {
                try {
                  await authApi.sendEmailCode(email.trim(), needsPhone ? phoneCode : undefined)
                  setStep('code')
                } catch (e) {
                  // The SMS code is only checked here: if it was wrong or used up, go back and get a new one
                  if (needsPhone && isApiError(e) && PHONE_CODE_ERRORS.has(e.code)) {
                    setPhoneCode('')
                    setPhoneSent(e.code !== 'TOO_MANY_ATTEMPTS' && e.code !== 'CODE_EXPIRED')
                    setStep('phone')
                  }
                  throw e
                }
              })
            }
          >
            {t('profile.sendCodeToEmail')}
          </Button>
        </div>
      )}
      {step === 'code' && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            {t('profile.emailCodeSentBefore')} <span className="text-ink">{email.trim()}</span>{t('profile.emailCodeSentAfter')}
          </p>
          <CodeInput id="new-email-code" label={t('profile.emailCode')} value={code} onChange={setCode} />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button
            busy={busy}
            disabled={code.length !== 6}
            onClick={() =>
              run(async () => {
                setUser(await authApi.verifyEmail(email.trim(), code))
                navigate('/more', { replace: true })
              })
            }
          >
            {t('profile.verify')}
          </Button>
        </div>
      )}
    </Page>
  )
}
