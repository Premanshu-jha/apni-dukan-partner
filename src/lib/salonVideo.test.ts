import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { VIDEO_STALL_MS, VideoSendError, videoApi } from '../api/shop'
import type { VideoUploadLink } from '../api/types'
import {
  afterCompleteFailure,
  afterSendFailure,
  hold,
  linkUsable,
  readVideoSeconds,
  readyForVisit,
  sentSeconds,
  TOO_BIG,
  VIDEO_MAX_BYTES,
  videoErrorText,
  videoProblem,
  videoTypeOf,
} from './salonVideo'

const link: VideoUploadLink = { uploadId: 'vu1', uploadUrl: 'https://r2.test/x', contentType: 'video/mp4', sizeBytes: 10, expiresAt: '2026-11-08T05:15:00Z', expiresInSeconds: 900 }

describe('the salon video, before anything is sent', () => {
  it('takes MP4, MOV and WebM, from the type or (when the phone gives none) the name', () => {
    expect(videoTypeOf({ type: 'video/mp4', name: 'a.mp4' })).toBe('video/mp4')
    expect(videoTypeOf({ type: 'video/quicktime', name: 'IMG_0042.MOV' })).toBe('video/quicktime')
    expect(videoTypeOf({ type: 'video/webm;codecs=vp8,opus', name: 'v.webm' })).toBe('video/webm')
    expect(videoTypeOf({ type: '', name: 'IMG_0042.MOV' })).toBe('video/quicktime')
    expect(videoTypeOf({ type: 'application/octet-stream', name: 'clip.mp4' })).toBe('video/mp4')
    expect(videoTypeOf({ type: 'video/x-matroska', name: 'clip.mkv' })).toBeNull()
    expect(videoTypeOf({ type: 'image/jpeg', name: 'clip.mp4' })).toBeNull()
  })

  it('uses the backend’s rule: the rounded length 14 to 46 seconds, shown cut down to whole seconds', () => {
    const ok = { type: 'video/mp4', size: 30 * 1024 * 1024, seconds: 30 }
    expect(videoProblem(ok)).toBeNull()
    expect(videoProblem({ ...ok, seconds: 13.5 })).toBeNull()   // sent as 14
    expect(videoProblem({ ...ok, seconds: 46.4 })).toBeNull()   // sent as 46
    expect(sentSeconds(46.4)).toBe(46)
    expect(videoProblem({ ...ok, seconds: 46.5 })).toBe('This video is 46 seconds. Keep it under 45 seconds — about 30 is ideal.')
    expect(videoProblem({ ...ok, seconds: 13.4 })).toBe('This video is 13 seconds. Record at least 15 seconds: start outside at the board, then walk in and turn slowly.')
    expect(videoProblem({ ...ok, seconds: 60.9 })).toMatch(/^This video is 60 seconds\./)
    expect(videoProblem({ ...ok, size: VIDEO_MAX_BYTES + 1 })).toBe(TOO_BIG)
    expect(TOO_BIG).toBe('This video is too big. Set the camera to 1080p (HD) and record about 30 seconds.')
    expect(videoProblem({ ...ok, type: null })).toBe('Pick a video (MP4, MOV or WebM).')
    // An unreadable length isn't refused here: the owner is asked and may upload anyway
    expect(videoProblem({ ...ok, seconds: null })).toBeNull()
  })

  it('says what to do for every way an upload can fail', () => {
    expect(videoErrorText(ApiError.network())).toMatch(/offline or the network dropped. Tap Try again/)
    expect(videoErrorText(new VideoSendError(403))).toBe('The upload took too long. Tap Try again.')
    expect(videoErrorText(new VideoSendError(503))).toBe("The video didn't go through. Tap Try again.")
    expect(videoErrorText(new ApiError(409, { code: 'UPLOAD_EXPIRED', message: 'x' }))).toMatch(/took too long/)
    expect(videoErrorText(new ApiError(404, { code: 'UPLOAD_NOT_FOUND', message: 'x' }))).toMatch(/took too long/)
    expect(videoErrorText(new ApiError(409, { code: 'UPLOAD_GONE', message: 'x' }))).toBe('This video expired. Upload it again.')
    expect(videoErrorText(new ApiError(400, { code: 'UPLOAD_SIZE_MISMATCH', message: 'x' }))).toBe("The video didn't arrive whole. Tap Try again.")
    expect(videoErrorText(new ApiError(400, { code: 'UNSUPPORTED_FILE_TYPE', message: 'x' }))).toMatch(/isn't a video we can use/)
    expect(videoErrorText(new ApiError(413, { code: 'FILE_TOO_LARGE', message: 'x' }))).toBe(TOO_BIG)
    expect(videoErrorText(new ApiError(409, { code: 'SHOP_CHANGED', message: 'x' }))).toMatch(/Reload the page/)
    expect(videoErrorText(new ApiError(429, { code: 'TOO_MANY_UPLOADS', message: 'This shop started 5 video uploads today. Try again tomorrow.' }))).toBe('This shop started 5 video uploads today. Try again tomorrow.')
    expect(videoErrorText(new Error('boom'))).toBe('Something went wrong. Tap Try again.')
  })

  it('a salon is ready for the visit only with both photos and the video; a kirana without one', () => {
    const all = { ownerPhotoFileId: 'f1', shopPhotoFileId: 'f2', shopVideoFileId: 'f3' }
    expect(readyForVisit(all)).toBe(true)
    expect(readyForVisit({ ...all, shopVideoFileId: null })).toBe(false)
    expect(readyForVisit({ ...all, shopVideoFileId: undefined, type: 'SALON' })).toBe(false)
    expect(readyForVisit({ ...all, shopVideoFileId: null, type: 'KIRANA' })).toBe(true)
    expect(readyForVisit({ ...all, ownerPhotoFileId: null })).toBe(false)
  })
})

describe('the upload link', () => {
  it('lasts by the phone’s own count from when it arrived, whatever the phone’s clock says', () => {
    // The phone's clock is two hours behind: the server's expiresAt looks far away, but expiresInSeconds counts
    const held = hold({ ...link, expiresAt: new Date(Date.UTC(2026, 10, 8, 7)).toISOString() }, 1_000_000)
    expect(linkUsable(held, 1_000_000 + 13 * 60_000)).toBe(true)
    expect(linkUsable(held, 1_000_000 + 14 * 60_000 + 1)).toBe(false)   // less than a minute left
    // An older backend without expiresInSeconds: the server's time is used
    const old = hold({ ...link, expiresInSeconds: undefined, expiresAt: new Date(2_000_000 + 900_000).toISOString() }, 2_000_000)
    expect(linkUsable(old, 2_000_000 + 10 * 60_000)).toBe(true)
  })

  it('keeps the link after R2’s own trouble or a first dropped connection, gets a new one after 403 or a second drop', () => {
    expect(afterSendFailure(new VideoSendError(503), 0)).toBe('same-link')
    expect(afterSendFailure(new VideoSendError(500), 3)).toBe('same-link')
    expect(afterSendFailure(new VideoSendError(403), 0)).toBe('new-link')
    expect(afterSendFailure(ApiError.network(), 0)).toBe('same-link')
    expect(afterSendFailure(ApiError.network(), 1)).toBe('new-link')   // a CORS-less 403 looks like this
  })

  it('after a failed complete: start over, send again, pick again, or only complete again', () => {
    const e = (code: string) => new ApiError(409, { code, message: 'x' })
    expect(afterCompleteFailure(e('UPLOAD_NOT_FOUND'))).toBe('start-over')
    expect(afterCompleteFailure(e('UPLOAD_EXPIRED'))).toBe('start-over')
    expect(afterCompleteFailure(e('UPLOAD_GONE'))).toBe('start-over')
    expect(afterCompleteFailure(e('UPLOAD_NOT_FINISHED'))).toBe('send-again')
    expect(afterCompleteFailure(e('UPLOAD_SIZE_MISMATCH'))).toBe('send-again')
    expect(afterCompleteFailure(e('UNSUPPORTED_FILE_TYPE'))).toBe('pick-again')
    expect(afterCompleteFailure(ApiError.network())).toBe('complete-again')
    expect(afterCompleteFailure(e('SERVICE_BUSY'))).toBe('complete-again')
  })
})

/** A <video> the test drives: what duration it reports, and when. */
function fakeVideo(onSrc: (v: Record<string, unknown> & { duration: number }) => void) {
  const real = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'video') return real(tag)
    const v: Record<string, unknown> & { duration: number } = { duration: NaN, removeAttribute: () => undefined }
    Object.defineProperty(v, 'src', { set: () => onSrc(v) })
    Object.defineProperty(v, 'currentTime', {
      set: (t: number) => {
        v.seekedTo = t
        v.duration = 20.4
        ;(v.ondurationchange as () => void)?.()
      },
    })
    return v as unknown as HTMLElement
  }) as typeof document.createElement)
}

