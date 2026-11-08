import { ApiError } from '../api/errors'
import { VideoSendError } from '../api/shop'
import type { Shop, VideoUploadLink } from '../api/types'

/** The salon video's limits, as the backend checks them (VideoUploadService). */
export const VIDEO_MIN_SECONDS = 15
export const VIDEO_MAX_SECONDS = 45
/** The backend takes a second either way of the length the phone sends (rounded). */
const SLACK_SECONDS = 1
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024
/** A link is renewed when less than this is left (a slow phone needs time to send the file). */
const LINK_MARGIN_MS = 60_000

const TYPES: Record<string, string> = {
  'video/mp4': 'video/mp4',
  'video/quicktime': 'video/quicktime',
  'video/webm': 'video/webm',
}
const BY_EXTENSION: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }

export const TOO_BIG = 'This video is too big. Set the camera to 1080p (HD) and record about 30 seconds.'
export const LENGTH_UNKNOWN = `We couldn't read this video's length. Make sure it's ${VIDEO_MIN_SECONDS}–${VIDEO_MAX_SECONDS} seconds.`
export const SHOP_CHANGED_AGAIN = 'Your salon was changed on another phone. Reload the page, then add the video again.'

/**
 * The type to send for a picked file: its own type without extras ("video/webm;codecs=vp8"), or from its name when
 * the phone gave none; null when it isn't MP4, MOV or WebM.
 */
export function videoTypeOf(file: { type: string; name?: string }): string | null {
  const base = file.type.split(';')[0].trim().toLowerCase()
  if (TYPES[base]) return TYPES[base]
  if (base && base !== 'application/octet-stream') return null
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? ''
  return BY_EXTENSION[ext] ?? null
}

/** The length sent to the backend: rounded, as it compares it. */
export function sentSeconds(seconds: number): number {
  return Math.round(seconds)
}

/**
 * What is wrong with a picked video before anything is sent, or null when it may go. The same rule as the backend:
 * the rounded length must be 14 to 46 seconds (15–45 with a second either way). An unreadable length (null) isn't
 * a problem here: the owner is asked to check it and may upload anyway. Lengths in messages are whole seconds, cut
 * down (never rounded up into the allowed range).
 */
export function videoProblem(v: { type: string | null; size: number; seconds: number | null }): string | null {
  if (!v.type) return 'Pick a video (MP4, MOV or WebM).'
  if (v.size > VIDEO_MAX_BYTES) return TOO_BIG
  if (v.seconds === null) return null
  const sent = sentSeconds(v.seconds)
  const shown = Math.floor(v.seconds)
  if (sent < VIDEO_MIN_SECONDS - SLACK_SECONDS) {
    return `This video is ${shown} seconds. Record at least ${VIDEO_MIN_SECONDS} seconds: start outside at the board, then walk in and turn slowly.`
  }
  if (sent > VIDEO_MAX_SECONDS + SLACK_SECONDS) {
    return `This video is ${shown} seconds. Keep it under ${VIDEO_MAX_SECONDS} seconds — about 30 is ideal.`
  }
  return null
}

/** A link and when this phone got it: its end is counted from then, so a phone clock that is off doesn't matter. */
export interface HeldLink {
  link: VideoUploadLink
  receivedAt: number
  /** Failed PUTs on this link so far. */
  failures: number
}

export function hold(link: VideoUploadLink, receivedAt: number): HeldLink {
  return { link, receivedAt, failures: 0 }
}

/** Whether the link still has more than a minute left, by the phone's own count since it arrived. */
export function linkUsable(held: HeldLink, now: number): boolean {
  const seconds = held.link.expiresInSeconds ?? (Date.parse(held.link.expiresAt) - held.receivedAt) / 1000
  return held.receivedAt + seconds * 1000 - now > LINK_MARGIN_MS
}

/**
 * After a failed PUT to R2: try the same link again, or get a new one. 403 means the link ran out or was refused.
 * A refusal without CORS headers reaches the page as a network error (status 0), so a second one on the same link
 * is taken as that. R2's own trouble (5xx) and a first dropped connection keep the link.
 */
export function afterSendFailure(e: unknown, failuresBefore: number): 'same-link' | 'new-link' {
  if (e instanceof VideoSendError) return e.linkExpired ? 'new-link' : 'same-link'
  if (e instanceof ApiError && e.code === 'NETWORK') return failuresBefore >= 1 ? 'new-link' : 'same-link'
  return 'same-link'
}

