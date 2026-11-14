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

/**
 * The salon's registration document. Only TRADE_LICENCE can be added now; a SHOPS_ESTABLISHMENT or UDYAM one added
 * before stays until replaced, and no longer counts (its check FAILED, NOT_TRADE_LICENCE).
 */
export type RegistrationDocType = 'SHOPS_ESTABLISHMENT' | 'TRADE_LICENCE' | 'UDYAM'

/** The automatic check of the trade licence: being checked, passed ("Licensed"), or not accepted. */
export type LicenceCheck = 'PENDING' | 'PASSED' | 'FAILED'

/** What the licence check read from the trade licence (null where not on it). */
export interface LicenceRead {
  readable: boolean
  tradeLicence: boolean
  looksEdited: boolean
  provisional: boolean
  salonTrade: boolean
  issuingBody: string | null
  licenceNumber: string | null
  tradeName: string | null
  ownerName: string | null
  address: string | null
  pincode: string | null
  tradeCategory: string | null
  validUntil: string | null
}

/** Why a trade licence wasn't accepted (LicenceCheckReason on the backend). */
export type LicenceCheckReason =
  | 'UNREADABLE'
  | 'NOT_TRADE_LICENCE'
  | 'LOOKS_EDITED'
  | 'NO_NUMBER'
  | 'NOT_A_SALON_TRADE'
  | 'NO_VALIDITY'
  | 'EXPIRED'
  | 'NAME_MISMATCH'
  | 'ADDRESS_MISMATCH'
  | 'DUPLICATE'
  | 'NOT_READ'

/** CLOSED: its owner closed it for good (seen in the answer to closing; after that the owner has no shop). */
export type ShopStatus = 'DRAFT' | 'PENDING_VISIT' | 'APPROVED' | 'SUSPENDED' | 'CLOSED'
export type ShopType = 'KIRANA' | 'SALON'
export type ShopRole = 'OWNER' | 'HELPER' | 'BARBER'

/** GET /shops/me. The owner's photo comes only to the owner. A salon has no GSTIN or Udyam number (always null). */
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
  /** The salon video (needed before Submit for visit); the owner's view only, null for helpers and barbers. */
  shopVideoFileId?: string | null
  /** The registration document (optional; the owner can add, change or remove it any time); the owner's view only. */
  registrationDocType?: RegistrationDocType | null
  registrationDocFileId?: string | null
  /** When it passed the automatic check; null if not (yet) or none. */
  registrationDocCheckedAt?: string | null
  /** The automatic check of the trade licence; null without one (or from an older backend). The owner's view only. */
  licenceCheck?: LicenceCheck | null
  /** Why it FAILED; null otherwise. */
  licenceCheckReason?: LicenceCheckReason | null
  /** Its last valid day (YYYY-MM-DD) once PASSED: customers see "Licensed" until then. */
  licenceValidUntil?: string | null
  /** When this check started (a PENDING one has waited since then). */
  licenceCheckSince?: string | null
  /** What the check read from it (to compare with the salon's details when it wasn't accepted); null if not read. */
  licenceRead?: LicenceRead | null
  /**
   * When our field team's re-check of a live salon's changes started waiting (the address or pin, a photo or the video
   * changed); null when nothing waits. The salon stays live meanwhile. The owner's view only.
   */
  recheckSince?: string | null
  /**
   * The address and pin were verified by our field team: the owner can't change them any more (409 ADDRESS_LOCKED);
   * the field team does. Missing from an older backend (then the save says so).
   */
  addressLocked?: boolean
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
}

/** A new address and pin (an address change request to the field team). */
export interface AddressIn extends GeocodeIn {
  latitude: number
  longitude: number
}

/**
 * The owner's request to change a verified address (POST /shops/me/address-request). PENDING: waits for the field team
 * (the salon keeps its old address meanwhile); APPROVED: it is the salon's address now; DECLINED: see reason;
 * CANCELLED: taken back, or the field team set the address themselves.
 */
