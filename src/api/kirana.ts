import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from './client'

/**
 * The kirana counter (`/api/v1/kirana`, the backend's README "The kirana counter"): the catalogue, walk-in bills, the
 * khata book and the day's totals. Shapes follow KiranaResponses and KiranaRequests. Money is whole paise; quantities
 * are plain JSON numbers (pieces whole, kg to the gram).
 */
const K = '/api/v1/kirana'

export type Unit = 'PIECE' | 'KG'
export type Payment = 'CASH' | 'UPI' | 'KHATA'
export type PaidBy = 'CASH' | 'UPI'
export type StockReason = 'RESTOCK' | 'DAMAGED' | 'COUNT'

export interface Barcode {
  code: string
  /** How many pieces (or kg) one scan means: 1 for a single pack, 12 for a carton of 12. */
  pack: number
}

export interface Product {
  id: string
  name: string
  barcodes: Barcode[]
  unit: Unit
  pricePaise: number
  /** May be below zero (sold more than the app knew of). */
  stock: number
  lowStockAt: number | null
  runningOut: boolean
  active: boolean
  version: number
  updatedAt: string
  /** The owner's view only (round 3): what it cost. */
  costPaise?: number | null
  photoFileId?: string | null
  photoUrl?: string | null
}

export interface ProductPage {
  items: Product[]
  next: string | null
}

export interface StockMove {
  change: number
  stockAfter: number
  /** SALE, VOID, RETURN, RESTOCK, DAMAGED, COUNT (and round 3's own reasons). */
  reason: string
  billId: string | null
  billNo: number | null
  note: string | null
  byName: string | null
  at: string
}

export interface ProductDetail {
  product: Product
  moves: StockMove[]
}

export interface ScanResult {
  product: Product
  pack: number
}

export interface KhataRef {
  id: string
  name: string
}

export interface BillLine {
  lineNo: number
  /** Null for an item not in the list. */
  productId: string | null
  name: string
  unit: Unit
  quantity: number
  pricePaise: number
  amountPaise: number
  returnedQuantity: number
}

export interface BillReturn {
  id: string
  refundPaise: number
  offKhataPaise: number
  handBackPaise: number
  handBackBy: PaidBy | null
  reason: string | null
  byName: string | null
  at: string
  lines: { lineNo: number; quantity: number; valuePaise: number }[]
}

export interface BillChange {
  fromPayment: Payment
  fromKhataCustomer: KhataRef | null
  fromPaidNowPaise: number | null
  fromPaidNowBy: PaidBy | null
  toPayment: Payment
  toKhataCustomer: KhataRef | null
  toPaidNowPaise: number | null
  toPaidNowBy: PaidBy | null
  byName: string | null
  at: string
}

export interface Bill {
  id: string
  billNo: number
  subtotalPaise: number
  discountPaise: number
  totalPaise: number
  payment: Payment
  khataCustomer: KhataRef | null
  paidNowPaise: number | null
  paidNowBy: PaidBy | null
  onKhataPaise: number
  refundedPaise: number
  version: number
  createdAt: string
  byName: string | null
  voidedAt: string | null
  voidReason: string | null
  lines: BillLine[]
  returns: BillReturn[]
  changes: BillChange[]
  /** Round 3: a paper bill's own date and photo. */
  writtenOn?: string | null
  paperPhotoFileId?: string | null
  /** Who made it (a helper may change his own for 10 minutes); null for one made by no one at the counter. */
  byId?: string | null
}

export interface StockLevel {
  productId: string
  name: string
  unit: Unit
  before: number
  after: number
  runningOut: boolean
}

export interface UpiQr {
  upiId: string
  payeeName: string
  amountPaise: number
  /** upi://pay?pa=…&pn=…&am=…&cu=INR&tn=Bill%20N, ready to draw as a QR. */
  uri: string
}

export interface KhataCustomer {
  id: string
  name: string
  phone: string | null
  note: string | null
  /** Null: no limit. */
  creditLimitPaise: number | null
  /** Above zero they owe; below zero it is their advance. */
  balancePaise: number
  owesPaise: number
  advancePaise: number
  /** What they can still buy on khata; null without a limit. */
  availablePaise: number | null
  active: boolean
  version: number
  updatedAt: string
}

