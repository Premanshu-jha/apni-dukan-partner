import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { api } from './client'
import { kiranaKeys, type Product, type Unit } from './kirana'
import { fileApi } from './shop'
import type { FilePurpose, StoredFile } from './types'

/**
 * A kirana's product setup after Submit (the backend's README "Kirana product setup after Submit"): every product the
 * shop sells, each with a count and a picture, from photographed pages of its own list (read by AI into lines to add or
 * skip) or added one by one. "I've added all my products" (POST /setup/finish, the owner) books the field visit; the
 * shop can't be approved before. Shapes follow StockResponses (SetupView, ListLineView, PhotoNeededView, ReadView).
 * Every decision is saved as it is made, so the setup goes on from where it was left (another phone, a reload).
 */
const K = '/api/v1/kirana'

/** What the home screen offers next (SetupView.nextStep). */
export type SetupStep = 'ADD' | 'LIST' | 'COUNT' | 'PHOTOS' | 'WAIT' | 'FINISH' | 'DONE'

export interface ProductRef {
  id: string
  name: string
}

/** A page of the shop's list, as the setup shows it (SetupPageView). */
export interface SetupPage {
  readId: string
  pageNo: number
  fileId: string | null
  /** READING, READ or FAILED (take it again: failureCode says why). */
  status: 'READING' | 'READ' | 'FAILED' | string
  failure: string | null
  /** Products on the page past the 150 one read keeps: photograph them again. */
  linesLeftOut: number
  linesToCheck: number
  linesAdded: number
  linesSkipped: number
  sentAt: string
  recount: boolean
  linesAutoCounted: number
  /** ReadFailure's code (NOT_A_LIST, LIST_UNREADABLE …), worded by the app; OTHER for an old reason. */
  failureCode: string | null
}

/** GET /kirana/setup: where the shop's product setup stands. */
export interface SetupView {
  /** When the owner said all products are added; null until then. */
  readyAt: string | null
  products: number
  uncounted: number
  /** Up to 20 of them, by name. */
  uncountedProducts: ProductRef[]
  linesToCheck: number
  linesAdded: number
  linesSkipped: number
  pagesReading: number
  pagesFailed: number
  pagesLeft: number
  pages: SetupPage[]
  photosMissing: number
  photosChecking: number
  photosRefused: number
  photosFinding: number
  photosLeftToday: number
  nextStep: SetupStep
  canFinish: boolean
  /** canFinish, and the caller is the owner (only the owner says it). */
  youCanFinish: boolean
  /** Finished, but products added since still need a count or picture before the visit's approval. */
  beforeApproval: boolean
}

/** A product the line may be: one of the shop's (productId), or a catalogue item it doesn't have yet (itemId). */
export interface Suggestion {
  productId: string | null
  itemId: string | null
  name: string
  brand: string | null
  size: string | null
  pricePaise: number | null
  score: number
}

/** A line of the shop's list, as read (ListLineView). */
export interface ListLine {
  id: string
  readId: string
  pageNo: number | null
  lineNo: number
  wording: string
  brand: string | null
  name: string | null
  size: string | null
  byWeight: boolean
  mrpPaise: number | null
  /** What the list says (a hint: counted again when added); null if not written. */
  quantity: number | null
  status: 'NEW' | 'ADDED' | 'SKIPPED'
  productId: string | null
  counted: number | null
  suggestions: Suggestion[]
  /** The first suggestion is a clear match. */
  sure: boolean
  autoCounted: boolean
  countBefore: number | null
  productName: string | null
  stockNow: number | null
  countPutBack: boolean | null
}

export interface ListLinePage {
  items: ListLine[]
  next: string | null
}

/** ADD (onto a product, or as a new one), SKIP, or UNDO a skipped line. */
export type LineDecision =
  | { action: 'ADD'; quantity: number; productId: string; addToCount?: boolean }
  | { action: 'ADD'; quantity: number; itemId?: string; name?: string; unit?: Unit; pricePaise?: number }
  | { action: 'SKIP' }
  | { action: 'UNDO' }

/** A product still needing a picture, with what the camera screen tells the shopkeeper (PhotoNeededView). */
export interface PhotoNeeded {
  productId: string
  name: string
  /** Sold by the kg: a photo of the goods in their sack or bin. */
  loose: boolean
  /** The size the photo must show ("250 ml"); null when its name has none. */
  sizeToShow: string | null
  /** CHECKING, REFUSED or NEED_SIZE (a photo of the side with the size); null: no photo sent yet. */
  photoCheck: 'CHECKING' | 'REFUSED' | 'NEED_SIZE' | null
  /** Why it was refused (PhotoRules: WRONG_SIZE, OTHER_PRODUCT, BLURRY …), worded by the app. */
  code: string | null
  reason: string | null
  /** What the photo showed (another product, another size). */
  seen: string | null
  newPhotoUrl: string | null
  /** The company's picture may still come (nothing to do yet; a photo may be taken anyway). */
  findingPicture: boolean
}

export interface PhotoNeededPage {
  items: PhotoNeeded[]
  next: string | null
}

