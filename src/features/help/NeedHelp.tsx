import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { useSession } from '../../store/session'
import { AttachmentPicker, useAttachments } from './Attach'
import { cleanedLength, sendError } from './text'
import { helpApi, helpKeys } from '../../api/help'
import { useQueryClient } from '@tanstack/react-query'
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
/** Set when leaving to finish the profile with files picked (they can't come along). */
const FILES_DROPPED = 'pd.helpFilesDropped'

export function NeedHelp() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const location = useLocation()
  const [params] = useSearchParams()
  const user = useSession((s) => s.user)!
  const setUser = useSession((s) => s.setUser)
  const DRAFT_KEY = draftKey(user.id)
  const files = useAttachments()
  // A link that says what it's about wins over an older, different draft (the same one, back from a detour, stays)
  const draft = storage.getJson<{ subject: string; message: string }>(DRAFT_KEY)
  const saved = !params.has('about') || draft?.subject === params.get('about') ? draft : null
  const [subject, setSubject] = useState(saved?.subject || params.get('about') || '')
  const heading = useRef<HTMLHeadingElement | null>(null)
  const [message, setMessage] = useState(saved?.message || '')
  const [busy, setBusy] = useState(false)
  // Back from finishing the profile: the words were kept, the files couldn't be (they go with the page)
  const [error, setError] = useState<string | null>(() => {
    try {
      if (sessionStorage.getItem(FILES_DROPPED) !== null) {
        sessionStorage.removeItem(FILES_DROPPED)
        return 'Your files couldn\'t be kept while you finished your profile: add them again.'
      }
    } catch {
      /* storage blocked: nothing to say */
    }
    return null
  })
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
    if (sending.current || length < MESSAGE_MIN || length > MESSAGE_MAX || files.sending || files.failed) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      const ticket = await helpApi.ask(message.trim(), subject, files.fileIds)
      storage.remove(DRAFT_KEY)
      files.clear()
      void qc.invalidateQueries({ queryKey: helpKeys.mine })   // My requests shows it at once
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
          if (files.items.length > 0) {
            try {
              sessionStorage.setItem(FILES_DROPPED, '1')
            } catch {
              /* storage blocked */
            }
          }
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
          We've emailed you a copy. To add anything, open it in My requests, or reply to that email (keep{' '}
          {done.number} in the subject).
        </p>
        <Button
          onClick={() => {
            // Need help → My requests → the request: ← goes to the list, and its ← home (Need help is done)
            navigate('/help/requests', { replace: true })
            navigate(`/help/requests/${done.id}`, { state: { fromList: true } })
          }}
        >
          See it in My requests
        </Button>
        <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
          Done
        </Button>
      </Page>
    )
  }

  return (
    <Page title="Need help" back>
      <Link to="/help/requests" state={{ from: true }} className="self-start text-sm text-link underline">
        Asked before? See My requests and our replies
      </Link>
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
          hint={length === 0 ? `At least ${MESSAGE_MIN} characters${files.items.length > 0 ? ', even with a file' : ''}` : `${length} / ${MESSAGE_MAX}`}
        />
        <AttachmentPicker a={files} id="help-files" disabled={busy} />
        {files.sending && <p className="text-sm text-muted">Send works once your files have finished uploading.</p>}
        {files.failed && <p className="text-sm text-bad">A file didn't go up: try it again or remove it.</p>}
        {error && <Banner tone="bad">{error} What you wrote is kept here.</Banner>}
        <Button type="submit" busy={busy} disabled={length < MESSAGE_MIN || length > MESSAGE_MAX || files.sending || files.failed}>
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
