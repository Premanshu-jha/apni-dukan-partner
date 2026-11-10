import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { useSession } from '../store/session'
import { api, refreshSession } from './client'
import { ApiError, isApiError } from './errors'
import type {
  Described,
  FileLink,
  FilePurpose,
  GeocodeIn,
  HandoverRequested,
  HandoverView,
  IncomingHandover,
  IncomingInvite,
  InviteResult,
  InviteView,
  Located,
  RegistrationDocType,
  Shop,
  ShopDetailsIn,
  ShopMember,
  StoredFile,
  VideoUploadLink,
} from './types'

const S = '/api/v1/shops'

export const shopKeys = {
  mine: ['shop'] as const,
  members: ['shop', 'members'] as const,
  /** My shop's waiting hand-over request (owner). */
  handover: ['shop', 'handover'] as const,
  /** Hand-over requests waiting for my phone. Not under 'shop': it is about the person, shop or not. */
  incoming: ['me', 'handover'] as const,
  /** My shop's waiting invitations (owner). */
  invites: ['shop', 'invites'] as const,
  /** Invitations waiting for my phone. Not under 'shop': it is about the person, shop or not. */
  incomingInvites: ['me', 'invites'] as const,
  photo: (id: string) => ['file', id] as const,
}

/** My shop, or null when this person has none yet (404 NO_SHOP). */
export async function fetchMyShop(): Promise<Shop | null> {
  try {
    return await api<Shop>('GET', `${S}/me`)
  } catch (e) {
    if (isApiError(e, 'NO_SHOP')) return null
    throw e
  }
}

/**
 * The shop gate's data. Checked again whenever the app comes back to the front, so an approval, a suspension or
 * being added as a helper shows without signing in again.
 */
export function useMyShop() {
  return useQuery({ queryKey: shopKeys.mine, queryFn: fetchMyShop, refetchOnWindowFocus: true, staleTime: 30_000 })
}

/** Set by the shop gate for every screen inside it. */
export const ShopContext = createContext<Shop | null>(null)

/** The shop the gate loaded (screens inside the gate only). */
export function useShop(): Shop {
  const shop = useContext(ShopContext)
  if (!shop) throw new Error('useShop outside the shop gate')
  return shop
}

/** The shop id the access token carries (the "shop" claim), or null. */
export function tokenShop(token: string | null): string | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4))
    const claims = JSON.parse(json) as { shop?: string }
    return claims.shop ?? null
  } catch {
    return null
  }
}

/**
 * File uploads use the shop in the sign-in token, which is set when the token is made. Right after registering
 * (or being added to a shop) the token has none yet, so swap it for a fresh one first.
 */
export async function ensureShopInToken(): Promise<void> {
  const token = useSession.getState().accessToken
  if (token && tokenShop(token)) return
  await refreshSession()
}

