import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Field, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { looksLikeEmail } from '../../lib/phone'
import { useSession } from '../../store/session'
import { nextAfterSignIn } from './flow'
import { SignUpWayOut } from './SignUpWayOut'

/** Sign-up step 2: an email we can reach, for receipts and for getting the account back if the phone is lost. */
export function EmailStep() {
  const t = useT()
  const navigate = useNavigate()
  const setUser = useSession((s) => s.setUser)
  const current = useSession((s) => s.user?.email) ?? ''
  const [email, setEmail] = useState(current)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    if (busy) return
    const address = email.trim()
    if (!looksLikeEmail(address)) {
      setError(t('auth.emailInvalid'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await authApi.sendEmailCode(address)
      setSentTo(address)
      setCode('')
      setWait(30)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  async function verify(value: string) {
    if (!sentTo || value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      const user = await authApi.verifyEmail(sentTo, value)
      setUser(user)
      navigate(nextAfterSignIn(user), { replace: true })
    } catch (err) {
      setError(messageOf(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title={t('auth.emailTitle')} language>
      <p className="text-muted">{t('auth.emailIntro')}</p>
      {!sentTo ? (
        <form onSubmit={send} className="flex flex-col gap-4" noValidate>
          <Field
            id="email"
            label={t('auth.emailLabel')}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button type="submit" busy={busy} disabled={!looksLikeEmail(email)}>
            {t('auth.emailSendCode')}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            {t('auth.emailSentBefore')}<span className="text-ink">{sentTo}</span>{t('auth.emailSentAfter')}
          </p>
          <CodeInput
            id="email-code"
            label={t('auth.codeLabel')}
            value={code}
            onChange={(v) => {
              setCode(v)
              if (v.length === 6) void verify(v)
            }}
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} disabled={code.length !== 6} onClick={() => verify(code)}>
            {t('auth.verify')}
          </Button>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => send()} disabled={busy || wait > 0}>
              {wait > 0 ? t('auth.emailSendAgainIn', { seconds: wait }) : t('auth.emailSendAgain')}
            </Button>
            <Button variant="ghost" onClick={() => setSentTo(null)}>
              {t('auth.emailChange')}
            </Button>
          </div>
        </div>
      )}
      <SignUpWayOut screen={t('auth.emailTitle')} />
    </Page>
  )
}
