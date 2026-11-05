import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { useSession } from '../store/session'
import { api, refreshSession } from './client'
import { isApiError } from './errors'
import type { FileLink, FilePurpose, Shop, ShopDetailsIn, ShopMember, StoredFile } from './types'

const S = '/api/v1/shops'

export const shopKeys = {
  mine: ['shop'] as const,
  members: ['shop', 'members'] as const,
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
  update: (version: number, details: Partial<ShopDetailsIn>) =>
    api<Shop>('PATCH', `${S}/me`, { body: { version, ...details } }),
  setPhotos: (version: number, photos: { ownerPhotoFileId?: string; shopPhotoFileId?: string }) =>
    api<Shop>('PUT', `${S}/me/photos`, { body: { version, ...photos } }),
  submit: (version: number) => api<Shop>('POST', `${S}/me/submit`, { body: { version } }),
  members: () => api<ShopMember[]>('GET', `${S}/me/members`),
  addHelper: (phone: string) => api<ShopMember[]>('POST', `${S}/me/helpers`, { body: { phone } }),
  removeHelper: (userId: string) => api<ShopMember[]>('DELETE', `${S}/me/helpers/${userId}`),
  leave: () => api<void>('POST', `${S}/me/leave`),
}

export const fileApi = {
  upload: async (file: Blob, name: string, purpose: FilePurpose) => {
    await ensureShopInToken()
    const form = new FormData()
    form.append('file', file, name)
    return api<StoredFile>('POST', `/api/v1/files?purpose=${purpose}`, { body: form })
  },
  link: (id: string) => api<FileLink>('GET', `/api/v1/files/${id}/link`),
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
