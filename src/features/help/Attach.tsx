import { useEffect, useRef, useState } from 'react'
import { ApiError, messageOf } from '../../api/errors'
import { FILE_MAX_BYTES, isJpegOrPng, kindOf, MAX_FILES, ticketFiles, VIDEO_MAX_BYTES, type TicketFile } from '../../api/ticketFiles'
import { shrinkPhoto } from '../../lib/image'

/** One file picked for a support message: sent to storage at once, then sent with the message by its id. */
export interface Picked {
  key: string
  kind: 'photo' | 'video' | 'pdf' | 'file'
  name: string
  size: number
  /** A photo's own preview (a blob: address), freed when it goes */
  preview: string | null
  status: 'sending' | 'ready' | 'failed'
  /** 0..1 while a video goes up */
  progress: number
  error: string | null
  /** Trying again can't help (a photo this browser can't shrink, over 10 MB): only Remove is offered */
  final: boolean
  /** Goes as a file (only downloaded): a kind we don't show, or a photo this browser can't read (an iPhone's HEIC) */
  asFile: boolean
  /** A video already in storage whose "complete" failed: trying again only completes it */
  arrived: string | null
  file: TicketFile | null
  source: File
}

/** A failure trying again can't help. */
class CantSend extends Error {}

/** A picked file's size as people read it. */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

let next = 0

/**
 * The files picked for one message: each starts going up as soon as it is picked (a video with its progress), so
 * Send only waits for what is still on its way. At most {@link MAX_FILES}. Leaving the page cancels what is still
 * going up; a file sent up but never sent with a message is deleted by the backend after a day.
 */
