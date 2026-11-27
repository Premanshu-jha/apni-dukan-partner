import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { authApi } from '../../api/auth'
import { missingSteps, useSession } from '../../store/session'
import { AttachmentPicker, useAttachments } from './Attach'
import { cleanedLength, sendError } from './text'
import { helpApi, helpKeys, useMyRequests } from '../../api/help'
import { useMyShop } from '../../api/shop'
import { useQueryClient } from '@tanstack/react-query'
import { isApiError, messageOf } from '../../api/errors'
import type { HelpTicket } from '../../api/types'
import { Banner, Button, Card, Field, Loading, Page, TextArea } from '../../components/ui'
import { ContactUs } from '../../components/ContactUs'
import { kiranaOn, SUPPORT_EMAIL } from '../../lib/config'
import { loadRegisterKind } from '../../lib/registerDraft'
import { storage } from '../../lib/storage'
import { nextAfterSignIn, rememberReturn } from '../auth/flow'
import { spaceBefore, useT } from '../../i18n'
import { HelpIcon } from './HelpButton'
import { HowToAnswers } from './HowTo'
import { safeFrom } from './links'
import { unreadReplies, useHelpSeen } from './seen'

/** The backend's limits (TicketService): a message of 10 to 5,000 characters, a subject of at most 100. */
const MESSAGE_MIN = 10
const MESSAGE_MAX = 5000
const SUBJECT_MAX = 100
/** What this person typed, kept until it's sent, so leaving or a failed send never loses it (never shown to another). */
const draftKey = (userId: string) => `pd.helpDraft.${userId}`

/** Set when leaving to finish the profile with files picked (they can't come along). */
const FILES_DROPPED = 'pd.helpFilesDropped'

/**
 * A kept draft. `auto` is what the app itself filled in (the screen's subject, an error's words): a draft that is
 * still only that is not the person's own writing, so a later Help from another screen may fill it in afresh.
 */
interface Draft {
  subject: string
  message: string
  auto?: { subject: string; message: string }
}

/** The person typed (or changed) something in it: never replaced without asking. */
export function typedByThem(d: Draft | null): boolean {
  if (!d || (!d.subject.trim() && !d.message.trim())) return false
  return !(d.auto && d.auto.subject === d.subject && d.auto.message === d.message)
}

/**
 * /help: "Need help". First what can be done at once: "Write to us" (the message form), My requests with what's
 * waiting, and the how-to answers for this person's role, searchable, each with "Take me there". The form opens at
 * once when the address says what to write (`about`, `text` or `write=1`: an error's "Write to us", a booking's
 * "Problem with this?", any other screen's link). See links.ts for everything /help takes.
 *
 * Anyone can open it, signed in or not: Call us and WhatsApp us come first, for everyone. Writing to us needs a
 * verified email (replies go there): without one, "Write to us" says so, with one tap to add it (and back here after),
 * and Call us / WhatsApp us stay in sight.
 */
export function NeedHelp() {
  const [params] = useSearchParams()
  const status = useSession((s) => s.status)
  if (status === 'starting') return <Loading />
  const writing = params.has('about') || params.has('text') || params.get('write') === '1'
  return writing ? <WriteToUs /> : <HelpHome />
}

/** Signed in with a verified email and a name: what writing to us needs (the backend's PROFILE_INCOMPLETE). */
function useReady(): boolean {
  return useSession((s) => s.status === 'signedIn' && s.user !== null && missingSteps(s.user).length === 0)
}

/** Call us / WhatsApp us at the top, with the screen they came about and the shop code (when known) typed in. */
function TalkToUs({ about, shopCode }: { about: string | null; shopCode?: number | null }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2">
      <ContactUs screen={about ?? t('help.title')} shopCode={shopCode} heading={t('help.talkToUs')} />
      {shopCode != null && <p className="text-center text-sm">{t('help.tellShopCode', { code: String(shopCode) })}</p>}
    </div>
  )
}

/**
 * "Write to us" without a verified email (or signed out): why it needs one, and one tap to add it (or to sign in).
 * Back here afterwards, with the message form open (what was typed is kept).
 */
