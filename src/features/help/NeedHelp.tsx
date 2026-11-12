import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { useSession } from '../../store/session'
import { cleanedLength, sendError } from './text'
import { helpApi } from '../../api/help'
import { isApiError, messageOf } from '../../api/errors'
import type { HelpTicket } from '../../api/types'
import { Banner, Button, Field, Page, TextArea } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'
import { storage } from '../../lib/storage'
import { rememberReturn } from '../auth/flow'

/** The backend's limits (TicketService): a message of 10 to 5,000 characters, a subject of at most 100. */
const MESSAGE_MIN = 10
const MESSAGE_MAX = 5000
const SUBJECT_MAX = 100
/** What this person typed, kept until it's sent, so leaving or a failed send never loses it (never shown to another). */
const draftKey = (userId: string) => `pd.helpDraft.${userId}`

/**
 * /help: "Need help" — the partner writes to support; it becomes a ticket (CLZ-1042) and our reply comes by email.
 * Support sees their salon and role with the ticket, so they needn't type the shop code. Opened from More (and the
 * kirana "coming soon" page, `?about=` fills the subject).
 */
export function NeedHelp() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const user = useSession((s) => s.user)!
  const setUser = useSession((s) => s.setUser)
  const DRAFT_KEY = draftKey(user.id)
  // A link that says what it's about wins over an older, different draft (the same one, back from a detour, stays)
  const draft = storage.getJson<{ subject: string; message: string }>(DRAFT_KEY)
  const saved = !params.has('about') || draft?.subject === params.get('about') ? draft : null
  const [subject, setSubject] = useState(saved?.subject || params.get('about') || '')
  const heading = useRef<HTMLHeadingElement | null>(null)
  const [message, setMessage] = useState(saved?.message || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<HelpTicket | null>(null)
  const sending = useRef(false)

  useEffect(() => {
    if (done) return
    if (subject.trim() || message.trim()) storage.setJson(DRAFT_KEY, { subject, message })
    else storage.remove(DRAFT_KEY)
  }, [subject, message, done, DRAFT_KEY])

  useEffect(() => {
    if (done) heading.current?.focus()   // the form is gone: screen readers hear the ticket number
  }, [done])

  const length = cleanedLength(message)
  const problem =
    length > 0 && length < MESSAGE_MIN
      ? `Tell us a little more (at least ${MESSAGE_MIN} characters).`
      : length > MESSAGE_MAX
        ? `At most ${MESSAGE_MAX} characters (now ${length}).`
        : undefined

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending.current || length < MESSAGE_MIN || length > MESSAGE_MAX) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const ticket = await helpApi.ask(message.trim(), subject)
      storage.remove(DRAFT_KEY)
      setDone(ticket)
    } catch (err) {
      if (isApiError(err, 'PROFILE_INCOMPLETE')) {
        // The email stopped being verified meanwhile (changed on another device): read the profile again first, so
        // the sign-up step doesn't send them straight back here; then finish it and come back (what was typed is kept)
        const fresh = await authApi.me().catch(() => null)
        if (fresh) setUser(fresh)
        const missing = (err.details.missing as string[] | undefined) ?? []
        if (fresh && missing.length > 0) {
          rememberReturn(location.pathname + location.search)
          navigate(missing.includes('email') ? '/welcome/email' : '/welcome/name')
          return
        }
      }
      setError(isApiError(err, 'VALIDATION_FAILED') ? sendError(err.details, messageOf(err)) : messageOf(err))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Page title="Need help" back="/">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          Sent: ticket {done.number}
        </h2>
        <Banner tone="good">
          We've got it: ticket <strong>{done.number}</strong>. Our support team will reply to{' '}
          <span className="[overflow-wrap:anywhere]">{done.sentTo}</span> as soon as we can.
        </Banner>
        <p className="text-sm text-muted">
          We've emailed you a copy. To add anything, reply to that email (keep {done.number} in the subject).
        </p>
        <Button onClick={() => navigate('/', { replace: true })}>Done</Button>
      </Page>
    )
  }

  return (
    <Page title="Need help" back>
      <p className="text-muted">
        Tell us what happened. For a booking, add its number (like SB7K3Q9X). We see your salon with your message and
        reply by email.
      </p>
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        <Field
          id="help-subject"
          label="What's it about? (optional)"
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="A booking, payouts, my listing, the app…"
        />
        <TextArea
          id="help-message"
          label="Your message"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={problem}
          hint={length === 0 ? `At least ${MESSAGE_MIN} characters` : `${length} / ${MESSAGE_MAX}`}
        />
        {error && <Banner tone="bad">{error} What you wrote is kept here.</Banner>}
        <Button type="submit" busy={busy} disabled={length < MESSAGE_MIN || length > MESSAGE_MAX}>
          Send to support
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Or email us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </Page>
  )
}
