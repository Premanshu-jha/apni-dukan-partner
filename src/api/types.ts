// Response and request shapes, written to match the backend's records
// (auth/api/AuthResponses.java, shops/api/ShopResponse.java, salon/api/SalonResponses.java, BookingResponses.java).
// Instants are ISO strings in UTC; dates are yyyy-MM-dd (India); times "HH:mm" (India); money is in paise.

export interface User {
  id: string
  phone: string | null
  name: string | null
  email: string | null
  emailVerified: boolean
  admin: boolean
}

export interface Tokens {
  accessToken: string
  accessExpiresAt: string
  refreshToken: string
  refreshExpiresAt: string
  user: User
  newUser: boolean
}

export interface ErrorBody {
  code: string
  message: string
  details?: Record<string, unknown>
}

// ---------- the shop ----------

/** CLOSED: its owner closed it for good (seen in the answer to closing; after that the owner has no shop). */
export type ShopStatus = 'DRAFT' | 'PENDING_VISIT' | 'APPROVED' | 'SUSPENDED' | 'CLOSED'
export type ShopType = 'KIRANA' | 'SALON'
export type ShopRole = 'OWNER' | 'HELPER' | 'BARBER'

/** GET /shops/me. GSTIN, Udyam number and the owner's photo come only to the owner. */
export interface Shop {
  id: string
  shopCode: number
  name: string
  ownerName: string
  addressLine: string
  area: string
  city: string
  pincode: string
  latitude: number
  longitude: number
  gstin: string | null
  udyamNumber: string | null
  status: ShopStatus
  /** Why it was suspended, or a note from the field team. */
  statusReason: string | null
  type: ShopType
  myRole: ShopRole
  ownerPhotoFileId: string | null
  shopPhotoFileId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface ShopDetailsIn {
  name: string
  ownerName: string
  addressLine: string
  area: string
  city: string
  pincode: string
  latitude: number
  longitude: number
  gstin: string | null
  udyamNumber: string | null
}

/** POST /shops/geocode: the typed address (registration, before the shop exists). */
export interface GeocodeIn {
  addressLine: string
  area: string
  city: string
  pincode: string
}

/** How exact Google's pin is: on the building, on the street, or only somewhere in the area. */
export type GeocodePrecision = 'EXACT' | 'STREET' | 'AREA'

/** Where the typed address is: the pin the owner then drags onto the door. */
export interface Located {
  latitude: number
  longitude: number
  precision: GeocodePrecision
  formattedAddress: string
}

export type FilePurpose = 'SHOP_PHOTO' | 'OWNER_PHOTO' | 'STAFF_PHOTO'

export interface StoredFile {
  id: string
  purpose: FilePurpose
  contentType: string
  sizeBytes: number
  originalName: string | null
  createdAt: string
  duplicate: boolean
}

export interface FileLink {
  url: string
  expiresAt: string
}

/** Someone in the shop (GET /shops/me/members, and the helper add/remove answers). */
export interface ShopMember {
  userId: string
  name: string | null
  phone: string | null
  role: ShopRole
  joinedAt: string
}

/** Someone in the salon with their walk-in access (GET /salon/members). */
export interface Member {
  userId: string
  name: string | null
  phone: string | null
  role: ShopRole
  /** The staff profile linked to this sign-in (barbers). */
  staffId: string | null
  walkInAccess: boolean
}

// ---------- salon setup ----------

export interface ServiceItem {
  id: string
  name: string
  durationMinutes: number
  pricePaise: number
  priceIsFrom: boolean
  active: boolean
  sortOrder: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface Shift {
  /** 1 = Monday … 7 = Sunday */
  weekday: number
  start: string
  end: string
}

export interface Staff {
  id: string
  name: string
  active: boolean
  serviceIds: string[]
  hours: Shift[]
  /** The phone he signs in with, once he accepted the owner's invitation. */
  loginPhone: string | null
  /** The phone invited to sign in as him while that invitation waits (owner only); null or missing otherwise. */
  invitedPhone?: string | null
  photoFileId: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface Settings {
  minLeadMinutes: number
  maxDaysAhead: number
  /** null until the owner saves (the defaults). */
  version: number | null
  updatedAt: string | null
}

// ---------- the day ----------

export type AppointmentKind = 'BOOKING' | 'WALK_IN' | 'BLOCK'
export type BlockType = 'BREAK' | 'LEAVE' | 'CLOSED'
export type AppointmentStatus =
  | 'CONFIRMED'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_SALON'
  | 'NO_SHOW'
  | 'BLOCKED'
  | 'REMOVED'

export interface ServiceLine {
  serviceId: string
  name: string
  durationMinutes: number
  pricePaise: number
  priceIsFrom: boolean
}

/** An appointment on the salon's screens. Never carries the customer's start code. */
export interface Appointment {
  id: string
  kind: AppointmentKind
  blockType: BlockType | null
  staffId: string
  status: AppointmentStatus
  startsAt: string
  endsAt: string
  startedAt: string | null
  startedWithCode: boolean | null
  services: ServiceLine[]
  bookingNo: string | null
  customerName: string | null
  /** Only for the owner and helpers (null for barbers). */
  customerPhone: string | null
  guestName: string | null
  cancelReason: string | null
  closureId: string | null
  /** CONFIRMED and its start has passed: staff should press Start or No-show. */
  notStarted: boolean
  /** No-show is allowed from this moment (bookings and walk-ins). */
  noShowFrom: string | null
  /** The person looking added it (a barber removes only the breaks he added; fixes only walk-ins he added). */
  addedByMe: boolean
}

export interface HoursBlock {
  start: string
  end: string
}

export interface BarberColumn {
  staffId: string
  name: string
  hours: HoursBlock[]
  appointments: Appointment[]
}

export interface DayView {
  date: string
  barbers: BarberColumn[]
  /** The caller's own barber profile (a barber), so the app knows which column is his; null for owner and helpers. */
  myStaffId: string | null
  /** True: `barbers` is the whole day. False (a delta, `?since=`): `barbers` is null, see `changed` and `removed`. */
  full?: boolean
  /** Send back exactly as received as `since` for the same date: only what changed after this answer. */
  seq?: string
  /** The salon's setup this answer was made under (for information: a change makes the next delta a whole day). */
  setupVersion?: number
  /** A delta's new or changed appointments, in the order written: replace by id, or add to the `staffId` column. */
  changed?: Appointment[] | null
  /** A delta's ids no longer on this board (moved to another day or barber, a removed block): drop them if shown. */
  removed?: string[] | null
}

export interface HistoryView {
  from: string
  to: string
  /** How many ended in each status (the whole range): on the first page only, null on later pages. */
  counts: Record<string, number> | null
  /** The first page only, like `counts`. */
  completedPaise: number | null
  /** This page: at most 100, latest first. */
  appointments: Appointment[]
  /** Same as `next !== null` (kept by the backend for older apps). */
  truncated: boolean
  /** The next page's cursor, sent back exactly as received; null on the last page. */
  next: { afterStart: string; afterId: string } | null
}

export interface WalkInOption {
  staffId: string
  name: string
  freeNow: boolean
  startAt: string | null
  time: string | null
  bookedMinutesToday: number
}

export interface PauseView {
  pausedUntil: string | null
}

export interface ClosureView {
  closureId: string
  date: string
  barbers: number
}

/** One entry of a 409 BLOCK_CONFLICTS: what is in the way. */
export interface InTheWay {
  id: string
  kind: AppointmentKind
  staffId: string
  startsAt: string
  endsAt: string
}

// ---------- handing a shop over ----------

/** The owner's waiting hand-over request (GET /shops/me/handover). */
export interface HandoverView {
  id: string
  /** The 10-digit number asked. */
  phone: string
  createdAt: string
  /** It runs out 7 days after it was made. */
  expiresAt: string
}

/** POST /shops/me/handover: 202. `message` is the same whether or not the number has an account. */
export interface HandoverRequested {
  message: string
  handover: HandoverView
}

/** A request waiting for the signed-in person's phone (GET /me/handover). */
export interface IncomingHandover {
  id: string
  shopId: string
  shopCode: number
  shopName: string
  type: ShopType
  area: string
  city: string
  ownerName: string
  createdAt: string
  expiresAt: string
}

// ---------- joining a shop by invitation ----------

/** A waiting invitation as the owner sees it (GET /shops/me/invites): the phone typed, never a name. */
export interface InviteView {
  id: string
  phone: string
  role: 'HELPER' | 'BARBER'
  /** The barber profile it would sign in as (BARBER), else null. */
  staffId: string | null
  createdAt: string
  expiresAt: string
}

/** POST /shops/me/helpers: 202. `message` is the same whether or not the number has an account. */
export interface InviteResult {
  message: string
  invite: InviteView
}

/** An invitation waiting for the signed-in person's phone (GET /me/invites). */
export interface IncomingInvite {
  id: string
  shopId: string
  shopCode: number
  shopName: string
  type: string
  area: string
  city: string
  role: 'HELPER' | 'BARBER'
  createdAt: string
  expiresAt: string
}
