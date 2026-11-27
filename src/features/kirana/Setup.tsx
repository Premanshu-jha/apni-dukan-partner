import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useProduct, type Unit } from '../../api/kirana'
import {
  setupApi,
  setupKeys,
  uploadKiranaFile,
  useNewLines,
  usePhotosNeeded,
  useSetup,
  useSkippedLines,
  type ListLine,
  type PhotoNeeded,
  type SetupPage,
  type SetupView,
} from '../../api/kiranaSetup'
import { shopKeys, useShop } from '../../api/shop'
import { Banner, Button, Card, Chip, ErrorBanner, ErrorState, Field, Loading, Page, Pill, Sheet, Spinner } from '../../components/ui'
import { t, useT } from '../../i18n'
import { shrinkPhoto } from '../../lib/image'
import { parseQty, parseRupees, qtyText, rupeesInput, toMilli } from '../../lib/kirana'
import { rupees } from '../../lib/money'
import { storage } from '../../lib/storage'
import { cameFrom } from '../shop/Register'
import { WaitingForVisit } from '../shop/Home'
import { MoreButton, outcomeUnknown, outsideLink } from './common'
import { PhotoGuide } from './Guides'
import { ContactUs } from '../../components/ContactUs'
import {
  type NextAction,
  askOwnerHref,
  lineProductName,
  lineProgress,
  nextAction,
  onceRef,
  pageFailureKey,
  percent,
  photoQueue,
  photoRefusalKey,
  photosToTake,
  setupOpen,
  SETUP,
} from './setupSteps'

/**
 * The product setup after Submit, one thing at a time: photograph the pages of the shop's own list (read by AI), add or
 * skip each line with its count, count what has no count, photograph what has no picture, then "I've added all my
 * products" (the owner), which books the field visit. Progress is always on screen ("37 of 412", "37 left") and comes
 * from the backend, so it goes on from where it was left on any phone. Every send is safe to repeat (the backend's
 * clientRef or "the line as it is").
 */

const linkButton = {
  primary: 'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand bg-linear-to-br from-brand to-brand-deep px-5 text-center text-base font-semibold text-brand-ink shadow-lg shadow-brand/25 hover:brightness-110',
  secondary: 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-raised px-5 text-center text-base text-ink hover:bg-line',
}

/** The setup's numbers changed here (a line decided, a photo sent): the screen moves on without reading it all again. */
function adjust(qc: QueryClient, change: (v: SetupView) => Partial<SetupView>) {
  qc.setQueryData<SetupView>(setupKeys.view, (v) => (v ? { ...v, ...change(v) } : v))
}

// ---------- the strip on the counter (the kirana's home) ----------

/**
 * On the counter, while the shop waits for its first visit: one line, "Continue setting up · 37 left ›", to the next
 * step (EF#5). One line, so Scan stays on the first screen of a 360 px phone with a customer waiting; the full card
 * (progress, every step) is the setup's own page. It can't be hidden until the setup is finished; then "What happens
 * next" (the visit), which can be. Read once here (no polling on the counter); the setup's screens follow progress.
 */
export function SetupCard() {
  const t = useT()
  const shop = useShop()
  const waiting = shop.status === 'PENDING_VISIT'
  const setup = useSetup(waiting, false)
  const [seen, setSeen] = useState(() => storage.get(`adp.kiranaWaitingSeen.${shop.id}`) === '1')
  if (!waiting || setup.isPending) return null
  if (setup.isError && !setup.data) return <SetupError retry={() => void setup.refetch()} busy={setup.isFetching} />
  const v = setup.data
  if (!setupOpen(v)) {
    if (shop.myRole !== 'OWNER' || seen) return null
    return (
      <div className="flex flex-col gap-1" data-testid="visit-booked">
        <WaitingForVisit />
        <button
          type="button"
          className="min-h-11 self-end px-2 text-sm text-link underline"
          onClick={() => {
            storage.set(`adp.kiranaWaitingSeen.${shop.id}`, '1')
            setSeen(true)
          }}
        >
          {t('kiranaCounter.hideWaiting')}
        </button>
      </div>
    )
  }
  const a = nextAction(v, shop.myRole === 'OWNER')
  return (
    <Link
      to={stripTo(a)}
      state={{ from: '/kirana/counter' }}
      id="setup-strip"
      className="flex min-h-12 items-center gap-2 rounded-xl border border-brand/50 bg-brand/10 px-3 text-sm font-semibold"
    >
      <span className="min-w-0 flex-1 truncate">{stripText(a)}</span>
      <span aria-hidden>›</span>
    </Link>
  )
}

/** Where the strip goes: straight to the step to do, or the setup's page when there's only waiting or finishing. */
function stripTo(a: NextAction): string {
  return a.kind === 'checkLines' || a.kind === 'count' || a.kind === 'photos' || a.kind === 'photographList' || a.kind === 'retakePages' ? a.to : SETUP
}

/** The strip's one line. */
function stripText(a: NextAction): string {
  switch (a.kind) {
    case 'photographList':
      return t('kiranaSetup.stripStart')
    case 'checkLines':
    case 'count':
    case 'photos':
      return t('kiranaSetup.stripLeft', { count: a.left })
    case 'reading':
      return t('kiranaSetup.stripReading')
    case 'retakePages':
      return t('kiranaSetup.stripRetake', { count: a.pages })
    case 'wait':
      return t('kiranaSetup.stripWaiting')
    case 'finish':
      return t('kiranaSetup.stripFinish')
    case 'askOwner':
      return t('kiranaSetup.stripAskOwner')
    default:
      return t('kiranaSetup.title')
  }
}

function SetupContact() {
  const t = useT()
  const shop = useShop()
  return <ContactUs screen={t('kiranaSetup.title')} shopCode={shop.shopCode} />
}

/** The setup couldn't be read: say so, Try again, and Call us / WhatsApp us (nobody is stuck on it). */
function SetupError({ retry, busy }: { retry: () => void; busy: boolean }) {
  const t = useT()
  const shop = useShop()
  return (
    <Card className="flex flex-col gap-2 border-warn/40">
      <p className="font-semibold">{t('kiranaSetup.title')}</p>
      <p className="text-sm text-bad">{t('kiranaSetup.couldntRead')}</p>
      <Button variant="secondary" busy={busy} onClick={retry}>
        {t('common.retry')}
      </Button>
      <ContactUs screen={t('kiranaSetup.title')} shopCode={shop.shopCode} />
    </Card>
  )
}

/** Where the setup stands, in short lines; the list's lines as a bar ("37 of 412 checked"). */
function Progress({ v }: { v: SetupView }) {
  const t = useT()
  const lines = lineProgress(v)
  const take = photosToTake(v)
  const rows: string[] = [t('kiranaSetup.productsAdded', { count: v.products })]
  if (v.pagesReading) rows.push(t('kiranaSetup.pagesReading', { count: v.pagesReading }))
  if (v.pagesFailed) rows.push(t('kiranaSetup.pagesFailed', { count: v.pagesFailed }))
  if (v.uncounted) rows.push(t('kiranaSetup.toCount', { count: v.uncounted }))
  if (take) rows.push(t('kiranaSetup.photosToTake', { count: take }))
  if (v.photosChecking + v.photosFinding) rows.push(t('kiranaSetup.photosChecking', { count: v.photosChecking + v.photosFinding }))
  return (
    <div className="flex flex-col gap-2" aria-label={t('kiranaSetup.progressLabel')}>
      {lines.total > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            <span className="font-semibold">{t('kiranaSetup.linesChecked', { done: lines.done, total: lines.total })}</span>
            {lines.left > 0 && <span className="text-muted"> · {t('kiranaSetup.left', { count: lines.left })}</span>}
          </p>
          <Bar done={lines.done} total={lines.total} />
        </div>
      )}
      <ul className="flex flex-col gap-0.5 text-sm">
        {rows.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  )
}

