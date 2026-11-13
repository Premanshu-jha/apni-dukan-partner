import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useAddToRequest, useMyRequest, useMyRequests } from '../../api/help'
import { isApiError, messageOf } from '../../api/errors'
import type { MyRequest, MyRequestMessage } from '../../api/types'
import { Banner, Button, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { SUPPORT_EMAIL } from '../../lib/config'
import { dateTimeIst } from '../../lib/ist'
import { storage } from '../../lib/storage'
import { useSession } from '../../store/session'
import { AttachmentPicker, MessageFiles, useAttachments } from './Attach'
import { cleanedLength, sendError } from './text'

/** The backend's limits for adding to a request (TicketService.addToMine). */
const ADD_MIN = 2
const ADD_MAX = 5000
/** What this person typed on one request, kept until it's sent (never shown to another person on this phone). */
const draftKey = (userId: string, ticketId: string) => `ad.requestDraft.${userId}.${ticketId}`

const statusText: Record<MyRequest['status'], string> = {
  OPEN: 'With our support team',
  WAITING: 'We replied',
  RESOLVED: 'Resolved',
}

function StatusPill({ status }: { status: MyRequest['status'] }) {
  const tone = status === 'WAITING' ? 'bg-brand/15 text-link' : status === 'OPEN' ? 'bg-raised text-ink' : 'bg-raised text-muted'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{statusText[status]}</span>
}

/** /help/requests: what I've asked support, newest activity first. Opened from More, Need help and after sending. */
export function MyRequests() {
  const list = useMyRequests()
  // ← goes back where they came from (Profile, More, Need help); opened from a link or after sending, to Home
  const cameFrom = (useLocation().state as { from?: unknown } | null)?.from === true
  return (
    <Page title="My requests" back={cameFrom ? true : '/'}>
      {list.isError && list.data && (
        <Banner tone="warn">Couldn't refresh: {messageOf(list.error)} This is what we had.</Banner>
      )}
      {list.isPending ? (
        <Loading />
      ) : list.isError && !list.data ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : list.data!.length === 0 ? (
        <EmptyState
          title="No requests yet"
          body="When you write to support, your question and our replies show here."
          action={
            <Link to="/help" className="text-link underline">
              Write to support
            </Link>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {list.data!.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/help/requests/${t.id}`}
                  state={{ fromList: true }}
                  className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 hover:bg-raised"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted">{t.number}</span>
                    <StatusPill status={t.status} />
                  </span>
                  <span className="font-medium [overflow-wrap:anywhere]">{t.subject || 'Your question'}</span>
                  <span className="text-sm text-muted">Last message {dateTimeIst(t.lastMessageAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {list.data!.length >= 30 && <p className="text-center text-sm text-muted">Showing your latest 30 requests.</p>}
          <Link to="/help" className="text-center text-link underline">
            Ask something new
          </Link>
        </>
      )}
    </Page>
  )
}

function Message({ m }: { m: MyRequestMessage }) {
  return (
    <li className={`flex flex-col gap-1 rounded-2xl p-3 ${m.fromSupport ? 'mr-6 bg-raised' : 'ml-6 border border-line bg-surface'}`}>
      <span className="text-xs font-semibold text-muted">
        {m.fromSupport ? `Clozest support${m.supportName ? ` · ${m.supportName}` : ''}` : 'You'} · {dateTimeIst(m.at)}
      </span>
      {m.body && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>}
      <MessageFiles files={m.files ?? []} />
      {m.attachments > 0 && (
        <p className="text-xs text-muted">
          📎 {m.attachments} {m.attachments === 1 ? 'file' : 'files'} sent by email (they stay in that email)
        </p>
      )}
    </li>
  )
}

/** /help/requests/:id: the conversation with support, and a box to add to it (reopens a resolved request). */
export function RequestDetail() {
  const { id = '' } = useParams()
  // ← back to the list it was opened from; opened another way, to the list (never round in a loop)
  const fromList = (useLocation().state as { fromList?: unknown } | null)?.fromList === true
  const backTo = fromList ? true : '/help/requests'
  const box = useRef<HTMLTextAreaElement | null>(null)
  const files = useAttachments()
  const user = useSession((s) => s.user)!
  const detail = useMyRequest(id)
  const add = useAddToRequest(id)
  const key = draftKey(user.id, id)
  const [text, setText] = useState(() => storage.getJson<string>(key) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const sending = useRef(false)

  useEffect(() => {
    if (text.trim()) storage.setJson(key, text)
    else storage.remove(key)
  }, [text, key])

  if (detail.isPending) {
    return (
      <Page title="My request" back={backTo}>
        <Loading />
      </Page>
    )
  }
  if (detail.isError && !detail.data) {
    const missing = isApiError(detail.error, 'NOT_FOUND') || (isApiError(detail.error) && detail.error.status === 400)
    return (
      <Page title="My request" back={backTo}>
        {missing ? (
          <EmptyState
            title="Request not found"
            body="It may belong to another account."
            action={
              <Link to="/help/requests" className="text-link underline">
                See my requests
              </Link>
            }
          />
        ) : (
          <ErrorState message={messageOf(detail.error)} onRetry={() => detail.refetch()} />
        )}
      </Page>
    )
  }

  const { ticket, messages } = detail.data!
  const length = cleanedLength(text)
  const tooLong = length > ADD_MAX
  const resolved = ticket.status === 'RESOLVED'
  // With a file the words may be left out; a file still going up (or failed) holds Send
  const withFiles = files.fileIds.length > 0
  const ready = !files.sending && !files.failed && !tooLong && (withFiles || length >= ADD_MIN)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (sending.current || !ready) return
    sending.current = true
    setError(null)
    setSent(false)
    try {
      await add.mutateAsync({ message: text.trim(), fileIds: files.fileIds })
      setText('')
      storage.remove(key)
      files.clear()
      setSent(true)
      box.current?.focus()   // Send is off again (empty box): keyboard and screen-reader users stay in the box
    } catch (err) {
      setError(
        isApiError(err, 'VALIDATION_FAILED')
          ? sendError(err.details, messageOf(err))
          : isApiError(err, 'FILE_NOT_FOUND') || isApiError(err, 'FILE_ALREADY_SENT')
            ? messageOf(err)   // says which file, and to remove it and add it again
            : `${messageOf(err)} What you wrote is kept here.`,
      )
    } finally {
      sending.current = false
    }
  }

  return (
    <Page title={ticket.number} back={backTo}>
      <div className="flex flex-col gap-1">
        <StatusPill status={ticket.status} />
        <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{ticket.subject || 'Your question'}</h2>
        <p className="text-sm text-muted">Asked {dateTimeIst(ticket.createdAt)}. Our replies also come by email.</p>
      </div>
      {detail.isError && <Banner tone="warn">Couldn't refresh: {messageOf(detail.error)} This is what we had.</Banner>}
      <ul className="flex flex-col gap-3" aria-label="Conversation">
        {messages.map((m) => (
          <Message key={m.seq} m={m} />
        ))}
      </ul>
      <form onSubmit={send} className="flex flex-col gap-2" noValidate>
        <label htmlFor="request-add" className="text-sm font-medium text-muted">
          {resolved ? 'Write again (opens it again)' : 'Add to your request'}
        </label>
        <textarea
          id="request-add"
          ref={box}
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSent(false)
          }}
          aria-invalid={tooLong ? true : undefined}
          aria-describedby="request-add-hint"
          className={`rounded-xl border bg-surface px-4 py-3 text-base text-ink focus:border-brand focus:outline-none ${tooLong ? 'border-bad' : 'border-line'}`}
        />
        <p id="request-add-hint" className={`text-sm ${tooLong ? 'text-bad' : 'text-muted'}`}>
          {tooLong
            ? `At most ${ADD_MAX} characters (now ${length}).`
            : length === 1 && !withFiles
              ? `At least ${ADD_MIN} characters, or add a file.`
              : length > 0
                ? `${length} / ${ADD_MAX}`
                : withFiles
                  ? 'Words are optional with a file.'
                  : `At least ${ADD_MIN} characters, or add a file.`}
        </p>
        <AttachmentPicker a={files} id="request-files" disabled={add.isPending} />
        {files.sending && <p className="text-sm text-muted">Send works once your files have finished uploading.</p>}
        {files.failed && <p className="text-sm text-bad">A file didn't go up: try it again or remove it.</p>}
        {error && <Banner tone="bad">{error}</Banner>}
        {sent && <Banner tone="good">Sent. Our support team will read it and reply.</Banner>}
        <Button type="submit" busy={add.isPending} disabled={!ready}>
          Send
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        Or email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(ticket.number)}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>{' '}
        with {ticket.number} in the subject.
      </p>
    </Page>
  )
}
