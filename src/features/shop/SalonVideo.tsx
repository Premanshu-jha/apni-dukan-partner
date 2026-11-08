import { useEffect, useRef, useState } from 'react'
import { useVideoLink, videoApi } from '../../api/shop'
import { isApiError } from '../../api/errors'
import { Banner, Button, Card } from '../../components/ui'
import {
  afterCompleteFailure,
  afterSendFailure,
  hold,
  LENGTH_UNKNOWN,
  linkUsable,
  readVideoSeconds,
  refusedForGood,
  sentSeconds,
  VIDEO_MAX_SECONDS,
  VIDEO_MIN_SECONDS,
  videoErrorText,
  videoProblem,
  videoTypeOf,
  type HeldLink,
} from '../../lib/salonVideo'

/** A video picked and checked, kept in memory until it is saved (so "Try again" doesn't need it picked again). */
interface Picked {
  file: Blob
  type: string
  /** null: the phone couldn't read the length and the owner chose to upload anyway. */
  seconds: number | null
}

/**
 * Where the upload of the picked video stands, so "Try again" goes on from the step that failed: a PUT that went
 * through is not sent again, a completed upload is not completed again.
 */
interface Progress {
  held: HeldLink | null
  sent: boolean
  fileId: string | null
}

type Phase = 'idle' | 'checking' | 'unknown-length' | 'sending' | 'saving' | 'failed' | 'blocked'

const LEAVE_WARNING = 'The salon video is still uploading. Leave anyway? It will have to be sent again.'

/**
 * Registration step 2's "Salon video" card: how to film it, Record video / Choose from gallery, then the upload
 * straight to R2 with a progress bar, Cancel and Try again; afterwards a small player with "Replace video".
 * save(fileId) sets it on the shop and returns once the backend has it. onBusy tells the page an upload or save is
 * under way (it keeps the owner from leaving meanwhile).
 */