function Bar({ done, total }: { done: number; total: number }) {
  const p = percent(done, total)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${p}%` }} />
    </div>
  )
}

/**
 * The one big button for what to do next, and under it why "I've added all my products" was refused (kept here: the
 * refusal changes the next step, and the reason must stay on screen with its fix).
 */
function NextStep({ v }: { v: SetupView }) {
  const [refusal, setRefusal] = useState<unknown>(null)
  const fix = finishFix(refusal, v)
  return (
    <div className="flex flex-col gap-2">
      <StepButton v={v} onRefused={setRefusal} />
      {refusal !== null && (
        <SendError error={refusal} unsure="kiranaSetup.finishUnsure" />
      )}
      {fix && v.nextStep === 'FINISH' && (
        <Link to={fix.to} className={linkButton.secondary}>
          {fix.label}
        </Link>
      )}
    </div>
  )
}

/** The button itself, from the backend's nextStep, with the words for it. */
function StepButton({ v, onRefused }: { v: SetupView; onRefused: (e: unknown) => void }) {
  const t = useT()
  const shop = useShop()
  const owner = shop.myRole === 'OWNER'
  const setup = useSetup()
  const a = nextAction(v, owner)
  switch (a.kind) {
    case 'photographList':
      return (
        <div className="flex flex-col gap-2">
          <Link to={a.to} className={linkButton.primary}>
            {t('kiranaSetup.nextPhotographList')}
          </Link>
          <Link to={`/kirana/products/new?from=${encodeURIComponent(SETUP)}`} className={linkButton.secondary}>
            {t('kiranaSetup.addOneByOne')}
          </Link>
        </div>
      )
    case 'checkLines':
      return (
        <Link to={a.to} className={linkButton.primary}>
          {t('kiranaSetup.nextCheckLines', { count: a.left })}
        </Link>
      )
    case 'reading':
      return (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm">
            <Spinner small />
            {t('kiranaSetup.readingWait')}
          </p>
          <Button variant="secondary" busy={setup.isFetching} onClick={() => void setup.refetch()}>
            {t('kiranaSetup.checkAgain')}
          </Button>
          <Link to={`${SETUP}/list`} className={linkButton.secondary}>
            {t('kiranaSetup.photographNextPage')}
          </Link>
        </div>
      )
    case 'retakePages':
      return (
        <Link to={a.to} className={linkButton.primary}>
          {t('kiranaSetup.nextRetake', { count: a.pages })}
        </Link>
      )
    case 'count':
      return (
        <Link to={a.to} className={linkButton.primary}>
          {t('kiranaSetup.nextCount', { count: a.left })}
        </Link>
      )
    case 'photos':
      return (
        <Link to={a.to} className={linkButton.primary}>
          {t('kiranaSetup.nextPhotos', { count: a.left })}
        </Link>
      )
    case 'wait':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('kiranaSetup.waitChecking', { count: a.checking })}</p>
          <Button variant="secondary" busy={setup.isFetching} onClick={() => void setup.refetch()}>
            {t('kiranaSetup.checkAgain')}
          </Button>
          {v.photosFinding > 0 && (
            <Link to={a.to} className="min-h-11 py-2 text-sm text-link underline">
              {t('kiranaSetup.photographAnyway')}
            </Link>
          )}
        </div>
      )
    case 'finish':
      return <FinishButton onRefused={onRefused} />
    case 'askOwner':
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('kiranaSetup.askOwnerToFinish')}</p>
          <a href={askOwnerHref(t('kiranaSetup.askOwnerMessage', { shop: shop.name }))} {...outsideLink()} className={linkButton.secondary}>
            {t('kiranaSetup.askOwnerWhatsApp')}
          </a>
        </div>
      )
    default:
      return null
  }
}

/**
 * A send that failed: a refusal as the shared ErrorBanner (the red line and "Still not working? Write to us", EF#3); an
 * answer that never came in amber, saying a retry is safe.
 */
function SendError({ error, unsure }: { error: unknown; unsure: string }) {
  const t = useT()
  if (outcomeUnknown(error)) return <Banner tone="warn">{t(unsure, { message: messageOf(error) })}</Banner>
  return <ErrorBanner message={messageOf(error)} />
}

/** Where a refusal of "I've added all my products" is fixed (its code), as one tap. */
function finishFix(e: unknown, v: SetupView): { to: string; label: string } | null {
  if (isApiError(e, 'LINES_TO_CHECK')) return { to: `${SETUP}/lines`, label: t('kiranaSetup.fixLines') }
  if (isApiError(e, 'PAGES_FAILED')) {
    // The first page to take again, not the setup page the button is on (CD#12)
    const failed = v.pages.find((p) => p.status === 'FAILED')
    return { to: failed ? `${SETUP}/list?retake=${encodeURIComponent(failed.readId)}` : `${SETUP}/list`, label: t('kiranaSetup.fixPages') }
  }
  if (isApiError(e, 'PRODUCTS_NOT_COUNTED')) return { to: `${SETUP}/count`, label: t('kiranaSetup.fixCount') }
  if (isApiError(e, 'PHOTOS_NEEDED')) return { to: `${SETUP}/photos`, label: t('kiranaSetup.fixPhotos') }
  if (isApiError(e, 'NO_PRODUCTS')) return { to: `${SETUP}/list`, label: t('kiranaSetup.fixNoProducts') }
  return null
}

/** "I've added all my products" (the owner), asked once more first: the field visit is booked. A second tap is the same. */
function FinishButton({ onRefused }: { onRefused: (e: unknown) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  async function finish() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    onRefused(null)
    try {
      qc.setQueryData(setupKeys.view, await setupApi.finish())
      setAsking(false)
      void qc.invalidateQueries({ queryKey: shopKeys.mine })
    } catch (e) {
      setAsking(false)
      onRefused(e)
      // Something changed meanwhile (a page still reading, a photo refused): the card shows the step it needs now
      if (!outcomeUnknown(e)) void qc.invalidateQueries({ queryKey: setupKeys.view })
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button className="min-h-14 w-full" busy={busy} onClick={() => setAsking(true)}>
        {t('kiranaSetup.finish')}
      </Button>
      <Sheet open={asking} title={t('kiranaSetup.finishAskTitle')} onClose={() => !busy && setAsking(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('kiranaSetup.finishAskBody')}</p>
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
            {t('kiranaSetup.finishNotYet')}
          </Button>
          <Button busy={busy} onClick={() => void finish()}>
            {t('kiranaSetup.finishYes')}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

// ---------- the setup's own page ----------

/** /kirana/setup: every step and every page of the list, with the next step on top. */
export function SetupHome() {
  const t = useT()
  const location = useLocation()
  const setup = useSetup()
  const back = cameFrom(location, '/kirana/counter')
  if (setup.isPending) return <Page back={back} title={t('kiranaSetup.title')}><Loading /></Page>
  if (setup.isError && !setup.data) {
    return (
      <Page back={back} title={t('kiranaSetup.title')}>
        <ErrorState message={messageOf(setup.error)} onRetry={() => setup.refetch()} />
        <SetupContact />
      </Page>
    )
  }
  const v = setup.data
  return (
    <Page back={back} title={t('kiranaSetup.title')}>
      <Card className="flex flex-col gap-3">
        {setupOpen(v) ? (
          <>
            <p className="text-sm text-muted">{v.readyAt ? t('kiranaSetup.beforeApproval') : t('kiranaSetup.why')}</p>
            <Progress v={v} />
            <NextStep v={v} />
          </>
        ) : (
          <>
            <p className="font-semibold">{t('kiranaSetup.doneTitle')}</p>
            <p className="text-sm text-muted">{t('kiranaSetup.doneBody')}</p>
            <Progress v={v} />
          </>
        )}
      </Card>
      {v.pages.length > 0 && <Pages pages={v.pages} />}
      <div className="flex flex-col gap-2">
        <p className="font-semibold">{t('kiranaSetup.otherWays')}</p>
        {v.pagesLeft > 0 && (
          <Link to={`${SETUP}/list`} className={linkButton.secondary}>
            {v.pages.length ? t('kiranaSetup.photographNextPage') : t('kiranaSetup.nextPhotographList')}
          </Link>
        )}
        <Link to={`/kirana/products/new?from=${encodeURIComponent(SETUP)}`} className={linkButton.secondary}>
          {t('kiranaSetup.addOneByOne')}
        </Link>
        {v.linesSkipped > 0 && (
          <Link to={`${SETUP}/skipped`} className={linkButton.secondary}>
            {t('kiranaSetup.skippedLink', { count: v.linesSkipped })}
          </Link>
        )}
      </div>
    </Page>
  )
}

/** The pages of the list sent so far, each with how it stands; one that couldn't be read: why, and take it again. */
function Pages({ pages }: { pages: SetupPage[] }) {
  const t = useT()
  const qc = useQueryClient()
  const [deleting, setDeleting] = useState<SetupPage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function discard(p: SetupPage) {
    setBusy(true)
    setError(null)
    try {
      await setupApi.discardPage(p.readId)
      setDeleting(null)
    } catch (e) {
      // Already gone (another phone): the list is read again either way
      if (!isApiError(e, 'READ_NOT_FOUND')) setError(messageOf(e))
      else setDeleting(null)
    } finally {
      setBusy(false)
      void qc.invalidateQueries({ queryKey: setupKeys.all })
    }
  }
  return (
    <section id="pages" aria-labelledby="pages-heading" className="flex flex-col gap-2">
      <h2 id="pages-heading" className="font-semibold">
        {t('kiranaSetup.pagesTitle')}
      </h2>
      <ul className="flex flex-col gap-2">
        {pages.map((p) => (
          <li key={p.readId} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{p.recount ? t('kiranaSetup.recountPage', { page: p.pageNo }) : t('kiranaSetup.page', { page: p.pageNo })}</span>
              {p.status === 'READING' ? (
                <Pill tone="muted">{t('kiranaSetup.pageReading')}</Pill>
              ) : p.status === 'FAILED' ? (
                <Pill tone="bad">{t('kiranaSetup.pageFailed')}</Pill>
              ) : p.linesToCheck > 0 ? (
                <Pill tone="warn">{t('kiranaSetup.left', { count: p.linesToCheck })}</Pill>
              ) : (
                <Pill tone="good">{t('kiranaSetup.pageDone')}</Pill>
              )}
            </div>
            {p.status === 'READ' && (
              <p className="text-sm text-muted">{t('kiranaSetup.pageCounts', { added: p.linesAdded, skipped: p.linesSkipped, left: p.linesToCheck })}</p>
            )}
            {p.status === 'READ' && p.linesLeftOut > 0 && <Banner tone="warn">{t('kiranaSetup.pageLeftOut', { count: p.linesLeftOut })}</Banner>}
            {p.status === 'FAILED' && (
              <>
                <p className="text-sm text-bad">{pageFailureKey(p.failureCode) ? t(pageFailureKey(p.failureCode)!) : (p.failure ?? t('kiranaSetup.fail_OTHER'))}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Link to={`${SETUP}/list?retake=${encodeURIComponent(p.readId)}`} className={linkButton.secondary}>
                    {t('kiranaSetup.retakePage')}
                  </Link>
                  <Button variant="danger" onClick={() => setDeleting(p)}>
                    {t('kiranaSetup.deletePage')}
                  </Button>
                </div>
                {/* Reading is off or busy (not the photo's fault): a person can help now */}
                {(p.failureCode === 'READING_OFF' || p.failureCode === 'TRY_LATER') && <ContactUs screen={t('kiranaSetup.listTitle')} />}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <ErrorBanner message={error} />}
      <Sheet open={deleting !== null} title={deleting ? t('kiranaSetup.deleteAskTitle', { page: deleting.pageNo }) : ''} onClose={() => !busy && setDeleting(null)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('kiranaSetup.deleteAskBody')}</p>
          <Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>
            {t('kiranaSetup.keepIt')}
          </Button>
          <Button variant="danger" busy={busy} onClick={() => deleting && void discard(deleting)}>
            {t('kiranaSetup.yesDelete')}
          </Button>
        </div>
      </Sheet>
    </section>
  )
}

// ---------- taking a photo ----------

/** Two big buttons: the camera, or a photo already on the phone (a PDF too, for a list). */
function PickPhoto({
  label,
  busy,
  disabled,
  pdf = false,
  onPicked,
}: {
  label: string
  busy: boolean
  disabled?: boolean
  pdf?: boolean
  onPicked: (file: File) => void
}) {
  const t = useT()
  const camera = useId()
  const gallery = useId()
  const off = busy || disabled
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onPicked(file)
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={camera} className={`${linkButton.primary} cursor-pointer ${off ? 'pointer-events-none opacity-60' : ''}`}>
        {busy ? <Spinner small label={t('kiranaSetup.sending')} /> : label}
      </label>
      <input id={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={label} disabled={off} onChange={pick} />
      <label htmlFor={gallery} className={`${linkButton.secondary} cursor-pointer ${off ? 'pointer-events-none opacity-60' : ''}`}>
        {t('kiranaSetup.fromGallery')}
      </label>
      <input
        id={gallery}
        type="file"
        accept={pdf ? 'image/*,application/pdf' : 'image/*'}
        className="sr-only"
        aria-label={t('kiranaSetup.fromGallery')}
        disabled={off}
        onChange={pick}
      />
    </div>
  )
}

/** A photo made small for sending (a PDF as it is). */
async function forSending(file: File): Promise<{ body: Blob; name: string }> {
  if (file.type === 'application/pdf') return { body: file, name: 'list.pdf' }
  return { body: await shrinkPhoto(file), name: 'photo.jpg' }
}

/** /kirana/setup/list: one page of the shop's list, photographed after the guide; then the next page. */
export function ListPhoto() {
  const t = useT()
  const qc = useQueryClient()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const retake = params.get('retake')
  const setup = useSetup()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [sent, setSent] = useState(0)
  /** A page uploaded whose sending had no answer: tried again with the same file and clientRef. */
  const [pending, setPending] = useState<string | null>(null)
  /** The same photo picked again (the backend keeps one file per photo): refused here, or it would be read twice. */
  const [dupe, setDupe] = useState<number | null>(null)
  const sentHere = useRef<Set<string>>(new Set())
  const sending = useRef(false)
  // A recount page that couldn't be read is taken again as a recount (CD#11), so its counts are still taken
  const retakeRecount = Boolean(retake && setup.data?.pages.find((p) => p.readId === retake)?.recount)

  async function send(fileId: string) {
    const once = onceRef(`page.${fileId}`)
    setPending(fileId)
    await setupApi.sendPage(once.ref, fileId, retakeRecount)
    once.forget()
    setPending(null)
    sentHere.current.add(fileId)
    // A page taken again: the one that couldn't be read goes (its lines were none); counted as gone only if it went
    const discarded = retake ? await setupApi.discardPage(retake).then(() => true, () => false) : false
    setSent((n) => n + 1)
    adjust(qc, (v) => ({ pagesReading: v.pagesReading + 1, pagesFailed: discarded ? Math.max(0, v.pagesFailed - 1) : v.pagesFailed }))
    void qc.invalidateQueries({ queryKey: setupKeys.view })
  }

  async function run(work: () => Promise<void>) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const picked = (file: File) =>
    void run(async () => {
      const { body, name } = await forSending(file)
      const stored = await uploadKiranaFile(body, name, 'BILL')
      setDupe(null)
      if (stored.duplicate) {
        const page = setup.data?.pages.find((p) => p.fileId === stored.id)
        if (page || sentHere.current.has(stored.id)) {
          setDupe(page?.pageNo ?? 0)
          return
        }
      }
      await send(stored.id)
    })
  // An answer that never came: only the same page is tried again until it's settled (AB#10); a new photo would be a
  // second page if the first did arrive
  const unsure = error !== null && pending !== null && outcomeUnknown(error)

  const full = isApiError(error, 'TOO_MANY_PAGES') || isApiError(error, 'TOO_MANY_PAGES_TODAY')
  const pageNo = (setup.data?.pages.filter((p) => !p.recount).length ?? 0) + (retake ? 0 : 1)
  return (
    <Page back={cameFrom(location, SETUP)} title={t('kiranaSetup.listTitle')} leaveWarning={busy ? t('kiranaSetup.leaveSending') : null}>
      {sent > 0 && !retake ? (
        <Banner tone="good">{t('kiranaSetup.pageSent', { count: sent })}</Banner>
      ) : (
        <p className="text-sm text-muted">{t('kiranaSetup.listIntro')}</p>
      )}
      {retake && sent === 0 && <Banner tone="info">{t('kiranaSetup.retakeIntro')}</Banner>}
      <PhotoGuide kind="list" />
      {!(retake && sent > 0) && (
        <>
          <p className="font-semibold">{t('kiranaSetup.pageNo', { page: Math.max(1, pageNo) })}</p>
          <PickPhoto label={sent ? t('kiranaSetup.photographNextPage') : t('kiranaSetup.takePagePhoto')} busy={busy} disabled={unsure} pdf onPicked={picked} />
        </>
      )}
      {error !== null && (
        <SendError error={error} unsure="kiranaSetup.sendUnsure" />
      )}
      {dupe !== null && <Banner tone="warn">{dupe ? t('kiranaSetup.samePhoto', { page: dupe }) : t('kiranaSetup.samePhotoHere')}</Banner>}
      {unsure && (
        <>
          <Button busy={busy} onClick={() => void run(() => send(pending!))}>
            {t('kiranaSetup.tryAgain')}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPending(null)
              setError(null)
            }}
          >
            {t('kiranaSetup.sendOther')}
          </Button>
        </>
      )}
      {full && (
        <>
          <Link to={`/kirana/products/new?from=${encodeURIComponent(SETUP)}`} className={linkButton.secondary}>
            {t('kiranaSetup.addOneByOne')}
          </Link>
          <ContactUs screen={t('kiranaSetup.listTitle')} />
        </>
      )}
      {(sent > 0 || retake) && (
        <Link to={SETUP} className={linkButton.secondary}>
          {t('kiranaSetup.backToSetup')}
        </Link>
      )}
    </Page>
  )
}

// ---------- checking the lines ----------

/** What was typed for a line, kept in this tab (leaving the screen for a moment loses nothing). */
interface LineDraft {
  choice: string | null
  name: string
  unit: Unit
  price: string
  count: string
}

function readLineDraft(id: string): LineDraft | null {
  try {
    const raw = sessionStorage.getItem(`adp.kiranaLine.${id}`)
    return raw ? (JSON.parse(raw) as LineDraft) : null
  } catch {
    return null
  }
}

function writeLineDraft(id: string, d: LineDraft | null) {
  try {
    if (d) sessionStorage.setItem(`adp.kiranaLine.${id}`, JSON.stringify(d))
    else sessionStorage.removeItem(`adp.kiranaLine.${id}`)
  } catch {
    /* storage blocked: the typing stays on this screen only */
  }
}

/** /kirana/setup/lines: the list's lines one at a time, each added (with its count) or skipped, saved as decided. */
export function CheckLines() {
  const t = useT()
  const qc = useQueryClient()
  const setup = useSetup()
  const lines = useNewLines()
  const [decided, setDecided] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState<string | null>(null)
  const queue = (lines.data?.items ?? []).filter((l) => l.status === 'NEW' && !decided.has(l.id))
  const line = queue[0] ?? null
  const toCheck = setup.data?.linesToCheck ?? 0
  const reading = setup.data?.pagesReading ?? 0

  // These 20 done: the next ones (the decided are gone from the first page), also when a page just finished reading.
  // Never a loop (AB#1, CD#3): one read per state of what is known (lines decided here, the setup's count). When that
  // read brings nothing new though the setup said more (another phone checked them, a page was deleted), the setup is
  // read once instead, and the screen shows where things really stand
  const refetch = lines.refetch
  const askKey = `${decided.size}|${toCheck}`
  const [asked, setAsked] = useState<string | null>(null)
  const wantMore = queue.length === 0 && Boolean(lines.data) && !lines.isFetching && (lines.data!.next !== null || toCheck > 0) && asked !== askKey
  useEffect(() => {
    if (!wantMore) return
    setAsked(askKey)
    void refetch().then((r) => {
      const fresh = (r.data?.items ?? []).filter((l) => l.status === 'NEW' && !decided.has(l.id))
      if (fresh.length === 0) void qc.invalidateQueries({ queryKey: setupKeys.view })
    })
  }, [wantMore, askKey, refetch, decided, qc])

  function done(l: ListLine, how: 'added' | 'skipped' | 'gone', message?: string, madeNew = false) {
    writeLineDraft(l.id, null)
    setDecided((s) => new Set(s).add(l.id))
    setNote(message ?? null)
    adjust(qc, (v) => ({
      linesToCheck: Math.max(0, v.linesToCheck - 1),
      linesAdded: v.linesAdded + (how === 'added' ? 1 : 0),
      linesSkipped: v.linesSkipped + (how === 'skipped' ? 1 : 0),
      // Only a new product adds one (a line onto one the shop has doesn't), AB#11
      products: v.products + (madeNew ? 1 : 0),
    }))
    // The products changed: the counter's search reads them again when next shown (not now)
    if (how === 'added') void qc.invalidateQueries({ queryKey: kiranaKeys.productsAll, refetchType: 'none' })
    // The last line: what comes next is the backend's to say (count, photos, finish)
    if ((qc.getQueryData<SetupView>(setupKeys.view)?.linesToCheck ?? 0) === 0) void qc.invalidateQueries({ queryKey: setupKeys.view })
  }

  const progress = setup.data ? lineProgress(setup.data) : null
  return (
    <Page back={SETUP} title={t('kiranaSetup.linesTitle')}>
      {progress && progress.total > 0 && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <p className="text-sm">
            <span className="font-semibold">{t('kiranaSetup.lineOf', { at: progress.at, total: progress.total })}</span>
            <span className="text-muted"> · {t('kiranaSetup.left', { count: progress.left })}</span>
          </p>
          <Bar done={progress.done} total={progress.total} />
        </div>
      )}
      {note && <Banner tone="info">{note}</Banner>}
      {lines.isPending ? (
        <Loading />
      ) : lines.isError && !lines.data ? (
        <ErrorState message={messageOf(lines.error)} onRetry={() => lines.refetch()} />
      ) : line ? (
        <LineForm key={line.id} line={line} onDone={done} />
      ) : lines.isFetching || wantMore ? (
        <Loading />
      ) : reading > 0 ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <Spinner />
          <p>{t('kiranaSetup.readingWait')}</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-semibold">{toCheck > 0 ? t('kiranaSetup.linesElsewhere') : t('kiranaSetup.allLinesChecked')}</p>
          {toCheck > 0 && (
            <Button variant="secondary" busy={setup.isFetching} onClick={() => void qc.invalidateQueries({ queryKey: setupKeys.all })}>
              {t('kiranaSetup.checkAgain')}
            </Button>
          )}
          {setup.data && setupOpen(setup.data) && toCheck === 0 && <NextStep v={setup.data} />}
          <Link to={SETUP} className={linkButton.secondary}>
            {t('kiranaSetup.backToSetup')}
          </Link>
        </Card>
      )}
      {(setup.data?.linesSkipped ?? 0) > 0 && (
        <Link to={`${SETUP}/skipped`} className="min-h-11 self-start py-2 text-sm text-link underline">
          {t('kiranaSetup.skippedLink', { count: setup.data!.linesSkipped })}
        </Link>
      )}
    </Page>
  )
}

/** One line: what it is (one of the suggestions, or a new product), how many are on the shelf, then Add or Skip. */
function LineForm({ line, onDone }: { line: ListLine; onDone: (l: ListLine, how: 'added' | 'skipped' | 'gone', message?: string, madeNew?: boolean) => void }) {
  const t = useT()
  const options = line.suggestions.slice(0, 3)
  const [d, setD] = useState<LineDraft>(
    () =>
      readLineDraft(line.id) ?? {
        choice: line.sure && options[0] ? 's0' : options.length === 0 ? 'new' : null,
        name: lineProductName(line),
        unit: line.byWeight ? 'KG' : 'PIECE',
        price: line.mrpPaise ? rupeesInput(line.mrpPaise) : '',
        count: '',
      },
  )
  useEffect(() => writeLineDraft(line.id, d), [line.id, d])
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState<'add' | 'skip' | null>(null)
  const [error, setError] = useState<unknown>(null)
  /** ALREADY_COUNTED: the product and its count, to add this count to it or replace it. */
  const [counted, setCounted] = useState<{ name: string; stock: number } | null>(null)
  /** NAME_TAKEN: the product the shop already has with this name, offered instead. */
  const [taken, setTaken] = useState<{ id: string; name: string } | null>(null)
  const sending = useRef(false)

  const set = (change: Partial<LineDraft>) => {
    setD((x) => ({ ...x, ...change }))
    setError(null)
  }
  const picked = d.choice?.startsWith('s') ? options[Number(d.choice.slice(1))] ?? null : null
  const takenPicked = d.choice === 'taken' && taken
  const yours = Boolean(takenPicked || picked?.productId)
  // The count is checked the way the backend checks it (AB#7, CD#5): a product the shop has by its own unit (read here:
  // a suggestion doesn't say it), a new one by the unit picked. A catalogue item's unit isn't known here: kg-style
  // (parts allowed), and the backend's answer names the count if it can't be
  const yourId = takenPicked ? taken.id : picked?.productId ?? null
  const yourProduct = useQuery({ queryKey: kiranaKeys.product(yourId ?? ''), queryFn: () => kiranaApi.product(yourId!), enabled: yourId !== null, staleTime: 60_000 })
  const yourUnit = yourId ? yourProduct.data?.product.unit ?? null : null
  const shownUnit: Unit = d.choice === 'new' ? d.unit : yourUnit ?? (line.byWeight ? 'KG' : 'PIECE')
  const checkUnit: Unit = d.choice === 'new' ? d.unit : yourUnit ?? 'KG'
  const unitPending = yourId !== null && yourProduct.isPending
  const qty = parseQty(d.count, checkUnit, { zeroAllowed: true })
  const price = d.price.trim() ? parseRupees(d.price, { maxPaise: 10_000_000 }) : null
  const nameErr = d.choice === 'new' && d.name.trim().length < 2 ? t('kiranaProducts.nameErrNew') : null
  const priceErr = d.choice === 'new' && !price ? t('kiranaSetup.enterPrice') : price && 'error' in price ? price.error : null

  async function send(body: Parameters<typeof setupApi.decide>[1], how: 'added' | 'skipped') {
    if (sending.current) return
    sending.current = true
    setBusy(how === 'added' ? 'add' : 'skip')
    setError(null)
    try {
      const saved = await setupApi.decide(line.id, body)
      setCounted(null)
      // Added before with another count (an answer lost, then the count changed): the backend keeps the first. Said,
      // never passed off as this count (AB#4)
      const sent = 'quantity' in body ? Math.round(body.quantity * 1000) : null
      const kept = saved.counted !== null && saved.counted !== undefined ? toMilli(saved.counted) : null
      const other = sent !== null && kept !== null && kept !== sent && !('addToCount' in body && body.addToCount)
      onDone(line, how, other ? t('kiranaSetup.lineSavedAs', { count: qtyText(kept!), name: saved.productName ?? '' }) : undefined, how === 'added' && !('productId' in body))
    } catch (e) {
      if (isApiError(e, 'LINE_NOT_FOUND')) onDone(line, 'gone', t('kiranaSetup.lineGone'))
      else if (isApiError(e, 'LINE_ADDED') || isApiError(e, 'AUTO_COUNTED')) onDone(line, 'gone', messageOf(e))
      else if (isApiError(e, 'ALREADY_COUNTED')) setCounted({ name: String(e.details.name ?? ''), stock: Number(e.details.stock ?? 0) })
      else {
        if (isApiError(e, 'NAME_TAKEN') && typeof e.details.productId === 'string') {
          setTaken({ id: e.details.productId, name: String(e.details.name ?? d.name) })
        }
        setError(e)
      }
    } finally {
      sending.current = false
      setBusy(null)
    }
  }

  function add(addToCount?: boolean) {
    setTouched(true)
    if (d.choice === null) return setError(new Error(t('kiranaSetup.pickWhatItIs')))
    if ('error' in qty || nameErr || priceErr) return
    const quantity = qty.milli / 1000
    if (takenPicked) return void send({ action: 'ADD', quantity, productId: taken.id, addToCount }, 'added')
    if (picked?.productId) return void send({ action: 'ADD', quantity, productId: picked.productId, addToCount }, 'added')
    if (picked?.itemId) {
      return void send({ action: 'ADD', quantity, itemId: picked.itemId, pricePaise: price && 'paise' in price ? price.paise : undefined }, 'added')
    }
    void send({ action: 'ADD', quantity, name: d.name.trim(), unit: d.unit, pricePaise: price && 'paise' in price ? price.paise : undefined }, 'added')
  }

  const fe = (f: string) => fieldError(error, f)
  const plainError = error instanceof Error && !isApiError(error) ? error.message : null
  const listQty = line.quantity !== null && line.quantity !== undefined ? qtyText(toMilli(line.quantity)) : null
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-1">
        <p className="text-xs text-muted">{t('kiranaSetup.pageLine', { page: line.pageNo ?? 1, line: line.lineNo })}</p>
        <p className="text-xl font-semibold break-words">{line.wording}</p>
        <p className="text-sm text-muted">
          {[line.mrpPaise ? t('kiranaSetup.mrp', { price: rupees(line.mrpPaise) }) : null, listQty ? t('kiranaSetup.listSays', { qty: listQty }) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </Card>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t('kiranaSetup.whatIsIt')}</legend>
        {taken && (
          <Choice selected={d.choice === 'taken'} onClick={() => set({ choice: 'taken' })}>
            <span className="block font-medium break-words">{taken.name}</span>
            <span className="block text-xs text-muted">{t('kiranaSetup.yourProduct')}</span>
          </Choice>
        )}
        {options.map((s, i) => (
          <Choice key={`${s.productId ?? s.itemId}-${i}`} selected={d.choice === `s${i}`} onClick={() => set({ choice: `s${i}`, price: s.pricePaise ? rupeesInput(s.pricePaise) : d.price })}>
            <span className="block font-medium break-words">{s.name}</span>
            <span className="block text-xs text-muted">
              {s.productId ? t('kiranaSetup.yourProduct') : t('kiranaSetup.fromCatalogue')}
              {s.pricePaise ? ` · ${rupees(s.pricePaise)}` : ''}
              {i === 0 && line.sure ? ` · ${t('kiranaSetup.bestMatch')}` : ''}
            </span>
          </Choice>
        ))}
        <Choice selected={d.choice === 'new'} onClick={() => set({ choice: 'new' })}>
          <span className="block font-medium">{t('kiranaSetup.newProduct')}</span>
          <span className="block text-xs text-muted break-words">{lineProductName(line)}</span>
        </Choice>
      </fieldset>

      {d.choice === 'new' && (
        <Card className="flex flex-col gap-3">
          <Field id="line-name" label={t('kiranaProducts.nameLabel')} value={d.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} error={(touched && nameErr) || fe('name')} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted">{t('kiranaProducts.soldBy')}</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('kiranaProducts.soldBy')}>
              <Chip selected={d.unit === 'PIECE'} onClick={() => set({ unit: 'PIECE' })}>
                {t('kiranaProducts.unitPiece')}
              </Chip>
              <Chip selected={d.unit === 'KG'} onClick={() => set({ unit: 'KG' })}>
                {t('kiranaProducts.unitKg')}
              </Chip>
            </div>
          </div>
          <Field
            id="line-price"
            label={d.unit === 'KG' ? t('kiranaProducts.priceKgLabel') : t('kiranaProducts.priceOneLabel')}
            inputMode="decimal"
            value={d.price}
            onChange={(e) => set({ price: e.target.value })}
            error={(touched && priceErr) || fe('pricePaise')}
          />
        </Card>
      )}
      {picked?.itemId && !picked.productId && (
        <Field
          id="line-price"
          label={t('kiranaSetup.yourPrice')}
          hint={t('kiranaSetup.yourPriceHint')}
          inputMode="decimal"
          value={d.price}
          onChange={(e) => set({ price: e.target.value })}
          error={(touched && price && 'error' in price ? price.error : undefined) || fe('pricePaise')}
        />
      )}

      <Card className="flex flex-col gap-3">
        <Field
          id="line-count"
          label={shownUnit === 'KG' ? t('kiranaSetup.countKgLabel') : t('kiranaSetup.countLabel')}
          hint={yours ? t('kiranaSetup.countHintYours') : t('kiranaSetup.countHint')}
          inputMode="decimal"
          value={d.count}
          onChange={(e) => set({ count: e.target.value })}
          error={(touched && 'error' in qty ? (d.count.trim() ? qty.error : t('kiranaSetup.countNeeded')) : undefined) || fe('quantity')}
        />
        <div className="flex flex-wrap gap-2">
          {listQty && listQty !== '0' && (
            <Chip selected={d.count === listQty} onClick={() => set({ count: listQty })}>
              {t('kiranaSetup.asOnList', { qty: listQty })}
            </Chip>
          )}
          <Chip selected={d.count === '0'} onClick={() => set({ count: '0' })}>
            {t('kiranaSetup.noneOnShelf')}
          </Chip>
        </div>
      </Card>

      {plainError && <Banner tone="bad">{plainError}</Banner>}
      {isApiError(error) && !['quantity', 'pricePaise', 'name', 'unit'].some((f) => fe(f)) && (
        <SendError error={error} unsure="kiranaSetup.decideUnsure" />
      )}
      {isApiError(error, 'NAME_TAKEN') && taken && d.choice !== 'taken' && (
        <Button variant="secondary" onClick={() => set({ choice: 'taken' })}>
          {t('kiranaSetup.useTaken', { name: taken.name })}
        </Button>
      )}

      <Button className="min-h-14" busy={busy === 'add' || unitPending} disabled={busy !== null} onClick={() => add()}>
        {t('kiranaSetup.addAndNext')}
      </Button>
      <Button variant="secondary" busy={busy === 'skip'} disabled={busy !== null} onClick={() => void send({ action: 'SKIP' }, 'skipped')}>
        {t('kiranaSetup.skipLine')}
      </Button>
      <p className="text-center text-xs text-muted">{t('kiranaSetup.skipHint')}</p>

      <Sheet open={counted !== null} title={counted ? t('kiranaSetup.alreadyCountedTitle', { name: counted.name }) : ''} onClose={() => busy === null && setCounted(null)}>
        {counted && 'milli' in qty && (
          <div className="flex flex-col gap-3">
            <p className="text-muted">{t('kiranaSetup.alreadyCountedBody', { name: counted.name, stock: qtyText(toMilli(counted.stock)), count: qtyText(qty.milli) })}</p>
            <Button busy={busy === 'add'} onClick={() => add(true)}>
              {t('kiranaSetup.addToCount', { total: qtyText(toMilli(Math.max(0, counted.stock)) + qty.milli) })}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => add(false)}>
              {t('kiranaSetup.replaceCount', { count: qtyText(qty.milli) })}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/** A big choice (a radio button drawn as a card). */
function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left ${selected ? 'border-brand bg-brand/15' : 'border-line bg-surface hover:bg-raised'}`}
    >
      <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-brand' : 'border-line'}`}>
        {selected && <span className="h-3 w-3 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

/** /kirana/setup/skipped: the lines skipped, each one tap from coming back to check. */
export function SkippedLines() {
  const t = useT()
  const qc = useQueryClient()
  const list = useSkippedLines()
  const [back, setBack] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function undo(l: ListLine) {
    setBusy(l.id)
    setError(null)
    try {
      await setupApi.decide(l.id, { action: 'UNDO' })
      setBack((s) => new Set(s).add(l.id))
      adjust(qc, (v) => ({ linesSkipped: Math.max(0, v.linesSkipped - 1), linesToCheck: v.linesToCheck + 1 }))
      void qc.invalidateQueries({ queryKey: setupKeys.lines('NEW') })
    } catch (e) {
      if (isApiError(e, 'LINE_NOT_FOUND')) setBack((s) => new Set(s).add(l.id))
      setError(messageOf(e))
    } finally {
      setBusy(null)
    }
  }
  const items = (list.data?.pages.flatMap((p) => p.items) ?? []).filter((l) => !back.has(l.id))
  return (
    <Page back={SETUP} title={t('kiranaSetup.skippedTitle')}>
      <p className="text-sm text-muted">{t('kiranaSetup.skippedIntro')}</p>
      {error && <ErrorBanner message={error} />}
      {back.size > 0 && (
        <Link to={`${SETUP}/lines`} className={linkButton.primary}>
          {t('kiranaSetup.checkBroughtBack', { count: back.size })}
        </Link>
      )}
      {list.isPending ? (
        <Loading />
      ) : list.isError && !list.data ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-muted">{t('kiranaSetup.noneSkipped')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
              <span className="min-w-0">
                <span className="block break-words">{l.wording}</span>
                <span className="block text-xs text-muted">{t('kiranaSetup.pageLine', { page: l.pageNo ?? 1, line: l.lineNo })}</span>
              </span>
              <Button variant="secondary" className="shrink-0" busy={busy === l.id} disabled={busy !== null} onClick={() => void undo(l)}>
                {t('kiranaSetup.bringBack')}
              </Button>
            </li>
          ))}
          <li>
            <MoreButton shown={list.hasNextPage} busy={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()} />
          </li>
        </ul>
      )}
    </Page>
  )
}