function NeedsEmail() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useSession((s) => (s.status === 'signedIn' ? s.user : null))
  // Only the name is missing (the email is verified): say that, not "email"
  const nameOnly = user !== null && !missingSteps(user).includes('email')
  const what = !user ? 'SignIn' : nameOnly ? 'Name' : 'Email'
  const back = () => {
    const p = new URLSearchParams(location.search)
    p.set('write', '1')
    return `${location.pathname}?${p.toString()}`
  }
  return (
    <Card className="flex flex-col gap-3">
      <p className="font-semibold">{t(`help.need${what}Title`)}</p>
      <p className="text-sm text-muted">{t(`help.need${what}Body`)}</p>
      <Button
        className="min-h-14 text-lg"
        onClick={() => {
          rememberReturn(back())
          navigate(user ? nextAfterSignIn(user) : '/signin')
        }}
      >
        {t(!user ? 'help.signInToWrite' : nameOnly ? 'help.addMyName' : 'help.addMyEmail')}
      </Button>
    </Card>
  )
}

/** The help page's top: the actions first (Call us / WhatsApp us, then Write to us), then the answers. */
function HelpHome() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const user = useSession((s) => s.user)
  const ready = useReady()
  const shop = useMyShop(ready)
  const from = safeFrom(params.get('from'))
  const topic = params.get('topic')?.slice(0, SUBJECT_MAX) || null
  const started = ready && user ? typedByThem(storage.getJson<Draft>(draftKey(user.id))) : false
  // No shop yet, but "What do you run?" was answered with a kirana: the early answers are a salon's
  const kiranaRegistering = (!ready || shop.data === null) && kiranaOn() && loadRegisterKind(user?.id) === 'KIRANA'
  // Opens the form in this same page, as a step of its own: Back comes back here
  const write = (extra: { about?: string; text?: string } = {}) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('write', '1')
      // Their own message waiting: just open it (the screen's subject would only ask whether to replace it)
      const about = extra.about ?? (started ? null : topic)
      if (about) next.set('about', about)
      if (extra.text) next.set('text', extra.text)
      return next
    })
  return (
    <Page title={t('help.title')} back={from ? true : '/'} language={!ready}>
      <TalkToUs about={topic ?? from} shopCode={shop.data?.shopCode} />
      {ready ? (
        <div className="flex flex-col gap-1">
          <Button className="min-h-14 text-lg" onClick={() => write()}>
            <HelpIcon />
            {started ? t('help.continueMessage') : t('help.writeToUs')}
          </Button>
          <p className="text-center text-sm text-muted">
            {topic && !started ? `${t('help.writeAbout', { topic })} · ` : ''}
            {t('help.writeHint')}
          </p>
        </div>
      ) : (
        <NeedsEmail />
      )}
      {ready && user && <RequestsCard userId={user.id} from={from} topic={topic} />}
      {/* What they searched for becomes the subject: the message is theirs to write (no "too short" before they do).
          No shop yet (null), or a salon not live yet: the answers about registering and joining */}
      {/* Without a verified email (or signed out) too: no shop is read then, so the answers about registering and
          joining (they need no email) */}
      {(ready ? shop.isSuccess : true) && !kiranaRegistering && (
        <HowToAnswers shop={ready ? (shop.data ?? null) : null} from={from} onAsk={(q) => write({ about: q.slice(0, SUBJECT_MAX) })} />
      )}
      <p className="text-center text-sm text-muted">
        {t('help.orEmailUsAt')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </Page>
  )
}