describe('reading the video’s length', () => {
  afterEach(() => vi.restoreAllMocks())
  URL.createObjectURL = () => 'blob:test'
  URL.revokeObjectURL = () => undefined

  it('a WebM reporting an endless length is asked to seek to its end, then its real length is read', async () => {
    let video: Record<string, unknown> = {}
    fakeVideo((v) => {
      video = v
      v.duration = Infinity
      setTimeout(() => (v.onloadedmetadata as () => void)())
    })
    expect(await readVideoSeconds(new Blob(['x']))).toBe(20.4)
    expect(video.seekedTo).toBe(1e7)
  })

  it('no length at all, an error or no answer in time: null (the owner may upload anyway)', async () => {
    fakeVideo((v) => setTimeout(() => (v.onloadedmetadata as () => void)()))
    expect(await readVideoSeconds(new Blob(['x']))).toBeNull()
    vi.restoreAllMocks()
    fakeVideo((v) => setTimeout(() => (v.onerror as () => void)()))
    expect(await readVideoSeconds(new Blob(['x']))).toBeNull()
    vi.restoreAllMocks()
    fakeVideo(() => undefined)
    expect(await readVideoSeconds(new Blob(['x']), 20)).toBeNull()
  })
})

/** An XMLHttpRequest that never answers by itself; the test moves its upload along. */
class SilentXhr {
  static last: SilentXhr
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {}
  onload?: () => void
  onerror?: () => void
  ontimeout?: () => void
  onabort?: () => void
  status = 0
  aborted = false
  constructor() {
    SilentXhr.last = this
  }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() {
    this.aborted = true
    this.onabort?.()
  }
}

