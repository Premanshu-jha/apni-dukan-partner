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

export type ShopStatus = 'DRAFT' | 'PENDING_VISIT' | 'APPROVED' | 'SUSPENDED'
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
  /** The phone he signs in with, if the owner gave him a sign-in. */
  loginPhone: string | null
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
}

export interface HistoryView {
  from: string
  to: string
  /** How many ended in each status. */
  counts: Record<string, number>
  completedPaise: number
  appointments: Appointment[]
  truncated: boolean
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