/** My requests in one line: how many are with us and how many we answered (a new answer stands out). */
function RequestsCard({ userId, from, topic }: { userId: string; from: string | null; topic: string | null }) {
  const t = useT()
  const list = useMyRequests()
  const seen = useHelpSeen((s) => s.seen)
  const load = useHelpSeen((s) => s.load)
  useEffect(() => load(userId), [load, userId])
  const open = list.data?.filter((r) => r.status === 'OPEN').length ?? 0
  const replied = list.data?.filter((r) => r.status === 'WAITING').length ?? 0
  const fresh = unreadReplies(list.data, seen).length
  return (
    // The screen Help was opened from goes along: "Ask something new" there is about it, and Done goes back to it
    <Link to="/help/requests" state={{ from: true, helpFrom: from, topic }} className="block">
      <Card className="flex items-center justify-between gap-3 hover:bg-raised">
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{t('help.myRequests')}</span>
          <span className="text-sm text-muted">
            {list.data === undefined
              ? t('help.requestsSub')
              : list.data.length === 0
                ? t('help.noRequests')
                : t('help.requestsCounts', { open, replied })}
          </span>
          {fresh > 0 && <span className="text-sm font-semibold text-accent">{t('help.newReplies', { count: fresh })}</span>}
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          ›
        </span>
      </Card>
    </Link>
  )
}

/**
 * "Write to us", opened from Help or straight from a link: the message form; without a verified email (or signed
 * out), why it needs one and one tap to add it, with Call us / WhatsApp us above.
 */