export interface BillResult {
  bill: Bill
  stock: StockLevel[]
  khata: KhataCustomer | null
  upi: UpiQr | null
  upiIdMissing: boolean
  repeated: boolean
}

export interface CancelResult {
  bill: Bill
  stock: StockLevel[]
  khata: KhataCustomer | null
}

export interface ChangeResult {
  bill: Bill
  khata: KhataCustomer[]
  upi: UpiQr | null
  upiIdMissing: boolean
}

export interface ReturnResult {
  bill: Bill
  returned: BillReturn
  stock: StockLevel[]
  khata: KhataCustomer | null
  repeated: boolean
}

export interface BillSummary {
  id: string
  billNo: number
  totalPaise: number
  discountPaise: number
  payment: Payment
  khataCustomerName: string | null
  paidNowPaise: number | null
  lines: number
  /** The first three names. */
  preview: string
  createdAt: string
  voided: boolean
  refundedPaise: number
  paymentChanged: boolean
}

export interface BillPage {
  items: BillSummary[]
  next: string | null
}

export interface DaySummary {
  date: string
  bills: number
  salesPaise: number
  discountPaise: number
  cashPaise: number
  upiPaise: number
  khataPaise: number
  paymentChanges: number
  changedCashPaise: number
  changedUpiPaise: number
  changedKhataPaise: number
  khataReceivedPaise: number
  khataReceivedCashPaise: number
  khataReceivedUpiPaise: number
  returns: number
  returnedPaise: number
  returnedCashPaise: number
  returnedUpiPaise: number
  returnedKhataPaise: number
  cancelledBills: number
  cancelledPaise: number
  cancelledCashPaise: number
  cancelledUpiPaise: number
  cancelledKhataPaise: number
  cashInPaise: number
  upiInPaise: number
}

export interface KhataPage {
  items: KhataCustomer[]
  next: string | null
  owedPaise: number
  advancesPaise: number
}

/** SALE, PAYMENT, VOID, RETURN, CHANGE, REVERSAL, REFUND. */
export type KhataKind = 'SALE' | 'PAYMENT' | 'VOID' | 'RETURN' | 'CHANGE' | 'REVERSAL' | 'REFUND'

export interface KhataEntry {
  id: string
  kind: KhataKind | string
  /** Signed: + puts on the khata, − takes off. */
  amountPaise: number
  balanceAfter: number
  billId: string | null
  billNo: number | null
  method: PaidBy | null
  note: string | null
  reversesId: string | null
  reversed: boolean
  byName: string | null
  at: string
  /** Who recorded it (a helper may undo his own payment for 10 minutes). */
  byId?: string | null
}

export interface KhataDetail {
  customer: KhataCustomer
  entries: KhataEntry[]
  nextEntries: string | null
}

export interface PaymentResult {
  customer: KhataCustomer
  entry: KhataEntry
  repeated: boolean
}

export interface KiranaSettings {
  shopName: string
  upiId: string | null
  upiUpdatedAt: string | null
  /** Whether it sells any food (packed or loose): Yes needs its FSSAI licence. Null until answered. */
  sellsFood?: boolean | null
}

/** The FSSAI licence: NONE, CHECKING (the AI reads it), VERIFIED, REJECTED (reason in the owner's words). */
export type FssaiStatus = 'NONE' | 'CHECKING' | 'VERIFIED' | 'REJECTED'

export interface FssaiView {
  number: string | null
  fileId: string | null
  status: FssaiStatus
  reason: string | null
  validUntil: string | null
  /** A renewal being checked: the licence verified before stays good until this day. */
  currentValidUntil: string | null
  checkedAt: string | null
}

/** GET /kirana/online: the parts round 1 uses (the FSSAI licence); round 2 adds the rest of its screen. */
export interface OnlineView {
  takingOrders: boolean
  ready: boolean
  missing: string[]
  fssai: FssaiView
}

/** A bill line as sent: a listed product by quantity or (kg) by amount, or an item not in the list. */
export type NewLine =
  | { productId: string; quantity: number }
  | { productId: string; amountPaise: number }
  | { name: string; amountPaise: number; quantity?: number }

