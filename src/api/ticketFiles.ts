import { api } from './client'
import { ApiError } from './errors'

/** POST /files/ticket and the video's "complete": a file to send with a support message (by its id). */
export interface TicketFile {
  id: string
  contentType: string
  sizeBytes: number
  name: string | null
}

/** POST /files/ticket/videos: a one-time link to PUT the video to, with exactly this Content-Type. */
interface VideoLink {
  uploadId: string
  uploadUrl: string
  contentType: string
  sizeBytes: number
  expiresAt: string
}

/** The backend's limits (TicketFileService). */
export const FILE_MAX_BYTES = 10 * 1024 * 1024
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024
/** Files one message may carry (TicketService.MAX_FILES). */
export const MAX_FILES = 5
/** No upload progress for this long: the connection is taken as dropped. */
const STALL_MS = 60_000

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'video/mp4',
  'video/quicktime': 'video/quicktime',
  'video/webm': 'video/webm',
}
const VIDEO_BY_EXTENSION: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }

/** Photo formats the backend takes as they are (any other is re-encoded to JPEG on the phone first, or refused). */
export function isJpegOrPng(type: string): boolean {
  const base = type.split(';')[0].trim().toLowerCase()
  return base === 'image/jpeg' || base === 'image/png'
}

/**
 * What a picked file is: a photo (shrunk, then shown), a PDF (shown), a video (straight to storage, played), or any
 * other file (a Word file, a zip, an iPhone HEIC photo): sent as it is, at most 10 MB, and only ever downloaded.
 */
export function kindOf(file: { type: string; name?: string }): { kind: 'photo' | 'pdf' | 'file' } | { kind: 'video'; type: string } {
  const base = file.type.split(';')[0].trim().toLowerCase()
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? ''
  if (base === 'image/jpeg' || base === 'image/png' || base === 'image/heic' || base === 'image/heif' || base === 'image/webp') return { kind: 'photo' }
  if (base === 'application/pdf' || (!base && ext === 'pdf')) return { kind: 'pdf' }
  if (VIDEO_TYPES[base]) return { kind: 'video', type: VIDEO_TYPES[base] }
  if ((!base || base === 'application/octet-stream') && VIDEO_BY_EXTENSION[ext]) return { kind: 'video', type: VIDEO_BY_EXTENSION[ext] }
  if ((!base || base === 'application/octet-stream') && ['jpg', 'jpeg', 'png'].includes(ext)) return { kind: 'photo' }
  return { kind: 'file' }
}

export const ticketFiles = {
  /** A photo (already shrunk to a JPEG), a PDF or any other file, at most 10 MB. Cancelled with the signal (it counts towards the day's 30 otherwise). */
  upload: (file: Blob, name: string, signal?: AbortSignal) => {
    const form = new FormData()
    form.append('file', file, name)
    return api<TicketFile>('POST', '/api/v1/files/ticket', { body: form, signal })
  },
  /**
   * A video: a one-time link, the PUT straight to storage (onProgress 0..1), then "complete" checks what arrived.
   * Rejects with ApiError NETWORK when the connection drops or stalls, and AbortError when cancelled. onArrived gets
   * the upload's id once the bytes are in storage: a failed "complete" is then tried again with {@link complete}
   * alone, without sending the video again.
   */
  video: async (file: Blob, type: string, onProgress: (done: number) => void, signal?: AbortSignal, onArrived?: (uploadId: string) => void) => {
    const link = await api<VideoLink>('POST', '/api/v1/files/ticket/videos', { body: { sizeBytes: file.size, contentType: type }, signal })
    await put(link, file, onProgress, signal)
    onArrived?.(link.uploadId)
    return ticketFiles.complete(link.uploadId, signal)
  },
  /** Checks a video that arrived in storage and records it (again: the same file). */
  complete: (uploadId: string, signal?: AbortSignal) =>
    api<TicketFile>('POST', `/api/v1/files/ticket/videos/${encodeURIComponent(uploadId)}/complete`, { signal }),
}

function put(link: VideoLink, file: Blob, onProgress: (done: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let stalled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const watch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        stalled = true
        xhr.abort()
      }, STALL_MS)
    }
    const done = (f: () => void) => {
      clearTimeout(timer)
      f()
    }
    xhr.open('PUT', link.uploadUrl)
    xhr.setRequestHeader('Content-Type', link.contentType)
    xhr.upload.onprogress = (e) => {
      watch()
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      done(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(1)
          resolve()
        } else reject(xhr.status === 403 ? new Error('The upload link ran out. Add the video again.') : ApiError.network())
      })
    xhr.onerror = () => done(() => reject(ApiError.network()))
    xhr.onabort = () => done(() => reject(stalled ? ApiError.network() : new DOMException('Cancelled', 'AbortError')))
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'))
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    watch()
    xhr.send(file)
  })
}