export const shopApi = {
  create: async (details: ShopDetailsIn) => {
    const shop = await api<Shop>('POST', S, { body: { ...details, type: 'SALON' } })
    // The backend asks for a refresh so the token carries the new shop (uploads need it).
    await refreshSession()
    return shop
  },
  /** Where a typed address is (registration step 1, "Find my salon on the map"). */
  geocode: (address: GeocodeIn) => api<Located>('POST', `${S}/geocode`, { body: address }),
  /** The address at the phone's GPS point (registration step 1 fills the empty address fields from it). */
  reverseGeocode: (latitude: number, longitude: number) =>
    api<Described>('POST', `${S}/reverse-geocode`, { body: { latitude, longitude } }),
  update: (version: number, details: Partial<ShopDetailsIn>) =>
    api<Shop>('PATCH', `${S}/me`, { body: { version, ...details } }),
  setPhotos: (version: number, photos: { ownerPhotoFileId?: string; shopPhotoFileId?: string }) =>
    api<Shop>('PUT', `${S}/me/photos`, { body: { version, ...photos } }),
  /** Set the salon video (owner): the file from videoApi.complete. A video it replaces is deleted. */
  setVideo: (version: number, fileId: string) => api<Shop>('PUT', `${S}/me/video`, { body: { version, fileId } }),
  setRegistrationDoc: (version: number, type: RegistrationDocType, fileId: string) =>
    api<Shop>('PUT', `${S}/me/registration-document`, { body: { version, type, fileId } }),
  /** Remove it (owner): customers see "Unregistered" from now on. */
  removeRegistrationDoc: (version: number) =>
    api<Shop>('DELETE', `${S}/me/registration-document?version=${version}`),
  submit: (version: number) => api<Shop>('POST', `${S}/me/submit`, { body: { version } }),
  members: () => api<ShopMember[]>('GET', `${S}/me/members`),
  /** Invite a helper (owner): 202 with the same message for any number; they join when they accept. */
  addHelper: (phone: string) => api<InviteResult>('POST', `${S}/me/helpers`, { body: { phone } }),
  /** My shop's invitations still waiting, helpers and barbers (owner). */
  invites: () => api<InviteView[]>('GET', `${S}/me/invites`),
  /** Cancel one (owner). 204. */
  cancelInvite: (id: string) => api<void>('DELETE', `${S}/me/invites/${encodeURIComponent(id)}`),
  /** Invitations waiting for my phone (anyone signed in, shop or not). */
  incomingInvites: () => api<IncomingInvite[]>('GET', '/api/v1/me/invites'),
  /** Join the shop: 200 with it (myRole HELPER or BARBER), then the session is refreshed so the token carries it. */
  acceptInvite: async (id: string) => {
    const shop = await api<Shop>('POST', `/api/v1/me/invites/${encodeURIComponent(id)}/accept`)
    const renewed = (await refreshSession()) || (await refreshSession())
    return { shop, renewed }
  },
  /** Say no (204); the owner is told. */
  declineInvite: (id: string) => api<void>('POST', `/api/v1/me/invites/${encodeURIComponent(id)}/decline`),
  removeHelper: (userId: string) => api<ShopMember[]>('DELETE', `${S}/me/helpers/${userId}`),
  leave: () => api<void>('POST', `${S}/me/leave`),

  /** Close my shop for good (owner). 200 with the shop, status CLOSED; then refresh the session (no shop any more). */
  close: (version: number, reason: string | null) =>
    api<Shop>('POST', `${S}/me/close`, { body: { version, ...(reason ? { reason } : {}) } }),
  /** Ask the person with this phone to take my shop over (owner). 202 with the same message for any number. */
  requestHandover: (phone: string, version: number) =>
    api<HandoverRequested>('POST', `${S}/me/handover`, { body: { phone, version } }),
  /** My shop's waiting request, or null (404 NO_HANDOVER). */
  myHandover: async (): Promise<HandoverView | null> => {
    try {
      return await api<HandoverView>('GET', `${S}/me/handover`)
    } catch (e) {
      if (isApiError(e, 'NO_HANDOVER')) return null
      throw e
    }
  },
  /** Cancel it (204, also when none waits). */
  cancelHandover: () => api<void>('DELETE', `${S}/me/handover`),

  /** Requests waiting for my phone (anyone signed in, shop or not). */
  incoming: () => api<IncomingHandover[]>('GET', '/api/v1/me/handover'),
  /** Take the shop over: 200 with the shop (myRole OWNER), then the session is refreshed so the token carries it. */
  /** `renewed` false: the shop is theirs, but this phone's sign-in couldn't be renewed (tried twice); try again later. */
  accept: async (id: string) => {
    const shop = await api<Shop>('POST', `/api/v1/me/handover/${encodeURIComponent(id)}/accept`)
    const renewed = (await refreshSession()) || (await refreshSession())
    return { shop, renewed }
  },
  decline: (id: string) => api<void>('POST', `/api/v1/me/handover/${encodeURIComponent(id)}/decline`),
}

/** My shop's waiting hand-over request (owner screens). */
export function useMyHandover() {
  return useQuery({ queryKey: shopKeys.handover, queryFn: shopApi.myHandover })
}

/**
 * Hand-over requests waiting for my phone: read on opening the app's first screens and on every return to the app, so a
 * request (or its message) shows without signing in again.
 */
export function useIncomingHandovers() {
  return useQuery({ queryKey: shopKeys.incoming, queryFn: shopApi.incoming, refetchOnWindowFocus: true, staleTime: 30_000 })
}

/** Invitations waiting for my phone: read on the first screens and on every return to the app (as hand-overs). */
export function useIncomingInvites() {
  return useQuery({ queryKey: shopKeys.incomingInvites, queryFn: shopApi.incomingInvites, refetchOnWindowFocus: true, staleTime: 30_000 })
}