/** A photo sent to be read (ReadView). */
export interface ReadView {
  id: string
  kind: string
  status: string
  fileIds: string[]
  failure: string | null
  createdAt: string
  recount: boolean
  failureCode: string | null
}

const q = (params: Record<string, string | null | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  const text = s.toString()
  return text ? `?${text}` : ''
}
const id = encodeURIComponent

export const setupKeys = {
  all: ['kirana', 'setup'] as const,
  view: ['kirana', 'setup', 'view'] as const,
  lines: (status: string) => ['kirana', 'setup', 'lines', status] as const,
  photos: ['kirana', 'setup', 'photos'] as const,
}

export const setupApi = {
  get: () => api<SetupView>('GET', `${K}/setup`),
  lines: (status: 'NEW' | 'SKIPPED' | 'ADDED', cursor?: string | null) =>
    api<ListLinePage>('GET', `${K}/setup/lines${q({ status, cursor })}`),
  decide: (lineId: string, d: LineDecision) => api<ListLine>('POST', `${K}/setup/lines/${id(lineId)}`, { body: d }),
  photos: (cursor?: string | null) => api<PhotoNeededPage>('GET', `${K}/setup/photos${q({ cursor })}`),
  finish: () => api<SetupView>('POST', `${K}/setup/finish`),
  /** One page of the list (a BILL upload), to be read: the same clientRef again returns the first upload. */
  sendPage: (clientRef: string, fileId: string, recount = false) =>
    api<ReadView>('POST', `${K}/reads`, { body: { clientRef, kind: 'STOCK_LIST', fileIds: [fileId], recount: recount || undefined } }),
  discardPage: (readId: string) => api<ReadView>('POST', `${K}/reads/${id(readId)}/discard`),
  /** A product's photo (a PRODUCT_PHOTO upload), checked before it shows; sizeFileId alone after NEED_SIZE. */
  setPhoto: (productId: string, p: { clientRef: string; fileId?: string | null; sizeFileId?: string | null }) =>
    api<Product>('PUT', `${K}/products/${id(productId)}/photo`, { body: p }),
  /** A count by hand (the product's stock becomes it); the same clientRef again counts once. */
  count: (productId: string, clientRef: string, quantity: number) =>
    api<Product>('POST', `${K}/products/${id(productId)}/stock`, { body: { clientRef, reason: 'COUNT', quantity } }),
}

/** The kirana's own upload kinds (FileService): a page of the list is a BILL, a pack's photo a PRODUCT_PHOTO. */
export function uploadKiranaFile(file: Blob, name: string, purpose: 'BILL' | 'PRODUCT_PHOTO'): Promise<StoredFile> {
  return fileApi.upload(file, name, purpose as FilePurpose)
}

/**
 * How often the setup is read again while something is on its way, slowing down the longer it waits: a page being
 * read every 8 s and a photo check every 20 s for the first 2 minutes, then every minute until 10 minutes, then every
 * 5 minutes until 30 minutes, then not at all (the screen offers "Check again"). The backend may keep a photo
 * "checking" for hours (the AI down or not set up): a phone left open never asks every 20 s all day. Never otherwise.
 * `waitedMs`: how long the screen has been waiting.
 */
export function setupPollMs(v: SetupView | undefined, waitedMs = 0): number | false {
  if (!v) return false
  const reading = v.pagesReading > 0
  if (!reading && v.photosChecking + v.photosFinding === 0) return false
  if (waitedMs < 2 * 60_000) return reading ? 8_000 : 20_000
  if (waitedMs < 10 * 60_000) return 60_000
  if (waitedMs < 30 * 60_000) return 300_000
  return false
}

/**
 * Where the setup stands (owner or helper). `enabled`: only for a shop not approved yet. `poll`: only the setup's own
 * screens follow a page being read or photos being checked; the counter's strip reads it once (and on coming back).
 */
export function useSetup(enabled = true, poll = true) {
  const since = useRef<number | null>(null)
  return useQuery({
    queryKey: setupKeys.view,
    queryFn: setupApi.get,
    enabled,
    staleTime: 15_000,
    refetchInterval: (query) => {
      if (!poll) return false
      const v = query.state.data
      if (setupPollMs(v) === false) {
        since.current = null
        return false
      }
      since.current ??= Date.now()
      return setupPollMs(v, Date.now() - since.current)
    },
  })
}

/** Lines to check, 20 at a time (the first page again once those are decided: the decided ones are gone from it). */
export function useNewLines() {
  return useQuery({ queryKey: setupKeys.lines('NEW'), queryFn: () => setupApi.lines('NEW'), staleTime: 60_000 })
}

export function useSkippedLines() {
  return useInfiniteQuery({
    queryKey: setupKeys.lines('SKIPPED'),
    queryFn: ({ pageParam }) => setupApi.lines('SKIPPED', pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
  })
}

export function usePhotosNeeded() {
  return useInfiniteQuery({
    queryKey: setupKeys.photos,
    queryFn: ({ pageParam }) => setupApi.photos(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    staleTime: 30_000,
  })
}

/** Everything the setup changed (a product made or counted): the catalogue, the counter's search, the setup. */
export const setupTouches = [kiranaKeys.productsAll, setupKeys.all] as const