export interface NewBill {
  clientRef: string
  lines: NewLine[]
  payment: Payment
  khataCustomerId?: string
  discountPaise?: number
  paidNowPaise?: number
  paidNowBy?: PaidBy
}

export interface NewProduct {
  name: string
  barcode?: string
  pack?: number
  unit: Unit
  pricePaise: number
  stock?: number
  lowStockAt?: number
}

export interface EditProduct {
  version: number
  name?: string
  unit?: Unit
  pricePaise?: number
  lowStockAt?: number
  noLowStockAlert?: boolean
  active?: boolean
}

export interface KhataCustomerIn {
  name: string
  phone?: string
  note?: string
  creditLimitPaise?: number
  noLimit?: boolean
}

const q = (params: Record<string, string | boolean | null | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') s.set(k, String(v))
  const text = s.toString()
  return text ? `?${text}` : ''
}
const id = encodeURIComponent

export const kiranaKeys = {
  all: ['kirana'] as const,
  settings: ['kirana', 'settings'] as const,
  online: ['kirana', 'online'] as const,
  products: (search: string) => ['kirana', 'products', search] as const,
  productsAll: ['kirana', 'products'] as const,
  runningOut: ['kirana', 'running-out'] as const,
  product: (pid: string) => ['kirana', 'product', pid] as const,
  bills: ['kirana', 'bills'] as const,
  bill: (bid: string) => ['kirana', 'bill', bid] as const,
  day: (date: string | null) => ['kirana', 'day', date ?? 'today'] as const,
  khata: (search: string, owing: boolean) => ['kirana', 'khata', search, owing] as const,
  khataAll: ['kirana', 'khata'] as const,
  customer: (cid: string) => ['kirana', 'customer', cid] as const,
}

export const kiranaApi = {
  settings: () => api<KiranaSettings>('GET', `${K}/settings`),
  setUpiId: (upiId: string) => api<KiranaSettings>('PUT', `${K}/settings/upi-id`, { body: { upiId } }),
  setSellsFood: (sellsFood: boolean) => api<KiranaSettings>('PUT', `${K}/settings/sells-food`, { body: { sellsFood } }),
  online: () => api<OnlineView>('GET', `${K}/online`),
  /** The FSSAI licence: its 14-digit number and the certificate (a REG_DOC upload). */
  setFssai: (number: string, fileId: string) => api<OnlineView>('PUT', `${K}/online/fssai`, { body: { number, fileId } }),

  products: (search: string, cursor?: string | null) => api<ProductPage>('GET', `${K}/products${q({ q: search.trim(), cursor })}`),
  runningOut: () => api<Product[]>('GET', `${K}/products/running-out`),
  /** A scan: the product and its pack, or 404 PRODUCT_NOT_FOUND. */
  scan: (code: string) => api<ScanResult>('GET', `${K}/products/barcode/${id(code)}`, { keep: false }),
  product: (pid: string) => api<ProductDetail>('GET', `${K}/products/${id(pid)}`),
  addProduct: (p: NewProduct) => api<Product>('POST', `${K}/products`, { body: p }),
  editProduct: (pid: string, e: EditProduct) => api<Product>('PATCH', `${K}/products/${id(pid)}`, { body: e }),
  addBarcode: (pid: string, code: string, pack?: number) =>
    api<Product>('POST', `${K}/products/${id(pid)}/barcodes`, { body: { code, pack } }),
  removeBarcode: (pid: string, code: string) => api<Product>('DELETE', `${K}/products/${id(pid)}/barcodes/${id(code)}`),
  stock: (pid: string, change: { clientRef: string; reason: StockReason; quantity: number; note?: string }) =>
    api<Product>('POST', `${K}/products/${id(pid)}/stock`, { body: change }),

  bill: (b: NewBill) => api<BillResult>('POST', `${K}/bills`, { body: b }),
  bills: (cursor?: string | null) => api<BillPage>('GET', `${K}/bills${q({ cursor })}`),
  billDetail: (bid: string) => api<Bill>('GET', `${K}/bills/${id(bid)}`),
  cancel: (bid: string, reason: string) => api<CancelResult>('POST', `${K}/bills/${id(bid)}/void`, { body: { reason } }),
  changePayment: (
    bid: string,
    c: { version: number; payment: Payment; khataCustomerId?: string; paidNowPaise?: number; paidNowBy?: PaidBy; advance?: boolean },
  ) => api<ChangeResult>('POST', `${K}/bills/${id(bid)}/payment`, { body: c }),
  returnItems: (bid: string, r: { clientRef: string; lines: { lineNo: number; quantity: number }[]; reason?: string }) =>
    api<ReturnResult>('POST', `${K}/bills/${id(bid)}/returns`, { body: r }),
  day: (date: string | null) => api<DaySummary>('GET', `${K}/day${q({ date })}`),

  khata: (search: string, owing: boolean, cursor?: string | null) =>
    api<KhataPage>('GET', `${K}/khata${q({ q: search.trim(), owing: owing || undefined, cursor })}`),
  customer: (cid: string, cursor?: string | null) => api<KhataDetail>('GET', `${K}/khata/${id(cid)}${q({ cursor })}`),
  addCustomer: (c: KhataCustomerIn) => api<KhataCustomer>('POST', `${K}/khata`, { body: c }),
  editCustomer: (cid: string, c: Partial<KhataCustomerIn> & { version: number; active?: boolean }) =>
    api<KhataCustomer>('PATCH', `${K}/khata/${id(cid)}`, { body: c }),
  pay: (cid: string, p: { clientRef: string; amountPaise: number; method: PaidBy; note?: string; advance?: boolean }) =>
    api<PaymentResult>('POST', `${K}/khata/${id(cid)}/payments`, { body: p }),
  reverse: (cid: string, entryId: string, reason: string) =>
    api<PaymentResult>('POST', `${K}/khata/${id(cid)}/payments/${id(entryId)}/reverse`, { body: { reason } }),
  advanceBack: (cid: string, a: { clientRef: string; amountPaise: number; method: PaidBy }) =>
    api<PaymentResult>('POST', `${K}/khata/${id(cid)}/advance-back`, { body: a }),
}