// ---------- counting ----------

/** /kirana/setup/count: products with no count yet, one at a time ("How many are on the shelf now?"). */
export function CountProducts() {
  const t = useT()
  const qc = useQueryClient()
  const setup = useSetup()
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const queue = (setup.data?.uncountedProducts ?? []).filter((p) => !done.has(p.id))
  const current = queue[0] ?? null
  const left = setup.data?.uncounted ?? 0
  // These 20 counted, more left: the next 20 (the setup lists up to 20 at a time). Once per state of what is known
  // (AB#6), never a loop: an answer listing none of them again shows where things stand, with Check again
  const refetch = setup.refetch
  const askKey = `${done.size}|${left}`
  const [asked, setAsked] = useState<string | null>(null)
  const wantMore = Boolean(setup.data) && !current && left > 0 && !setup.isFetching && asked !== askKey
  useEffect(() => {
    if (!wantMore) return
    setAsked(askKey)
    void refetch()
  }, [wantMore, askKey, refetch])
  return (
    <Page back={SETUP} title={t('kiranaSetup.countTitle')}>
      {setup.data && <p className="text-sm font-semibold" aria-live="polite">{t('kiranaSetup.left', { count: left })}</p>}
      {setup.isPending ? (
        <Loading />
      ) : setup.isError && !setup.data ? (
        <ErrorState message={messageOf(setup.error)} onRetry={() => setup.refetch()} />
      ) : current ? (
        <CountOne
          key={current.id}
          id={current.id}
          name={current.name}
          onDone={() => {
            setDone((s) => new Set(s).add(current.id))
            adjust(qc, (v) => ({ uncounted: Math.max(0, v.uncounted - 1) }))
            void qc.invalidateQueries({ queryKey: kiranaKeys.productsAll, refetchType: 'none' })
            // The last one: the next step from the backend (the next 20 to count, or photos)
            if (queue.length === 1) void qc.invalidateQueries({ queryKey: setupKeys.view })
          }}
        />
      ) : wantMore || setup.isFetching ? (
        <Loading />
      ) : left > 0 ? (
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-semibold">{t('kiranaSetup.countElsewhere')}</p>
          <Button variant="secondary" onClick={() => void qc.invalidateQueries({ queryKey: setupKeys.view })}>
            {t('kiranaSetup.checkAgain')}
          </Button>
          <Link to={SETUP} className={linkButton.secondary}>
            {t('kiranaSetup.backToSetup')}
          </Link>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-semibold">{t('kiranaSetup.allCounted')}</p>
          {setupOpen(setup.data) && <NextStep v={setup.data} />}
          <Link to={SETUP} className={linkButton.secondary}>
            {t('kiranaSetup.backToSetup')}
          </Link>
        </Card>
      )}
    </Page>
  )
}

