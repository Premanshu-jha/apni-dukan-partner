import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Turnstile } from '../../components/Turnstile'
import { TURNSTILE_SITE_KEY } from '../../lib/config'
import { Banner, Button, Page } from '../../components/ui'
import { ContactUs } from '../../components/ContactUs'
import { useT } from '../../i18n'
import { formatPhone } from '../../lib/phone'
import { useSession } from '../../store/session'
import { nextAfterSignIn } from './flow'

const RESEND_AFTER = 30

export function CodeStep() {
  const t = useT()
  const navigate = useNavigate()
  const phone = (useLocation().state as { phone?: string } | null)?.phone
  const signIn = useSession((s) => s.signIn)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(RESEND_AFTER)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  if (!phone) return <Navigate to="/signin" replace />

  async function verify(value: string) {
    if (value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    try {
      const tokens = await authApi.verifyCode(phone!, value)
      signIn(tokens)
      navigate(nextAfterSignIn(tokens.user), { replace: true })
    } catch (err) {
      setError(messageOf(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (sending || busy) return
    setSending(true)
    setError(null)
    setNotice(null)
    try {
      await authApi.sendCode(phone!, captcha)
      setNotice(t('auth.codeNewOnItsWay'))
      setWait(RESEND_AFTER)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSending(false)
      if (TURNSTILE_SITE_KEY) setResetKey((k) => k + 1)
    }
  }

  return (
    <Page title={t('auth.codeTitle')} back="/signin">
      <p className="text-muted">
        {t('auth.codeSentBefore')}<span className="text-ink">+91 {formatPhone(phone)}</span>{t('auth.codeSentAfter')}
      </p>
      <CodeInput
        id="code"
        label={t('auth.codeLabel')}
        value={code}
        onChange={(v) => {
          setCode(v)
          if (v.length === 6) void verify(v)
        }}
      />
      {error && <Banner tone="bad">{error}</Banner>}
      {notice && <Banner tone="good">{notice}</Banner>}
      <Button busy={busy} disabled={code.length !== 6} onClick={() => verify(code)}>
        {t('auth.verify')}
      </Button>
      <div className="flex flex-col items-center gap-3">
        {wait > 0 ? (
          <p className="text-sm text-muted">{t('auth.codeNewIn', { seconds: wait })}</p>
        ) : (
          <>
            <Turnstile onToken={setCaptcha} resetKey={resetKey} />
            <Button variant="ghost" onClick={resend} busy={sending} disabled={busy || (Boolean(TURNSTILE_SITE_KEY) && !captcha)}>
              {t('auth.codeSendNew')}
            </Button>
          </>
        )}
        <button type="button" className="text-sm text-link underline" onClick={() => navigate('/signin')}>
          {t('auth.codeWrongNumber')}
        </button>
      </div>
      {/* The commonest sign-in problem: what to try, then a person to talk to (no sign-in needed) */}
      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-sm text-muted">{t('auth.noSmsHelp')}</p>
        <ContactUs screen={t('auth.codeTitle')} />
      </div>
    </Page>
  )
}