export function useAttachments() {
  const [items, setItems] = useState<Picked[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const previews = useRef(new Set<string>())

  useEffect(() => {
    const open = controllers.current
    const shown = previews.current
    return () => {
      open.forEach((c) => c.abort())
      shown.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const update = (key: string, patch: Partial<Picked>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  async function sendUp(item: Picked) {
    const controller = new AbortController()
    controllers.current.set(item.key, controller)
    update(item.key, { status: 'sending', progress: item.arrived ? 1 : 0, error: null })
    const got = { arrived: item.arrived }   // set once the video is in storage
    try {
      let file: TicketFile
      if (item.kind === 'video' && got.arrived) {
        file = await ticketFiles.complete(got.arrived, controller.signal)
      } else if (item.kind === 'video') {
        const type = kindOf(item.source)
        file = await ticketFiles.video(item.source, type && type.kind === 'video' ? type.type : 'video/mp4', (p) => update(item.key, { progress: p }), controller.signal, (id) => {
          got.arrived = id
          update(item.key, { arrived: id })
        })
      } else if (item.kind === 'photo') {
        const small = await shrinkPhoto(item.source)
        // A photo this browser can't read (an iPhone's HEIC): it goes as it is, as a file to download
        const unread = small === item.source && !isJpegOrPng(item.source.type || 'image/jpeg')
        if (unread && small.size > FILE_MAX_BYTES) {
          throw new CantSend('This photo is over 10 MB in a format that can\'t be shrunk here. Send a screenshot of it, or set the camera to JPEG ("Most compatible").')
        }
        if (small.size > FILE_MAX_BYTES) throw new CantSend('This photo is too big (over 10 MB). Take it again or send a screenshot.')
        if (unread) update(item.key, { asFile: true, preview: null })
        const name = small === item.source ? item.name : item.name.replace(/\.[^.]+$/, '') + '.jpg'
        file = await ticketFiles.upload(small, name, controller.signal)
      } else {
        file = await ticketFiles.upload(item.source, item.name, controller.signal)
      }
      if (controller.signal.aborted) return
      update(item.key, { status: 'ready', progress: 1, file })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (controller.signal.aborted) return
      // The backend refused the video that arrived (expired, not a video): trying again sends it from the start
      const keep = got.arrived && e instanceof ApiError && e.code === 'NETWORK' ? got.arrived : null
      update(item.key, {
        status: 'failed',
        final: e instanceof CantSend,
        arrived: keep,
        error: e instanceof Error && !('status' in e) ? e.message : messageOf(e),
      })
    } finally {
      controllers.current.delete(item.key)
    }
  }

  /** Adds picked files (those over the limit or of a kind we don't take are left out); returns what to say, if anything. */
  function add(picked: FileList | File[]): string | null {
    const files = Array.from(picked)
    const room = MAX_FILES - items.length
    const problems: string[] = []
    const added: Picked[] = []
    const left: string[] = []
    for (const f of files) {
      const kind = kindOf(f)
      if (kind.kind === 'video' && f.size > VIDEO_MAX_BYTES) {
        problems.push(`${f.name} is ${sizeText(f.size)}, over 100 MB. Send a shorter clip (under a minute on most phones).`)
        continue
      }
      if (kind.kind === 'file' && f.type.startsWith('video/') && f.size > FILE_MAX_BYTES) {
        problems.push(`${f.name}: this kind of video can't be played here. Send an MP4 or MOV (the phone camera's own), or one under 10 MB as a file.`)
        continue
      }
      if ((kind.kind === 'pdf' || kind.kind === 'file') && f.size > FILE_MAX_BYTES) {
        problems.push(`${f.name} is ${sizeText(f.size)}, over 10 MB. Send a smaller one (a video can be up to 100 MB).`)
        continue
      }
      if (f.size === 0) {
        problems.push(`${f.name} is empty.`)
        continue
      }
      if (added.length >= room) {
        left.push(f.name)
        continue
      }
      const preview = kind.kind === 'photo' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null
      if (preview) previews.current.add(preview)
      added.push({ key: `f${++next}`, kind: kind.kind, name: f.name || (kind.kind === 'photo' ? 'Photo' : kind.kind === 'video' ? 'Video' : kind.kind === 'pdf' ? 'Document.pdf' : 'File'), size: f.size, preview, status: 'sending', progress: 0, error: null, final: false, asFile: kind.kind === 'file', arrived: null, file: null, source: f })
    }
    if (left.length > 0) problems.push(`At most ${MAX_FILES} files in one message, so ${left.join(', ')} ${left.length === 1 ? "wasn't" : "weren't"} added: send ${left.length === 1 ? 'it' : 'them'} in the next one.`)
    if (added.length > 0) {
      setItems((list) => [...list, ...added])
      added.forEach((i) => void sendUp(i))
    }
    return problems.length > 0 ? problems.join(' ') : null
  }

  function remove(key: string) {
    controllers.current.get(key)?.abort()
    setItems((list) => {
      const gone = list.find((i) => i.key === key)
      if (gone?.preview) {
        URL.revokeObjectURL(gone.preview)
        previews.current.delete(gone.preview)
      }
      return list.filter((i) => i.key !== key)
    })
  }

  /** A preview the browser can't show (an iPhone's HEIC on Chrome): the icon instead of a broken picture. */
  function dropPreview(key: string) {
    update(key, { preview: null })
  }

  function retry(key: string) {
    const item = items.find((i) => i.key === key)
    if (item) void sendUp(item)
  }

  /** After the message went: the list empties (the previews are freed). */
  function clear() {
    items.forEach((i) => {
      if (i.preview) {
        URL.revokeObjectURL(i.preview)
        previews.current.delete(i.preview)
      }
    })
    setItems([])
  }

  return {
    items,
    add,
    remove,
    retry,
    dropPreview,
    clear,
    /** Still going up: Send waits */
    sending: items.some((i) => i.status === 'sending'),
    failed: items.some((i) => i.status === 'failed'),
    fileIds: items.filter((i) => i.status === 'ready' && i.file).map((i) => i.file!.id),
    full: items.length >= MAX_FILES,
  }
}

export type Attachments = ReturnType<typeof useAttachments>

/** What a picked file's status line says (screen readers hear it only when it changes kind, not each percent). */
function statusText(i: Picked): string {
  if (i.status === 'failed') return i.error ?? "It didn't go up."
  if (i.status === 'sending') return i.kind === 'video' && i.progress > 0 && i.progress < 1 ? `Uploading… ${Math.round(i.progress * 100)}% of ${sizeText(i.size)}` : `Uploading… ${sizeText(i.size)}`
  return i.asFile || i.file?.contentType === DOWNLOAD_ONLY
    ? `Attached as a file (it can't be shown here, only downloaded) · ${sizeText(i.file?.sizeBytes ?? i.size)} · goes when you tap Send`
    : `Attached · ${sizeText(i.file?.sizeBytes ?? i.size)} · goes when you tap Send`
}

/** "Add photo, video or file" and the files picked, each with how it is going and a way to take it out. */
export function AttachmentPicker({ a, id, disabled }: { a: Attachments; id: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files) setProblem(a.add(e.target.files))
          e.target.value = ''   // the same file may be picked again after removing it
        }}
      />
      <button
        ref={button}
        type="button"
        className="self-start rounded-xl border border-line bg-raised px-4 py-2 text-sm font-semibold text-ink hover:bg-line disabled:opacity-50"
        disabled={disabled || a.full}
        onClick={() => input.current?.click()}
      >
        📎 Add photo, video or file
      </button>
      {a.full && !problem && <p className="text-xs text-muted">That's the most for one message: send the rest in the next one.</p>}
      {problem && (
        <p role="alert" className="text-sm text-bad">
          {problem}
        </p>
      )}
      {a.items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Files to send">
          {a.items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2">
              {i.preview ? (
                <img src={i.preview} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" onError={() => a.dropPreview(i.key)} />
              ) : (
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-raised text-xl">
                  {i.kind === 'video' ? '🎬' : i.kind === 'photo' ? '🖼️' : i.kind === 'pdf' ? '📄' : '📎'}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium [overflow-wrap:anywhere]">{i.name}</span>
                <span className={`text-xs ${i.status === 'failed' ? 'text-bad' : 'text-muted'}`}>{statusText(i)}</span>
                <span className="sr-only" aria-live="polite">
                  {i.status === 'sending' ? `${i.name}: uploading` : i.status === 'failed' ? `${i.name}: ${i.error ?? 'failed'}` : `${i.name}: attached`}
                </span>
                {i.status === 'sending' && i.kind === 'video' && (
                  <span
                    className="mt-1 h-1 overflow-hidden rounded bg-raised"
                    role="progressbar"
                    aria-label={`${i.name} uploading`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(i.progress * 100)}
                  >
                    <span className="block h-1 bg-brand" style={{ width: `${Math.round(i.progress * 100)}%` }} />
                  </span>
                )}
              </span>
              {i.status === 'failed' && !i.final && (
                <button
                  type="button"
                  className="text-sm text-link underline"
                  onClick={() => {
                    a.retry(i.key)
                    document.getElementById(`${id}-remove-${i.key}`)?.focus()   // this button goes while it is sent again
                  }}
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                id={`${id}-remove-${i.key}`}
                aria-label={`Remove ${i.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:bg-raised"
                onClick={() => {
                  a.remove(i.key)
                  setProblem(null)
                  button.current?.focus()   // the row (and this button) goes
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A file on a message, as the backend shows it. */
export interface ShownFile {
  id: string
  contentType: string
  sizeBytes: number
  name: string | null
  /** Opens it for at least 15 minutes (a file of a kind we don't show: downloads it); null once removed */
  url: string | null
  /** Saves it under its name; null once removed (missing from an older backend) */
  downloadUrl?: string | null
  removed: boolean
}

/** What a downloaded file is, from its name: "iPhone photo (HEIC)", "DOCX file". */
function fileKind(name: string | null): string {
  const ext = name && name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (ext === 'heic' || ext === 'heif') return 'iPhone photo (HEIC)'
  return ext ? `${ext.toUpperCase()} file` : 'file'
}

/** A file of a kind we don't show (a Word file, a zip, an iPhone HEIC photo): only downloaded. */
export const DOWNLOAD_ONLY = 'application/octet-stream'

/**
 * A video that keeps its place when its link is renewed (every hour, as the page re-reads): the newer link is used
 * only while it hasn't been started (or has ended). The older one stays valid for at least an hour more.
 */
function Video({ url }: { url: string }) {
  const [src, setSrc] = useState(url)
  const ref = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const v = ref.current
    if (url !== src && (v === null || (v.paused && (v.currentTime === 0 || v.ended)))) setSrc(url)
  }, [url, src])
  return (
    <video
      ref={ref}
      controls
      preload="metadata"
      src={src}
      className="max-h-72 w-full rounded-lg bg-black"
      onError={() => {
        // Its link ran out while it was paused part-way: the newer link, from the same place
        const v = ref.current
        if (v && url !== src) {
          const at = v.currentTime
          setSrc(url)
          v.addEventListener('loadedmetadata', () => { v.currentTime = at }, { once: true })
        }
      }}
    >
      <a href={src}>Open the video</a>
    </video>
  )
}

/** Why a file shows as removed, as the person reading it needs to know. */
const REMOVED = 'removed (files are kept for 6 months after a request is resolved or last written on)'

/** The photos (tap for full size), videos (played here), PDFs and other files (downloaded) a message carries. */
export function MessageFiles({ files, removedNote = REMOVED }: { files: ShownFile[]; removedNote?: string }) {
  if (files.length === 0) return null
  return (
    <ul className="flex flex-col gap-2" aria-label="Files">
      {files.map((f) => (
        <li key={f.id}>
          {f.removed || !f.url ? (
            <p className="text-xs text-muted">📎 {f.name ?? 'A file'}: {removedNote}</p>
          ) : f.contentType.startsWith('image/') ? (
            <a href={f.url} target="_blank" rel="noreferrer" className="flex flex-col gap-1" aria-label={`Open the photo ${f.name ?? ''} in full`}>
              <img src={f.url} alt={f.name ?? 'Photo'} loading="lazy" className="max-h-56 max-w-full rounded-lg border border-line object-contain" />
              <span className="text-xs text-muted">Tap to see it full size (opens in a new tab)</span>
            </a>
          ) : f.contentType.startsWith('video/') ? (
            <Video url={f.url} />
          ) : f.contentType === DOWNLOAD_ONLY ? (
            <a href={f.downloadUrl ?? f.url} className="text-sm text-link underline [overflow-wrap:anywhere]" aria-label={`Download ${f.name ?? 'the file'}, ${fileKind(f.name)}, ${sizeText(f.sizeBytes)}`}>
              📎 {f.name ?? 'File'} <span className="text-xs text-muted no-underline">· {fileKind(f.name)} · {sizeText(f.sizeBytes)} · Download</span>
            </a>
          ) : (
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <a href={f.url} target="_blank" rel="noreferrer" className="text-sm text-link underline [overflow-wrap:anywhere]">
                📄 {f.name ?? 'Document.pdf'} · {sizeText(f.sizeBytes)} <span className="text-xs text-muted no-underline">(opens in a new tab)</span>
              </a>
              {f.downloadUrl && (
                <a href={f.downloadUrl} className="text-xs text-link underline" aria-label={`Download ${f.name ?? 'the PDF'}`}>
                  Download
                </a>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