function CountOne({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const t = useT()
  const product = useProduct(id)
  // Its own unit once read (CD#8); until then Save waits, and if it can't be read the backend checks the count
  const unit: Unit | null = product.data?.product.unit ?? null
  const [count, setCount] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const sending = useRef(false)
  const qty = parseQty(count, unit ?? 'KG', { zeroAllowed: true })
  const [mismatch, setMismatch] = useState<string | null>(null)
  async function save() {
    setTouched(true)
    if ('error' in qty || sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    setMismatch(null)
    // One id per product and count (AB#4, CD#2): a lost answer tried again with the same number is the same count; a
    // corrected number is a new count, applied
    const once = onceRef(`count.${id}.${qty.milli}`)
    try {
      const saved = await setupApi.count(id, once.ref, qty.milli / 1000)
      once.forget()
      if (toMilli(saved.stock) !== qty.milli) {
        // Not what was typed (a sale or another phone's count in between): said, and Save again sets it
        setMismatch(t('kiranaSetup.countSavedAs', { count: qtyText(toMilli(saved.stock)) }))
        return
      }
      onDone()
    } catch (e) {
      if (isApiError(e, 'PRODUCT_REMOVED') || isApiError(e, 'PRODUCT_NOT_FOUND')) {
        once.forget()
        onDone()
      } else {
        if (!outcomeUnknown(e)) once.forget()
        setError(e)
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-xl font-semibold break-words">{name}</p>
      <Field
        id="count-now"
        label={unit === 'KG' ? t('kiranaSetup.countKgLabel') : t('kiranaSetup.countLabel')}
        hint={product.isPending ? t('kiranaSetup.loading') : t('kiranaSetup.countHint')}
        inputMode="decimal"
        value={count}
        onChange={(e) => {
          setCount(e.target.value)
          setError(null)
        }}
        error={(touched && 'error' in qty ? qty.error : undefined) || fieldError(error, 'quantity')}
      />
      <Chip selected={count === '0'} onClick={() => setCount('0')}>
        {t('kiranaSetup.noneOnShelf')}
      </Chip>
      {isApiError(error) && !fieldError(error, 'quantity') && (
        <SendError error={error} unsure="kiranaSetup.decideUnsure" />
      )}
      {mismatch && <Banner tone="warn">{mismatch}</Banner>}
      <Button className="min-h-14" busy={busy || product.isPending} onClick={() => void save()}>
        {t('kiranaSetup.saveAndNext')}
      </Button>
    </Card>
  )
}

// ---------- product photos ----------

/** /kirana/setup/photos: products without a picture, one at a time, with what the photo must show. */
export function ProductPhotos() {
  const t = useT()
  const qc = useQueryClient()
  /** A photo on its way: Back asks first (EF#14), as on the list's page. */
  const [uploading, setUploading] = useState(false)
  const setup = useSetup()
  const list = usePhotosNeeded()
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [sent, setSent] = useState<Set<string>>(() => new Set())
  const [last, setLast] = useState<string | null>(null)
  const [stopped, setStopped] = useState<string | null>(null)
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const queue = photoQueue(items, skipped, sent)
  const current = queue[0] ?? null
  // These done, more listed: the next 20
  const more = list.fetchNextPage
  const wantMore = !current && Boolean(list.hasNextPage) && !list.isFetchingNextPage
  useEffect(() => {
    if (wantMore) void more()
  }, [wantMore, more])
  // All sent: the setup read again once, for what comes next (wait for the checks, or finish)
  const allDone = Boolean(list.data) && !current && !list.hasNextPage
  useEffect(() => {
    if (allDone) void qc.invalidateQueries({ queryKey: setupKeys.view })
  }, [allDone, qc])
  // Leaving: the list is read again next time (refused ones come back to retake)
  useEffect(() => () => void qc.invalidateQueries({ queryKey: setupKeys.photos, refetchType: 'none' }), [qc])
  const v = setup.data
  return (
    <Page back={SETUP} title={t('kiranaSetup.photosTitle')} leaveWarning={uploading ? t('kiranaSetup.leaveSending') : null}>
      {v && (
        <p className="text-sm" aria-live="polite">
          <span className="font-semibold">{t('kiranaSetup.left', { count: photosToTake(v) })}</span>
          {v.photosChecking + v.photosFinding > 0 && <span className="text-muted"> · {t('kiranaSetup.photosChecking', { count: v.photosChecking + v.photosFinding })}</span>}
        </p>
      )}
      {last && <Banner tone="good">{last}</Banner>}
      {stopped ? (
        <Card className="flex flex-col gap-3">
          <ErrorBanner message={stopped} />
          <Link to={SETUP} className={linkButton.secondary}>
            {t('kiranaSetup.backToSetup')}
          </Link>
          <ContactUs screen={t('kiranaSetup.photosTitle')} />
        </Card>
      ) : list.isPending ? (
        <Loading />
      ) : list.isError && !list.data ? (
        <ErrorState message={messageOf(list.error)} onRetry={() => list.refetch()} />
      ) : current ? (
        <PhotoOne
          key={`${current.productId}-${current.photoCheck ?? 'none'}`}
          p={current}
          onSent={() => {
            setSent((s) => new Set(s).add(current.productId))
            setLast(t('kiranaSetup.photoSent', { name: current.name }))
            if (current.photoCheck !== 'CHECKING') adjust(qc, (x) => ({ photosChecking: x.photosChecking + 1, photosFinding: current.findingPicture ? Math.max(0, x.photosFinding - 1) : x.photosFinding }))
          }}
          onSkip={() => {
            setSkipped((s) => new Set(s).add(current.productId))
            setLast(null)
          }}
          onStop={setStopped}
          onBusy={setUploading}
        />
      ) : wantMore || list.isFetchingNextPage ? (
        <Loading />
      ) : (
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-semibold">{skipped.size ? t('kiranaSetup.photosSomeSkipped', { count: skipped.size }) : t('kiranaSetup.photosAllSent')}</p>
          <p className="text-sm text-muted">{t('kiranaSetup.photosAfter')}</p>
          {skipped.size > 0 && (
            <Button variant="secondary" onClick={() => setSkipped(new Set())}>
              {t('kiranaSetup.photosSkippedAgain')}
            </Button>
          )}
          <Link to={SETUP} className={linkButton.secondary}>
            {t('kiranaSetup.backToSetup')}
          </Link>
        </Card>
      )}
    </Page>
  )
}

/** What a refused photo was refused for, in the shop's words (the backend's English for a code the app lacks). */
function refusalText(p: PhotoNeeded): string {
  const key = photoRefusalKey(p.code)
  if (!key) return p.reason ?? t('kiranaSetup.photo_OTHER')
  return t(key, { name: p.name, seen: p.seen ?? '', size: p.sizeToShow ?? '' })
}

function PhotoOne({ p, onSent, onSkip, onStop, onBusy }: { p: PhotoNeeded; onSent: () => void; onSkip: () => void; onStop: (message: string) => void; onBusy: (busy: boolean) => void }) {
  const t = useT()
  const side = p.photoCheck === 'NEED_SIZE'
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    onBusy(busy)
    return () => onBusy(false)
  }, [busy, onBusy])
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState<string | null>(null)
  const sending = useRef(false)

  async function send(fileId: string) {
    const once = onceRef(`photo.${p.productId}.${fileId}`)
    setPending(fileId)
    await setupApi.setPhoto(p.productId, side ? { clientRef: once.ref, fileId: null, sizeFileId: fileId } : { clientRef: once.ref, fileId })
    once.forget()
    setPending(null)
    onSent()
  }

  async function run(work: () => Promise<void>) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (e) {
      if (isApiError(e, 'TOO_MANY_PHOTOS_TODAY')) onStop(messageOf(e))
      else if (isApiError(e, 'PRODUCT_REMOVED') || isApiError(e, 'PRODUCT_NOT_FOUND')) onSkip()
      else setError(e)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const how = p.loose
    ? t('kiranaSetup.photoLooseHow', { name: p.name })
    : side
      ? t('kiranaSetup.photoSideHow', { size: p.sizeToShow ?? '' })
      : p.sizeToShow
        ? t('kiranaSetup.photoSizeHow', { size: p.sizeToShow })
        : t('kiranaSetup.photoFrontHow')
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-2">
        <p className="text-xl font-semibold break-words">{p.name}</p>
        <p>{how}</p>
        {p.photoCheck === 'REFUSED' && <Banner tone="bad">{refusalText(p)}</Banner>}
        {side && p.code === 'SIZE_UNREADABLE' && <Banner tone="warn">{refusalText(p)}</Banner>}
        {p.findingPicture && !p.photoCheck && <Banner tone="info">{t('kiranaSetup.findingPicture')}</Banner>}
        {p.newPhotoUrl && p.photoCheck === 'REFUSED' && (
          <img src={p.newPhotoUrl} alt={t('kiranaSetup.refusedPhotoAlt')} className="max-h-40 w-auto self-start rounded-lg border border-line" />
        )}
      </Card>
      {!side && <PhotoGuide kind={p.loose ? 'loose' : 'pack'} compact />}
      <PickPhoto
        label={p.photoCheck === 'REFUSED' ? t('kiranaSetup.retakePhoto') : side ? t('kiranaSetup.takeSidePhoto') : t('kiranaSetup.takePhoto')}
        busy={busy}
        onPicked={(file) =>
          void run(async () => {
            const stored = await uploadKiranaFile(await shrinkPhoto(file), 'product.jpg', 'PRODUCT_PHOTO')
            await send(stored.id)
          })
        }
      />
      {error !== null && (
        <SendError error={error} unsure="kiranaSetup.sendUnsure" />
      )}
      {error !== null && pending && outcomeUnknown(error) && (
        <Button busy={busy} onClick={() => void run(() => send(pending))}>
          {t('kiranaSetup.tryAgain')}
        </Button>
      )}
      <Button variant="ghost" disabled={busy} onClick={onSkip}>
        {t('kiranaSetup.skipForNow')}
      </Button>
    </div>
  )
}
