import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Field, Page } from '../../components/ui'
import { looksLikeEmail } from '../../lib/phone'
import { useSession } from '../../store/session'
import { nextAfterSignIn } from './flow'

/** Sign-up step 2: an email we can reach, for receipts and for getting the account back if the phone is lost. */
export function EmailStep() {
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
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    if (busy) return
    const address = email.trim()
    if (!looksLikeEmail(address)) {
      setError('Enter a valid email address')
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
    <Page title="Your email">
      <p className="text-muted">Step 2 of 3. If you ever lose your phone number, this email is how you get your account back.</p>
      {!sentTo ? (
        <form onSubmit={send} className="flex flex-col gap-4" noValidate>
          <Field
            id="email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button type="submit" busy={busy} disabled={!looksLikeEmail(email)}>
            Send code
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            We sent a code to <span className="text-ink">{sentTo}</span>. Check spam if you don't see it.
          </p>
          <CodeInput
            id="email-code"
            label="Code"
            value={code}
            onChange={(v) => {
              setCode(v)
              if (v.length === 6) void verify(v)
            }}
          />
          {error && <Banner tone="bad">{error}</Banner>}
          <Button busy={busy} disabled={code.length !== 6} onClick={() => verify(code)}>
            Verify
          </Button>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => send()} disabled={busy || wait > 0}>
              {wait > 0 ? `Send again in ${wait} s` : 'Send again'}
            </Button>
            <Button variant="ghost" onClick={() => setSentTo(null)}>
              Change email
            </Button>
          </div>
        </div>
      )}
    </Page>
  )
}