describe('sending the video', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('a send with no progress for 60 seconds is dropped as a network failure (Try again is offered)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('XMLHttpRequest', SilentXhr)
    const sending = videoApi.send(link, new Blob(['x']), () => undefined)
    const failed = expect(sending).rejects.toMatchObject({ code: 'NETWORK' })
    // Progress keeps it going…
    vi.advanceTimersByTime(VIDEO_STALL_MS - 1000)
    SilentXhr.last.upload.onprogress!({ lengthComputable: true, loaded: 5, total: 10 })
    vi.advanceTimersByTime(VIDEO_STALL_MS - 1000)
    expect(SilentXhr.last.aborted).toBe(false)
    // …a minute without any stops it
    vi.advanceTimersByTime(1000)
    expect(SilentXhr.last.aborted).toBe(true)
    await failed
  })

  it('a cancel is a cancel (not a network failure), and R2’s answers keep their status', async () => {
    vi.stubGlobal('XMLHttpRequest', SilentXhr)
    const controller = new AbortController()
    const cancelled = videoApi.send(link, new Blob(['x']), () => undefined, controller.signal)
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })

    const refused = videoApi.send(link, new Blob(['x']), () => undefined)
    SilentXhr.last.status = 503
    SilentXhr.last.onload!()
    await expect(refused).rejects.toMatchObject({ status: 503, linkExpired: false })
  })
})