export function SalonVideo({
  fileId,
  save,
  onBusy,
}: {
  fileId: string | null
  save: (fileId: string, signal: AbortSignal) => Promise<void>
  onBusy?: (busy: boolean) => void
}) {
  const recordInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [replacing, setReplacing] = useState(false)
  const state = useRef<Progress>({ held: null, sent: false, fileId: null })
  const abort = useRef<AbortController | null>(null)

  const busy = phase === 'sending' || phase === 'saving' || phase === 'checking'
  const uploading = phase === 'sending' || phase === 'saving'

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => onBusy?.(uploading), [uploading, onBusy])
  // Closing or reloading the page mid-upload asks first; so does any link inside the app (the app's router has no
  // way to hold a route change, so a link's click is caught before it is followed)
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = LEAVE_WARNING
    }
    const link = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || new URL(a.href, location.href).origin !== location.origin) return
      if (!window.confirm(LEAVE_WARNING)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', link, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', link, true)
    }
  }, [uploading])

  function reset() {
    abort.current?.abort()
    state.current = { held: null, sent: false, fileId: null }
    setPicked(null)
    setMessage(null)
    setPhase('idle')
  }

  async function pickedFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessage(null)
    state.current = { held: null, sent: false, fileId: null }
    const type = videoTypeOf(file)
    setPhase('checking')
    const seconds = type ? await readVideoSeconds(file) : null
    const problem = videoProblem({ type, size: file.size, seconds })
    if (problem) {
      setPicked(null)
      setMessage(problem)
      setPhase('idle')
      return
    }
    if (seconds === null) {
      // Not a dead end: the owner checks the length and may send it; the backend still caps the size
      setPicked({ file, type: type!, seconds: null })
      setPhase('unknown-length')
      return
    }
    const next = { file, type: type!, seconds }
    setPicked(next)
    await send(next)
  }

  async function send(p: Picked) {
    const controller = new AbortController()
    abort.current = controller
    setMessage(null)
    const st = state.current
    try {
      if (!st.fileId) {
        if (!st.sent) {
          setPhase('sending')
          setProgress(0)
          if (!st.held || !linkUsable(st.held, Date.now())) {
            const link = await videoApi.start(p.file.size, p.type, p.seconds === null ? null : sentSeconds(p.seconds))
            st.held = hold(link, Date.now())
          }
          try {
            await videoApi.send(st.held.link, p.file, setProgress, controller.signal)
          } catch (e) {
            if (st.held && !(e instanceof DOMException)) {
              if (afterSendFailure(e, st.held.failures) === 'new-link') st.held = null
              else st.held.failures++
            }
            throw e
          }
          st.sent = true
        }
        setPhase('saving')
        try {
          st.fileId = (await videoApi.complete(st.held!.link.uploadId)).id
          if (controller.signal.aborted) return   // the owner left meanwhile: nothing is set on the shop
        } catch (e) {
          const next = afterCompleteFailure(e)
          if (next === 'start-over') state.current = { held: null, sent: false, fileId: null }
          else if (next === 'send-again') st.sent = false
          throw e
        }
      }
      setPhase('saving')
      await save(st.fileId!, controller.signal)
      state.current = { held: null, sent: false, fileId: null }
      setPicked(null)
      setReplacing(false)
      setPhase('idle')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase('failed')
        setMessage('Upload cancelled. Tap Try again to send it, or pick another video.')
        return
      }
      setMessage(videoErrorText(e))
      if (isApiError(e, 'UPLOAD_GONE')) {
        // The completed video expired before it was saved on the salon: Try again sends it again from the start
        state.current = { held: null, sent: false, fileId: null }
        setPhase('failed')
      } else if (isApiError(e, 'SHOP_CHANGED')) {
        // Already reloaded and tried once more (RegisterPhotos): only a reload helps now
        setPhase('blocked')
      } else if (refusedForGood(e) || afterCompleteFailure(e) === 'pick-again') {
        reset()
        setMessage(videoErrorText(e))
      } else {
        setPhase('failed')
      }
    } finally {
      if (abort.current === controller) abort.current = null
    }
  }

  const showPickers = !fileId || replacing
  const percent = Math.round(progress * 100)
  const spoken =
    phase === 'checking'
      ? 'Checking the video…'
      : phase === 'sending'
        ? `Uploading the video, ${Math.floor(percent / 10) * 10}%`
        : phase === 'saving'
          ? 'Saving the video…'
          : ''
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-medium">Salon video</p>
        <p className="text-sm text-muted">
          {VIDEO_MIN_SECONDS}–{VIDEO_MAX_SECONDS} seconds. Only our field team sees it, before the visit.
        </p>
      </div>
      {fileId && !replacing && (
        <>
          <Preview fileId={fileId} />
          <Button variant="secondary" onClick={() => setReplacing(true)}>
            Replace video
          </Button>
        </>
      )}
      {showPickers && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Hold the phone sideways. If your camera is set to 4K, switch it to 1080p (HD) first.</li>
            <li>Start outside: show the board with the salon's name and the entrance (about 5 seconds).</li>
            <li>Walk in, stand near the door, turn slowly from left to right showing the chairs, mirrors and waiting area.</li>
            <li>Lights on, keep the phone steady, no need to talk.</li>
            <li>Avoid customers' faces where you can.</li>
          </ol>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => recordInput.current?.click()}>
              Record video
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => galleryInput.current?.click()}>
              Choose from gallery
            </Button>
          </div>
          <input ref={recordInput} type="file" accept="video/*" capture="environment" className="hidden" tabIndex={-1} aria-label="Record video" onChange={pickedFile} disabled={busy} />
          <input ref={galleryInput} type="file" accept="video/*" className="hidden" tabIndex={-1} aria-label="Choose video from gallery" onChange={pickedFile} disabled={busy} />
          {fileId && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                reset()
                setReplacing(false)
              }}
            >
              Keep the current video
            </Button>
          )}
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {spoken}
      </p>
      {phase === 'checking' && <p aria-hidden className="text-sm text-muted">Checking the video…</p>}
      {phase === 'unknown-length' && picked && (
        <div className="flex flex-col gap-2">
          <Banner tone="warn">{LENGTH_UNKNOWN}</Banner>
          <Button onClick={() => void send(picked)}>Upload anyway</Button>
        </div>
      )}
      {phase === 'sending' && (
        <div className="flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Uploading the video"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p aria-hidden className="text-sm text-muted">Uploading… {percent}%. Keep the app open.</p>
          <Button variant="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        </div>
      )}
      {phase === 'saving' && <p aria-hidden className="text-sm text-muted">Saving the video…</p>}
      {message && <Banner tone={phase === 'blocked' ? 'warn' : 'bad'}>{message}</Banner>}
      {phase === 'failed' && picked && <Button onClick={() => void send(picked)}>Try again</Button>}
    </Card>
  )
}

/**
 * The saved video. Its link lasts 5 minutes and a new one is read every 4, but the player keeps the address it loaded
 * (changing it would stop a video being watched); it takes the newest link only before it loaded, or once after an
 * error (a link that ran out), then says to reload.
 */
function Preview({ fileId }: { fileId: string }) {
  const link = useVideoLink(fileId)
  const [src, setSrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [retried, setRetried] = useState(false)
  const [broken, setBroken] = useState(false)
  const latest = link.data?.url ?? null

  useEffect(() => {
    if (latest && !loaded) setSrc(latest)
  }, [latest, loaded])

  async function failed() {
    if (retried) {
      setBroken(true)
      return
    }
    setRetried(true)
    setLoaded(false)
    const fresh = await link.refetch()
    if (fresh.data?.url) setSrc(fresh.data.url)
    else setBroken(true)
  }

  if (broken) return <Banner tone="bad">Couldn't play the video. Reload the page.</Banner>
  if (!src) return <p className="text-sm text-muted">Video saved.</p>
  return (
    <video
      key={retried ? 'retry' : 'first'}
      src={src}
      controls
      playsInline
      preload="metadata"
      aria-label="Your salon video"
      className="aspect-video w-full rounded-xl bg-scrim/20"
      onLoadedMetadata={() => setLoaded(true)}
      onError={() => void failed()}
    />
  )
}