function WriteToUs() {
  const t = useT()
  const ready = useReady()
  const [params] = useSearchParams()
  if (ready) return <MessageForm />
  const about = params.get('about')?.slice(0, SUBJECT_MAX) || params.get('topic')?.slice(0, SUBJECT_MAX) || null
  return (
    <Page title={t('help.title')} back language>
      <TalkToUs about={about ?? safeFrom(params.get('from'))} />
      <NeedsEmail />
      <p className="text-center text-sm text-muted">
        {t('help.orEmailUsAt')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </Page>
  )
}

/** The message form (as it always was). */
function MessageForm() {
  const t = useT()
  const shop = useMyShop()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const location = useLocation()
  const [params] = useSearchParams()
  const user = useSession((s) => s.user)!
  const setUser = useSession((s) => s.setUser)
  const DRAFT_KEY = draftKey(user.id)
  const files = useAttachments()
  const from = safeFrom(params.get('from'))
  // What the link fills in (subject at most what the backend takes)
  const [offered] = useState(() => ({ subject: (params.get('about') ?? '').slice(0, SUBJECT_MAX), message: params.get('text') ?? '' }))
  // A draft the person wrote is never replaced: it stays, and they are asked whether to start the linked one instead.
  // The same one again (back from a detour), or one that is only what the app filled in, isn't asked about.
  const [start] = useState(() => {
    const draft = storage.getJson<Draft>(DRAFT_KEY)
    const linked = Boolean(offered.subject || offered.message)
    if (typedByThem(draft)) {
      const same = draft!.subject === offered.subject || !offered.subject
      const sameText = !offered.message || draft!.message.includes(offered.message.trim())
      return { draft: draft!, ask: linked && !(same && sameText) }
    }
    return { draft: linked ? { ...offered, auto: offered } : draft, ask: false }
  })
  const [asking, setAsking] = useState(start.ask)
  const [auto, setAuto] = useState(start.draft?.auto)
  const [subject, setSubject] = useState(start.draft?.subject || '')
  const heading = useRef<HTMLHeadingElement | null>(null)
  const [message, setMessage] = useState(start.draft?.message || '')
  const [busy, setBusy] = useState(false)
  // Back from finishing the profile: the words were kept, the files couldn't be (they go with the page)
  const [error, setError] = useState<string | null>(() => {
    try {
      if (sessionStorage.getItem(FILES_DROPPED) !== null) {
        sessionStorage.removeItem(FILES_DROPPED)
        return t('help.filesDropped')
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
    if (subject.trim() || message.trim()) storage.setJson(DRAFT_KEY, { subject, message, auto } satisfies Draft)
    else storage.remove(DRAFT_KEY)
  }, [subject, message, auto, done, DRAFT_KEY])

  useEffect(() => {
    if (done) heading.current?.focus()   // the form is gone: screen readers hear the ticket number
  }, [done])

  const length = cleanedLength(message)
  const problem =
    length > 0 && length < MESSAGE_MIN
      ? t('help.messageTooShort', { min: MESSAGE_MIN })
      : length > MESSAGE_MAX
        ? t('help.atMost', { max: String(MESSAGE_MAX), length: String(length) })
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
      <Page title={t('help.title')} back="/">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {t('help.sentTicket', { number: done.number })}
        </h2>
        <Banner tone="good">
          {t('help.gotItBefore')} <strong>{done.number}</strong>{t('help.gotItMiddle')}{' '}
          <span className="[overflow-wrap:anywhere]">{done.sentTo}</span>{spaceBefore(t('help.gotItAfter'))}{t('help.gotItAfter')}
        </Banner>
        <p className="text-sm text-muted">
          {t('help.emailedCopy', { number: done.number })}
        </p>
        <Button
          onClick={() => {
            // Need help → My requests → the request: ← goes to the list, and its ← home (Need help is done)
            navigate('/help/requests', { replace: true })
            navigate(`/help/requests/${done.id}`, { state: { fromList: true } })
          }}
        >
          {t('help.seeInMyRequests')}
        </Button>
        {/* Back to the screen Help was opened from (else Home) */}
        <Button variant="secondary" onClick={() => navigate(from ?? '/', { replace: true })}>
          {t('common.done')}
        </Button>
        <ContactUs screen={`${done.number}${subject.trim() ? ` · ${subject.trim()}` : ''}`} heading={t('help.urgentCall')} />
      </Page>
    )
  }

  return (
    <Page title={t('help.title')} back>
      {/* A person is one tap away here too (a barber with "Wrong code" on screen and a customer waiting) */}
      <ContactUs screen={subject.trim() || params.get('topic') || from || t('help.title')} shopCode={shop.data?.shopCode} />
      <Link
        to="/help/requests"
        state={{ from: true, helpFrom: from, topic: params.get('topic') }}
        className="inline-flex min-h-11 items-center self-start text-sm text-link underline"
      >
        {t('help.askedBefore')}
      </Link>
      <p className="text-muted">
        {t('help.intro')}
      </p>
      {asking && (
        <Banner tone="info">
          <p>{t('help.draftKept')}</p>
          <div className="mt-2 flex flex-wrap gap-x-4">
            <button
              type="button"
              className="min-h-11 text-left text-link underline"
              onClick={() => {
                setSubject(offered.subject)
                setMessage(offered.message)
                setAuto(offered)
                setAsking(false)
              }}
            >
              {offered.subject ? t('help.draftReplace', { about: offered.subject }) : t('help.draftReplacePlain')}
            </button>
            <button type="button" className="min-h-11 text-link underline" onClick={() => setAsking(false)}>
              {t('help.draftKeep')}
            </button>
          </div>
        </Banner>
      )}
      <form onSubmit={send} className="flex flex-col gap-4" noValidate>
        <Field
          id="help-subject"
          label={t('help.subjectLabel')}
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t('help.subjectPlaceholder')}
        />
        <TextArea
          id="help-message"
          label={t('help.messageLabel')}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={problem}
          hint={length === 0 ? (files.items.length > 0 ? t('help.atLeastEvenWithFile', { min: MESSAGE_MIN }) : t('help.atLeast', { min: MESSAGE_MIN })) : `${length} / ${MESSAGE_MAX}`}
        />
        {/* A photo or a video says it all: the few words the message needs, in one tap (nothing is sent without them) */}
        {files.items.length > 0 && length < MESSAGE_MIN && (
          <button
            type="button"
            className="min-h-11 self-start rounded-xl border border-line bg-raised px-4 text-left text-sm text-link"
            onClick={() => setMessage((m) => `${m.trim() ? `${m.trim()} ` : ''}${t('help.fileWords')}`)}
          >
            {t('help.fileWordsAdd', { text: t('help.fileWords') })}
          </button>
        )}
        <AttachmentPicker a={files} id="help-files" disabled={busy} />
        {files.sending && <p className="text-sm text-muted">{t('help.filesStillUploading')}</p>}
        {files.failed && <p className="text-sm text-bad">{t('help.fileFailed')}</p>}
        {error && <Banner tone="bad">{t('help.errorKept', { message: error })}</Banner>}
        <Button type="submit" busy={busy} disabled={length < MESSAGE_MIN || length > MESSAGE_MAX || files.sending || files.failed}>
          {t('help.sendToSupport')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted">
        {t('help.orEmailUsAt')}{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </Page>
  )
}