/** The FSSAI licence; read again every 8 s while the AI checks it (only while a screen shows it). */
export function useOnline() {
  return useQuery({
    queryKey: kiranaKeys.online,
    queryFn: kiranaApi.online,
    // Every 8 s while the AI reads it; once a person checks it (a reason is given: within a day), every minute
    refetchInterval: (q) => {
      const f = q.state.data?.fssai
      return f?.status !== 'CHECKING' ? false : f.reason ? 60_000 : 8_000
    },
  })
}

export function useKiranaSettings() {
  return useQuery({ queryKey: kiranaKeys.settings, queryFn: kiranaApi.settings, staleTime: 60_000 })
}

/** The catalogue, 50 a page, searched by name or barcode digits (the caller debounces the search). */
export function useProducts(search: string) {
  return useInfiniteQuery({
    queryKey: kiranaKeys.products(search.trim()),
    queryFn: ({ pageParam }) => kiranaApi.products(search, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    staleTime: 30_000,
  })
}

export function useRunningOut() {
  return useQuery({ queryKey: kiranaKeys.runningOut, queryFn: kiranaApi.runningOut, staleTime: 30_000 })
}

export function useProduct(pid: string) {
  return useQuery({ queryKey: kiranaKeys.product(pid), queryFn: () => kiranaApi.product(pid) })
}

export function useBills() {
  return useInfiniteQuery({
    queryKey: kiranaKeys.bills,
    queryFn: ({ pageParam }) => kiranaApi.bills(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
  })
}

export function useBill(bid: string) {
  return useQuery({ queryKey: kiranaKeys.bill(bid), queryFn: () => kiranaApi.billDetail(bid) })
}

export function useDay(date: string | null) {
  return useQuery({ queryKey: kiranaKeys.day(date), queryFn: () => kiranaApi.day(date) })
}

export function useKhata(search: string, owing: boolean) {
  return useInfiniteQuery({
    queryKey: kiranaKeys.khata(search.trim(), owing),
    queryFn: ({ pageParam }) => kiranaApi.khata(search, owing, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    staleTime: 15_000,
  })
}

export function useCustomer(cid: string) {
  return useInfiniteQuery({
    queryKey: kiranaKeys.customer(cid),
    queryFn: ({ pageParam }) => kiranaApi.customer(cid, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextEntries,
  })
}