/**
 * After "complete" failed: what the next try does. 'start-over' (the upload is unknown, gone or too old: a new link
 * and the file sent again), 'send-again' (the file didn't arrive whole: sent again, a new link if needed), 'pick-again'
 * (refused for good: another video), 'complete-again' (network, a busy backend: only "complete" again).
 */
export function afterCompleteFailure(e: unknown): 'start-over' | 'send-again' | 'pick-again' | 'complete-again' {
  if (!(e instanceof ApiError)) return 'complete-again'
  switch (e.code) {
    case 'UPLOAD_NOT_FOUND':
    case 'UPLOAD_EXPIRED':
    case 'UPLOAD_GONE':
      return 'start-over'
    case 'UPLOAD_NOT_FINISHED':
    case 'UPLOAD_SIZE_MISMATCH':
      return 'send-again'
    case 'UNSUPPORTED_FILE_TYPE':
    case 'FILE_TOO_LARGE':
    case 'OWNER_ONLY':
    case 'NOT_A_SALON':
      return 'pick-again'
    default:
      return 'complete-again'
  }
}

/** Refusals of a picked video for good (asking for its link): pick another rather than try the same one. */
export function refusedForGood(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    ['UNSUPPORTED_FILE_TYPE', 'VALIDATION_FAILED', 'FILE_TOO_LARGE', 'TOO_MANY_UPLOADS', 'OWNER_ONLY', 'NOT_A_SALON'].includes(e.code)
  )
}

/** The words for a failed video step (asking for the link, the upload itself, or recording it). */
export function videoErrorText(e: unknown): string {
  if (e instanceof VideoSendError) {
    return e.linkExpired ? 'The upload took too long. Tap Try again.' : "The video didn't go through. Tap Try again."
  }
  if (!(e instanceof ApiError)) return 'Something went wrong. Tap Try again.'
  switch (e.code) {
    case 'NETWORK':
      return "The upload stopped: you're offline or the network dropped. Tap Try again."
    case 'FILE_TOO_LARGE':
      return TOO_BIG
    case 'VALIDATION_FAILED':
      return `Keep the video between ${VIDEO_MIN_SECONDS} and ${VIDEO_MAX_SECONDS} seconds — about 30 is ideal.`
    case 'UNSUPPORTED_FILE_TYPE':
      return "That file isn't a video we can use. Record it again with the phone's camera."
    case 'UPLOAD_SIZE_MISMATCH':
    case 'UPLOAD_NOT_FINISHED':
      return "The video didn't arrive whole. Tap Try again."
    case 'UPLOAD_EXPIRED':
    case 'UPLOAD_NOT_FOUND':
      return 'The upload took too long. Tap Try again to send it again.'
    case 'UPLOAD_GONE':
      return 'This video expired. Upload it again.'
    case 'SHOP_CHANGED':
      return SHOP_CHANGED_AGAIN
    default:
      return e.message
  }
}

/**
 * The video's length in seconds as the phone's browser reads it (null when it can't: an error, no length, or no
 * answer in time). WebM from some phones reports an endless length (Infinity) until the browser is asked to seek past
 * its end; then the real length arrives with durationchange.
 */
export function readVideoSeconds(file: Blob, timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const finish = (seconds: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(seconds)
    }
    const usable = (d: number) => Number.isFinite(d) && d > 0
    const timer = setTimeout(() => finish(null), timeoutMs)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      if (usable(video.duration)) finish(video.duration)
      else if (video.duration === Infinity) {
        video.ondurationchange = () => {
          if (usable(video.duration)) finish(video.duration)
        }
        video.currentTime = 1e7
      } else finish(null)   // NaN: no length at all
    }
    video.onerror = () => finish(null)
    video.src = url
  })
}

/** What the backend needs before Submit for visit (else 409 PHOTOS_REQUIRED): both photos, and a salon's video. */
export function readyForVisit(shop: Pick<Shop, 'ownerPhotoFileId' | 'shopPhotoFileId' | 'shopVideoFileId'> & { type?: Shop['type'] }): boolean {
  return Boolean(shop.ownerPhotoFileId && shop.shopPhotoFileId && (shop.type === 'KIRANA' || shop.shopVideoFileId))
}