/** My shop's waiting invitations (owner screens). */
export function useShopInvites() {
  return useQuery({ queryKey: shopKeys.invites, queryFn: shopApi.invites })
}

export const fileApi = {
  upload: async (file: Blob, name: string, purpose: FilePurpose) => {
    await ensureShopInToken()
    const send = () => {
      const form = new FormData()
      form.append('file', file, name)
      return api<StoredFile>('POST', `/api/v1/files?purpose=${purpose}`, { body: form })
    }
    try {
      return await send()
    } catch (e) {
      // 403 SHOP_REQUIRED: the token's shop is out of date (taken over, a renewal that failed): renew once, send again
      if (!isApiError(e, 'SHOP_REQUIRED') || !(await refreshSession())) throw e
      return send()
    }
  },
  link: (id: string) => api<FileLink>('GET', `/api/v1/files/${id}/link`),
}

/**
 * R2 answered the PUT with an error. `linkExpired` (403: the link ran out or was refused) needs a new link; a 5xx is
 * R2's own trouble and the same link may be tried again.
 */
export class VideoSendError extends Error {
  readonly status: number
  readonly linkExpired: boolean
  constructor(status: number) {
    super(status === 403 ? 'The upload link ran out.' : "The video didn't go through. Try again.")
    this.name = 'VideoSendError'
    this.status = status
    this.linkExpired = status === 403
  }
}

/** No upload progress for this long: the connection is taken as dropped (a phone that lost signal mid-upload). */
export const VIDEO_STALL_MS = 60_000

/**
 * The salon video: too big for the backend, so the phone sends it straight to R2 (see the backend's "The salon
 * video"): start gives a one-time link, send PUTs the file there with progress, complete records it.
 */
export const videoApi = {
  /** durationSeconds null: the phone couldn't read the length (the owner chose "Upload anyway"). */
  start: async (sizeBytes: number, contentType: string, durationSeconds: number | null) => {
    await ensureShopInToken()
    const ask = () =>
      api<VideoUploadLink>('POST', '/api/v1/files/video-uploads', { body: { sizeBytes, contentType, durationSeconds } })
    try {
      return await ask()
    } catch (e) {
      // As for photos: a token whose shop is out of date gets one renewal and one more try
      if (!isApiError(e, 'SHOP_REQUIRED') || !(await refreshSession())) throw e
      return ask()
    }
  },
  /**
   * PUTs the file to the link, calling onProgress with 0..1. Rejects with ApiError NETWORK when the connection drops
   * (also a CORS-less refusal, which the browser reports as status 0) or nothing moved for VIDEO_STALL_MS,
   * VideoSendError when R2 answered with an error, and an AbortError when cancelled.
   */
  send: (link: VideoUploadLink, file: Blob, onProgress: (done: number) => void, signal?: AbortSignal, stallMs = VIDEO_STALL_MS) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      let stalled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const watch = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          stalled = true
          xhr.abort()
        }, stallMs)
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
          } else reject(new VideoSendError(xhr.status))
        })
      xhr.onerror = () => done(() => reject(ApiError.network()))
      xhr.ontimeout = () => done(() => reject(ApiError.network()))
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
    }),
  complete: (uploadId: string) =>
    api<StoredFile>('POST', `/api/v1/files/video-uploads/${encodeURIComponent(uploadId)}/complete`),
}

/**
 * A link to play the salon video: links last 5 minutes, so a fresh one is read every 4 minutes (the player keeps the
 * one it loaded, see SalonVideo).
 */
export function useVideoLink(id: string | null) {
  return useQuery({
    queryKey: [...shopKeys.photo(id ?? 'none'), 'video'],
    queryFn: () => fileApi.link(id!),
    enabled: Boolean(id),
    refetchInterval: 4 * 60_000,
    staleTime: 4 * 60_000,
    gcTime: 4 * 60_000,
  })
}

/** A short-lived link to show one of the shop's photos. */
export function usePhotoLink(id: string | null) {
  return useQuery({
    queryKey: shopKeys.photo(id ?? 'none'),
    queryFn: () => fileApi.link(id!),
    enabled: Boolean(id),
    // Links last 5 minutes; get a new one before then.
    staleTime: 4 * 60_000,
    gcTime: 4 * 60_000,
  })
}