export interface AddressRequest extends AddressIn {
  id: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED'
  reason: string | null
  createdAt: string
  decidedAt: string | null
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

/** POST /shops/reverse-geocode: the address at a GPS point ("" where Google gave nothing). */
export interface Described {
  addressLine: string
  area: string
  city: string
  pincode: string
  formattedAddress: string
}

/** REG_DOC: the salon's registration document (a photo or a PDF); the owner only. */
export type FilePurpose = 'SHOP_PHOTO' | 'OWNER_PHOTO' | 'STAFF_PHOTO' | 'SHOP_VIDEO' | 'REG_DOC'

/** POST /files/video-uploads: where the phone sends the salon video itself (a one-time R2 link). */
export interface VideoUploadLink {
  uploadId: string
  /** PUT the file here with exactly this Content-Type; valid until expiresAt (15 minutes). */
  uploadUrl: string
  contentType: string
  sizeBytes: number
  /** By the server's clock; the phone counts expiresInSeconds from when the answer arrived instead. */
  expiresAt: string
  expiresInSeconds?: number
}

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
  /** Days after a visit the customer is reminded to come back for it; 0: no reminder. */
  returnAfterDays: number
  /** Its picture (lib/serviceIcons); null for one saved before icons (the one its name fits is shown). */
  icon?: string | null
  version: number
  createdAt: string
  updatedAt: string
}

/** A common service to tick at registration (GET /salon/service-catalog): suggested time and come-back interval. */
export interface CatalogService {
  name: string
  durationMinutes: number
  returnAfterDays: number
}

/** One open day of the salon: weekday 1 = Monday … 7 = Sunday, "HH:mm" ("24:00" = midnight). */
export interface OpenDay {
  weekday: number
  open: string
  close: string
}

/** GET /salon/hours: the open days (a weekday left out is closed) and the version to send back. */
export interface SalonHours {
  /** null while none are set */
  version: string | null
  days: OpenDay[]
}

export type RatingTag = 'ON_TIME' | 'CLEAN' | 'FRIENDLY' | 'SKILLED' | 'GOOD_VALUE'

export interface TagCount {
  tag: RatingTag
  label: string
  count: number
}

export interface RatingSummary {
  count: number
  /** To one decimal; null with no ratings. */
  average: number | null
  tags: TagCount[]
}

/** One customer's rating of a visit, as the salon sees it (the comment is for the salon only). */
export interface SalonRating {
  bookingId: string
  bookingNo: string
  stars: number
  tags: RatingTag[]
  comment: string | null
  services: string[]
  customerName: string | null
  visitAt: string
  ratedAt: string
}

/** GET /salon/ratings: the summary on the first page only (null on later pages). */
export interface RatingsPage {
  summary: RatingSummary | null
  items: SalonRating[]
  next: { afterAt: string; afterId: string } | null
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

/** GET /salon/walk-ins/prices: a service's price for a walk-in starting now (the salon's offer applied). */
export interface WalkInPrice {
  serviceId: string
  /** What the customer pays now: the offer price when one applies now. */
  pricePaise: number
  priceIsFrom: boolean
  /** Its own price when an offer applies now; null otherwise. */
  listPricePaise: number | null
  /** When the offer's hours end today ("14:00", India time); null when no offer applies or it runs all day. */
  offerUntil?: string | null
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

/** POST /helpdesk/tickets: the ticket made from "Need help". */
export interface HelpTicket {
  id: string
  /** CLZ-1042 */
  number: string
  /** The verified email our reply goes to. */
  sentTo: string
}

/** GET /helpdesk/tickets: one of my requests. OPEN: with support; WAITING: support replied; RESOLVED. */
export interface MyRequest {
  id: string
  /** CLZ-1042 */
  number: string
  subject: string | null
  status: 'OPEN' | 'WAITING' | 'RESOLVED'
  createdAt: string
  lastMessageAt: string
}

/** A message on my request: mine, or support's reply (with the support person's first name when known). */
export interface MyRequestMessage {
  seq: number
  fromSupport: boolean
  supportName: string | null
  body: string
  /** Files sent with an email (they stay in the email). */
  attachments: number
  at: string
  /** Photos, videos and PDFs sent with it in the app (or by support). Missing from a backend before round 4a. */
  files?: RequestFile[]
}

/** A file on a message (a photo, video or PDF shown; any other kind only downloaded). */
export interface RequestFile {
  id: string
  contentType: string
  sizeBytes: number
  name: string | null
  /** Opens it for at least 15 minutes (a file of a kind we don't show: downloads it); null once removed */
  url: string | null
  /** Saves it under its name; null once removed */
  downloadUrl?: string | null
  /** Deleted (6 months after the request was resolved, or the account was deleted) */
  removed: boolean
}

/** GET /helpdesk/tickets/{id} and the answer to adding a message. */
export interface MyRequestDetail {
  ticket: MyRequest
  messages: MyRequestMessage[]
}
