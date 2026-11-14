import { TicketFilesMock, type ShownFile } from './ticketFiles'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BrowserContext, Route } from '@playwright/test'

/**
 * A fake backend for the end-to-end tests. Shapes follow the backend's records (AuthResponses, ShopResponse,
 * SalonResponses, BookingResponses, InboxPage); errors follow ErrorResponse {code, message, details}, with the
 * backend's codes and rules (who may do what, versions, start window, conflicts). State lives per test.
 */
export const API = 'http://api.test'

/** An ETag as Spring's ShallowEtagHeaderFilter makes it: "0" and the MD5 of the body, in quotes. */
export function etagOf(body: string): string {
  return `"0${createHash('md5').update(body).digest('hex')}"`
}

/** If-None-Match holds this ETag (a list, weak or strong, or *), as the filter compares them. */
function matches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false
  return ifNoneMatch.split(',').some((t) => t.trim() === '*' || t.trim().replace(/^W\//, '') === etag)
}
/** A real 20-second video (64×64, VP9 in MP4), played back as the salon video. */
const VIDEO = readFileSync(resolve('e2e/fixtures/salon-20s.mp4'))
const IST = 5.5 * 3600_000
const P = '/api/v1'
/** AuthService refresh grace (app.auth.refresh-grace-seconds, 30), and its retry time (RETRY_GRACE, 60 s). */
const REFRESH_GRACE_MS = 30_000
const RETRY_GRACE_MS = 60_000

export type Role = 'OWNER' | 'HELPER' | 'BARBER'
export type Status = 'DRAFT' | 'PENDING_VISIT' | 'APPROVED' | 'SUSPENDED'

export interface MockUser {
  id: string
  phone: string
  name: string | null
  email: string | null
  emailVerified: boolean
  admin: boolean
}

export interface Call {
  method: string
  path: string
  body: unknown
  auth: string | null
  idempotencyKey: string | null
  contentType: string | null
  /** When it arrived (ms), to check the waits between retries. */
  at: number
}

type Json = Record<string, unknown>

export function todayIst(): string {
  return new Date(Date.now() + IST).toISOString().slice(0, 10)
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** SalonOfferService.ownerView: ENDED (ended early, or past its last day), UPCOMING or RUNNING. */
function offerState(o: Json): 'RUNNING' | 'UPCOMING' | 'ENDED' {
  const v = o.offer as Json
  if (o.endedAt || (v.endsOn as string) < todayIst()) return 'ENDED'
  return (v.startsOn as string) > todayIst() ? 'UPCOMING' : 'RUNNING'
}

/** "12 Nov" for a yyyy-MM-dd date (SalonOfferService.DAY). */
function shortDay(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`
}

/** SalonOffer.priceOf: to the rupee, half up, never below ₹1. */
function offerPriceOf(paise: number, pct: number): number {
  if (paise <= 0) return paise
  return Math.max(1, Math.floor((paise * (100 - pct) + 5000) / 10000)) * 100
}

export function istInstant(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, h, min) - IST).toISOString()
}

/** An instant n minutes from now, on the minute. */
export function minutesFromNow(n: number): string {
  const t = Date.now() + n * 60_000
  return new Date(t - (t % 60_000)).toISOString()
}

export const SERVICES = [
  { id: 'v1', name: 'Haircut', durationMinutes: 30, pricePaise: 20000, priceIsFrom: false, active: true, sortOrder: 0, returnAfterDays: 21, version: 0 },
  { id: 'v2', name: 'Beard trim', durationMinutes: 15, pricePaise: 10000, priceIsFrom: false, active: true, sortOrder: 1, returnAfterDays: 7, version: 0 },
  { id: 'v3', name: 'Hair colour', durationMinutes: 60, pricePaise: 80000, priceIsFrom: true, active: true, sortOrder: 2, returnAfterDays: 30, version: 0 },
]

/** GET /salon/service-catalog (ServiceCatalog), the first few. */
export const CATALOG = [
  { name: 'Haircut', durationMinutes: 30, returnAfterDays: 21 },
  { name: 'Beard trim', durationMinutes: 15, returnAfterDays: 7 },
  { name: 'Clean shave', durationMinutes: 20, returnAfterDays: 7 },
  { name: 'Hair wash', durationMinutes: 15, returnAfterDays: 0 },
  { name: 'Facial', durationMinutes: 45, returnAfterDays: 30 },
]

/** SalonSetupService.hoursVersion: the week itself, in minutes. */
function hoursVersion(days: Json[]): string | null {
  if (!days.length) return null
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  return [...days]
    .sort((a, b) => (a.weekday as number) - (b.weekday as number))
    .map((d) => `${d.weekday}:${m(d.open as string)}-${m(d.close as string)}`)
    .join(',')
}

/** An approved salon's week: open all day, every day, so no barber's hours fall outside. */
export const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, open: '00:00', close: '24:00' }))

/** Appointments per page of the upcoming list and the history (SalonDayService.UPCOMING_PAGE, HISTORY_PAGE). */
const PAGE = 100
/** Messages per page of the inbox (InboxService). */
const INBOX_PAGE = 30

/**
 * An instant's microseconds since 1970, from the backend's text ("…T04:30:00.123456Z"): the backend orders and
 * pages by the microsecond, so the fake does too (a JavaScript Date keeps only milliseconds).
 */
export function micros(instant: string): number {
  const fraction = (instant.match(/\.(\d+)Z$/)?.[1] ?? '').padEnd(6, '0').slice(0, 6)
  return Math.floor(Date.parse(instant) / 1000) * 1_000_000 + Number(fraction)
}

/** What Spring can read as an Instant query value (ISO-8601, in UTC). */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?Z$/
/** This fake's appointment ids stand in for the backend's UUIDs: anything else is unreadable. */
const APPOINTMENT_ID = /^a\d+$/

const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '00:00', end: '23:45' }))

/** PhoneNumbers.normalize: a 10-digit Indian mobile number (with +91, 0, spaces or dashes), else null. */
function normalizeMockPhone(input: unknown): string | null {
  if (typeof input !== 'string') return null
  let d = input.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

/** PhoneNumbers.normalize: "+91 98480 12345" → "9848012345", or null. */
function normalize(input: unknown): string | null {
  let d = String(input ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

export interface MockTicket {
  id: string
  number: string
  owner: string
  app: string
  subject: string | null
  message: string
  status: 'OPEN' | 'WAITING' | 'RESOLVED'
  createdAt: string
  lastMessageAt: string
  messages: Array<{ seq: number; fromSupport: boolean; supportName: string | null; body: string; attachments: number; at: string; files?: ShownFile[] }>
}

/** TicketService.MyTicket */
function myTicket(t: MockTicket) {
  return { id: t.id, number: t.number, subject: t.subject, status: t.status, createdAt: t.createdAt, lastMessageAt: t.lastMessageAt }
}

export class MockApi {
  user: MockUser = { id: 'u1', phone: '9848012345', name: null, email: null, emailVerified: false, admin: false }
  /** "Need help" tickets sent, in order. */
  tickets: MockTicket[] = []
  /** Support files (TicketFileService): photos and PDFs, videos to the fake R2. */
  ticketFiles = new TicketFilesMock(API, API)
  /** Messages of theirs in the last hour, new questions included (TicketService: 429 TOO_MANY_MESSAGES past 20). */
  addedThisHour = 0
  /** A support reply on a ticket, as the admin website would add it (it then waits on the customer). */
  supportReplies(ticket: MockTicket, body: string, name = 'Neha') {
    ticket.messages.push({ seq: ticket.messages.length + 1, fromSupport: true, supportName: name, body, attachments: 0, at: new Date().toISOString() })
    ticket.status = 'WAITING'
    ticket.lastMessageAt = new Date().toISOString()
    // TicketService.notifyReplied: "Support replied" in this app's list (never the reply's words)
    this.inbox.unshift({ id: `n${++this.n}`, type: 'PARTNERHELP_REPLIED', title: `Support replied on ${ticket.number}`, body: 'We replied to your question. Tap to read it.', url: `/help/requests/${ticket.id}`, sentAt: new Date().toISOString(), read: false })
  }
  /** Someone else's ticket (to check it is never shown). */
  addOthersTicket(): MockTicket {
    const t = this.newTicket('CUSTOMER', 'Not mine', 'Another account asked this.', 'someone-else')
    return t
  }
  newTicket(app: string, subject: string | null, message: string, owner = this.user.id): MockTicket {
    const n = 1001 + this.tickets.length
    const at = new Date().toISOString()
    const t: MockTicket = {
      id: `t${n}`, number: `CLZ-${n}`, owner, app, subject, message, status: 'OPEN', createdAt: at, lastMessageAt: at,
      messages: [{ seq: 1, fromSupport: false, supportName: null, body: message, attachments: 0, at }],
    }
    this.tickets.push(t)
    if (owner === this.user.id) this.addedThisHour++   // TicketService counts every message of theirs in the hour
    return t
  }
  /** Paths (with the query) answered 304 Not Modified, in order. */
  notModified: string[] = []
  calls: Call[] = []
  /** The person's shop (null = 404 NO_SHOP). */
  shop: Json | null = null
  role: Role = 'OWNER'
  services: Json[] = SERVICES.map((s) => ({ ...s, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' }))
  staff: Json[] = [
    { id: 'st1', name: 'Ravi', active: true, serviceIds: ['v1', 'v2', 'v3'], hours: week, loginPhone: null, photoFileId: null, version: 0, invitedPhone: null },
    { id: 'st2', name: 'Imran', active: true, serviceIds: ['v1', 'v2'], hours: week, loginPhone: '9000000002', photoFileId: null, version: 0, invitedPhone: null },
  ]
  settings: Json = { minLeadMinutes: 30, maxDaysAhead: 14, version: null, updatedAt: null }
  /** The salon's opening hours (GET /salon/hours): the open days. */
  hours: Json[] = ALL_DAY.map((d) => ({ ...d }))
  /** The salon's ratings (GET /salon/ratings), newest first. */
  ratings: Json[] = []
  /** Offers (OwnerOffer rows, newest first) and how many past customers would get the message (RECIPIENTS) */
  offers: Json[] = []
  offerCustomers = 3
  ratingSummary: Json = { count: 0, average: null, tags: [] }
  appointments: Json[] = []
  members: Json[] = []
  closures: Json[] = []
  pausedUntil: string | null = null
  inbox: Json[] = []
  files: Json[] = []
  /** The staff id this person signs in as (a barber). */
  myStaffId: string | null = null
  /** This person may add walk-ins (owner always). */
  walkIns = true
  /**
   * POST /shops/geocode (AddressLocator): where the typed address is, null for ADDRESS_NOT_FOUND, or 'off' for
   * GEOCODING_OFF (no Google key on the backend).
   */
  geocode: Json | null | 'off' | 'used-up' = { latitude: 28.6215, longitude: 77.3652, precision: 'STREET', formattedAddress: 'Ithum Tower, Sector 62, Noida, Uttar Pradesh 201309, India' }
  /**
   * POST /shops/reverse-geocode: the address at the GPS point, null for ADDRESS_NOT_FOUND, 'off' for GEOCODING_OFF,
   * 'down' for GEOCODING_UNAVAILABLE.
   */
  reverse: Json | null | 'off' | 'down' = { addressLine: 'Ithum Tower, Sector 62 Road', area: 'Sector 62', city: 'Noida', pincode: '201309', formattedAddress: 'Ithum Tower, Sector 62, Noida, Uttar Pradesh 201309, India' }
  /** Milliseconds before answering an address search (a slow answer). */
  geocodeDelay = 0
  /** Milliseconds before answering a reverse lookup (a slow answer). */
  reverseDelay = 0
  /** Salon video upload links given (VideoUploadService), by id: what was asked, and whether it completed. */
  videoUploads = new Map<string, { sizeBytes: number; contentType: string; fileId: string | null; createdAt: number }>()
  /** What the fake R2 holds, by upload id: the bytes' length and first bytes. */
  r2 = new Map<string, { size: number; head: Buffer }>()
  /** The next PUTs to R2 drop as with no network, this many times. */
  r2DropNext = 0
  /** Milliseconds before R2 answers a PUT (a slow upload, to cancel it). */
  r2Delay = 0
  /** The next PUTs to R2 are answered with this status (R2's own trouble: 503), this many times. */
  r2Fail = { status: 503, times: 0 }
  /** The saved salon video's link answers 404 (a link that ran out), so the player can't play it. */
  videoBroken = false
  /** The next setVideo saves answer 409 SHOP_CHANGED (someone saved the shop meanwhile), this many times. */
  shopChangedOnVideo = 0
  /** Next answer of an action, by path suffix: a code + status, once. */
  failOnce = new Map<string, { status: number; code: string; message: string; details?: Json; retryAfter?: number }>()
  /** How many next-page requests of the upcoming list or the history fail with 500 (the pages shown must stay). */
  failPages = 0
  /** The salon's change counter (salon_versions): any change gives the day board and the upcoming list a new tag. */
  salonVersion = 1
  /** The Retry-After of those 503s (none when null). */
  busyRetryAfter: number | null = null
  /** Answers held back: url part → milliseconds (see attach). */
  slow = new Map<string, number>()
  /** Page reads of the coming-up list (not its since= calls) answer 500 this many times. */
  failUpcomingPages = 0
  /** The next file call is refused as if its token were from before a hand-over (403 SHOP_REQUIRED). */
  staleFileTokenOnce = false
  /** POST /auth/refresh answers 503 this many times. */
  refreshDown = 0
  /** GET /salon/day answers 503 this many times. */
  dayDown = 0
  /** Each seq given out by GET /salon/day, with the board that answer showed (see the day board). */
  daySeqs = new Map<string, { date: string; setupVersion: number; who: string; board: Map<string, string> }>()
  private seqN = 0
  /** Each `since` answer: the ids changed and removed, or full (the whole day came back). */
  deltas: { since: string; changed?: string[]; removed?: string[]; full?: boolean }[] = []
  /** Each coming-up list `since` answer (as `deltas` for the day board). */
  upcomingDeltas: { since: string; changed?: string[]; removed?: string[]; full?: boolean }[] = []
  /** The next coming-up `since` answer is full: true. */
  wholeUpcomingNext = false
  /** The next `since` answer is the whole day (e.g. the cursor is older than an hour, or more than 300 rows changed). */
  wholeDayNext = false
  private setups: string[] = []
  /** The next code request answers 429 TRY_LATER with this Retry-After (seconds), once. */
  otpTryLater: number | null = null
  /** Every request fails as with no network. */
  offline = false
  /** GET /shops/me answers 503 this many times. */
  shopDown = 0
  /** Helpers added from the other side: "check again" finds a shop. */
  addedToShop: Json | null = null
  /** The shop this owner closed (a retried close answers it again, as ShopOwnershipService.close). */
  closedShop: Json | null = null
  /** The owner's waiting hand-over request (GET /shops/me/handover), and how many were asked today (5 a day). */
  ownHandover: Json | null = null
  handoverAsks = 0
  /** Hand-over requests made to this person's phone: the answer of GET /me/handover plus the shop each would give. */
  incoming: Array<{ view: Json; shop: Json; status: string }> = []
  /** This shop's invitations (ShopInvitesService): helpers and barbers, by the phone typed. */
  shopInvites: Json[] = []
  /** Invitations made to this person's phone (GET /me/invites) plus the shop each would join. */
  incomingInvites: Array<{ view: Json; shop: Json; status: string; staffId: string | null }> = []
  private n = 0
  /**
   * The bell's and the inbox first page's own ETag, as NotificationsController sends it ("n1-…": the person's inbox
   * version and the app): it moves whenever their list changes.
   */
  inboxTag(what: string): string {
    return `"n1-${etagOf(JSON.stringify(this.inbox) + what).replace(/"/g, '')}"`
  }
  private accessValid = new Set<string>()
  refreshTokens = new Map<string, 'live' | 'rotated' | 'revoked'>()
  /** Each swapped refresh token: when, and the one it was swapped for (for the refresh grace). */
  swaps = new Map<string, { at: number; successor: string }>()

  /** Refresh tokens the grace replaced (never reached their app), with when they were revoked. */
  graceReplaced = new Map<string, number>()
  /** How many refreshes the grace answered (a tab reloaded, or its answer lost, while its refresh was on the way). */
  graceUsed = 0

  /**
   * A new pair for a refresh token being swapped, remembering what it was swapped for. A grace swap keeps the first
   * swap's time: the grace counts from it (AuthService), it doesn't start again.
   */
  private rotate(old: string, at: number = Date.now()) {
    const pair = this.tokens()
    this.swaps.set(old, { at, successor: pair.refreshToken as string })
    return pair
  }
  /** Numbers with an account of their own (PHONE_IN_USE). */
  takenPhones = new Set<string>()
  /** Phone-change codes sent: new number → where the second went, wrong tries. Codes: 123456 (new number), 654321 (email), 111222 (current number). */
  phoneChangeCodes = new Map<string, { second: 'EMAIL' | 'PHONE'; phoneTries: number; secondTries: number }>()
  /** Phone-change sends today (5 at most, taken numbers included). */
  phoneChangeTries = 0
  /** The next phone change goes through but its answer is lost on the way back. */
  loseNextPhoneChange = false
  /**
   * Editing a verified salon is on until this time (EditUnlockStore); null: off. On by default, so tests about
   * other things edit as an owner who entered the code; the code's own tests set it to null. The code is 123456.
   */
  editUntil: string | null = '2099-01-01T00:00:00Z'
  /** Edit codes sent (POST /auth/me/edit-code). */
  editCodesSent = 0
  /** The owner's address change requests, newest last (AddressRequestStore). */
  addressRequests: Json[] = []

  /** ShopService.requireUnlocked: a verified salon's details need the edit code in the last 15 minutes. */
  private editLocked(): boolean {
    return Boolean(this.shop?.addressLocked) && this.shop?.status !== 'DRAFT' && !(this.editUntil && Date.parse(this.editUntil) > Date.now())
  }

  /** The live salon waits for a re-check only because of an address request (ShopService.endRecheckIfNothingLeft). */
  private recheckOnlyForAddress = false

  /** The request is gone: a re-check it alone started ends. */
  private endAddressRecheck() {
    if (this.recheckOnlyForAddress && this.shop) this.shop = { ...this.shop, recheckSince: null, statusReason: null }
    this.recheckOnlyForAddress = false
  }

  /** The field team decides the owner's waiting address request (ShopAdminService.approve / declineAddressRequest). */
  decideAddressRequest(approve: boolean, reason: string | null = null) {
    const r = this.addressRequests.find((x) => x.status === 'PENDING')
    if (!r) return
    r.status = approve ? 'APPROVED' : 'DECLINED'
    r.reason = approve ? null : reason
    r.decidedAt = new Date().toISOString()
    const moved = approve
      ? { addressLine: r.addressLine, area: r.area, city: r.city, pincode: r.pincode, latitude: r.latitude, longitude: r.longitude, recheckSince: null, statusReason: null }
      : {}
    this.shop = { ...this.shop!, ...moved, version: (this.shop!.version as number) + 1 }
    if (approve) this.recheckOnlyForAddress = false
    else this.endAddressRecheck()
  }

  static completeUser(): MockUser {
    return { id: 'u1', phone: '9848012345', name: 'Ravi Kumar', email: 'ravi@example.com', emailVerified: true, admin: false }
  }

  /** An approved salon with this person in the given role. */
  approvedSalon(role: Role = 'OWNER', over: Json = {}) {
    this.role = role
    this.shop = MockApi.shopOf({ status: 'APPROVED', myRole: role, ...over })
    this.members = [
      { userId: 'u1', name: this.user.name, phone: this.user.phone, role, staffId: role === 'BARBER' ? 'st2' : null, walkInAccess: role === 'OWNER' },
    ]
    if (role !== 'OWNER') this.members.push({ userId: 'u0', name: 'Owner', phone: '9000000001', role: 'OWNER', staffId: null, walkInAccess: true })
    if (role === 'BARBER') {
      this.myStaffId = 'st2'
      this.walkIns = false
      this.staff[1].loginPhone = this.user.phone
    }
    if (role === 'HELPER') this.walkIns = false
  }

  /**
   * Shop.requestRecheck: a live shop that changed what was checked waits for the field team, staying APPROVED; the
   * change answers a fix the team asked for (the reason goes).
   */
  private recheckIfLive(changed: boolean) {
    if (!changed || !this.shop || this.shop.status !== 'APPROVED') return
    this.recheckOnlyForAddress = false
    this.shop = { ...this.shop, recheckSince: this.shop.recheckSince ?? new Date().toISOString(), statusReason: null }
  }

  /** The field team asked the owner to fix something on the live salon's re-check (ShopAdminService.askToFix). */
  askToFix(reason: string) {
    this.shop = {
      ...this.shop!,
      statusReason: reason,
      recheckSince: this.shop!.recheckSince ?? new Date().toISOString(),
      version: (this.shop!.version as number) + 1,   // saved, as the backend does
    }
  }

  /** A new (or changed) trade licence waits for the automatic check (Shop.setRegistrationDoc / restartLicenceCheck). */
  static get licencePending(): Json {
    return { licenceCheck: 'PENDING', licenceCheckReason: null, licenceValidUntil: null, registrationDocCheckedAt: null, licenceCheckSince: new Date().toISOString(), licenceRead: null }
  }

  /** What LicenceCheckJob's AI read from a licence (the owner's licenceRead). */
  static licenceRead(over: Json = {}): Json {
    return {
      readable: true, tradeLicence: true, looksEdited: false, provisional: false, salonTrade: true,
      issuingBody: 'Greater Hyderabad Municipal Corporation', licenceNumber: 'TR-0934-422-0003', tradeName: 'Shine Unisex Salon',
      ownerName: 'Ravi Kumar', address: 'Shop 12, Ithum Tower', pincode: '201309', tradeCategory: 'Saloon', validUntil: '2027-03-31', ...over,
    }
  }

  /**
   * LicenceCheckJob's answer, as it writes it: PASSED with the last valid day, or FAILED with the reason. Like the
   * backend's plain SQL, it doesn't change the shop's version.
   */
  finishLicenceCheck(answer: { passedUntil: string } | { failed: string; read?: Json }) {
    if (!this.shop?.registrationDocFileId || this.shop.licenceCheck !== 'PENDING') return
    this.shop = 'passedUntil' in answer
      ? { ...this.shop, licenceCheck: 'PASSED', licenceCheckReason: null, licenceValidUntil: answer.passedUntil, registrationDocCheckedAt: '2026-11-14T05:00:00Z', licenceRead: MockApi.licenceRead({ validUntil: answer.passedUntil }) }
      : { ...this.shop, licenceCheck: 'FAILED', licenceCheckReason: answer.failed, licenceValidUntil: null, registrationDocCheckedAt: null, licenceRead: answer.read ?? null }
  }

  static shopOf(over: Json = {}): Json {
    return {
      id: 'shop1',
      shopCode: 10234,
      name: 'Shine Unisex Salon',
      ownerName: 'Ravi Kumar',
      addressLine: 'Shop 12, Ithum Tower',
      area: 'Sector 62',
      city: 'Noida',
      pincode: '201309',
      latitude: 28.627,
      longitude: 77.372,
      gstin: null,
      udyamNumber: null,
      status: 'APPROVED',
      statusReason: null,
      type: 'SALON',
      myRole: 'OWNER',
      ownerPhotoFileId: 'f-owner',
      shopPhotoFileId: 'f-shop',
      shopVideoFileId: 'fv-video',
      registrationDocType: 'TRADE_LICENCE',
      registrationDocFileId: 'f-doc',
      registrationDocCheckedAt: '2026-10-01T05:00:00Z',
      licenceCheck: 'PASSED',
      licenceCheckReason: null,
      licenceValidUntil: '2099-03-31',
      licenceCheckSince: '2026-10-01T04:59:00Z',
      licenceRead: null,
      recheckSince: null,
      version: 3,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      ...over,
      // ShopResponse.addressLocked: verified by the field team (approved, or approved before)
      addressLocked: over.addressLocked ?? !['DRAFT', 'PENDING_VISIT'].includes((over.status as string | undefined) ?? 'APPROVED'),
    }
  }

  /** A booking (or walk-in) for a barber, starting at an instant. */
  addBooking(over: Json & { startsAt: string }): Json {
    const services = SERVICES.filter((s) => ((over.serviceIds as string[] | undefined) ?? ['v1']).includes(s.id)).map((s) => ({
      serviceId: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      pricePaise: s.pricePaise,
      priceIsFrom: s.priceIsFrom,
    }))
    const minutes = services.reduce((t, s) => t + s.durationMinutes, 0)
    const start = new Date(over.startsAt).getTime()
    const a: Json = {
      id: `a${++this.n}`,
      kind: 'BOOKING',
      blockType: null,
      staffId: 'st1',
      status: 'CONFIRMED',
      endsAt: new Date(start + minutes * 60_000).toISOString(),
      startedAt: null,
      startedWithCode: null,
      services,
      bookingNo: `K7M${this.n}QX`,
      customerName: 'Riya Sharma',
      customerPhone: '9811122233',
      guestName: null,
      cancelReason: null,
      closureId: null,
      code: '4821',
      ...over,
    }
    delete a.serviceIds
    this.appointments.push(a)
    return a
  }

  private jwt(claims: Json): string {
    return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig${++this.n}`
  }

  private tokens() {
    const access = this.jwt(this.shop ? { sub: this.user.id, shop: this.shop.id, role: this.role } : { sub: this.user.id })
    const refresh = `refresh-${++this.n}`
    this.accessValid.add(access)
    this.refreshTokens.set(refresh, 'live')
    return {
      accessToken: access,
      accessExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      refreshToken: refresh,
      refreshExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
      user: this.user,
      newUser: this.user.name === null,
    }
  }

  /** The owner of another shop asks this person (by phone) to take it over (ShopOwnershipService.requestHandover). */
  offerHandover(over: Json = {}): Json {
    const shop = MockApi.shopOf({ id: 'shop9', shopCode: 10777, name: 'Royal Cuts', ownerName: 'Suresh Rao', area: 'Sector 18', status: 'APPROVED', type: 'SALON', ...over })
    const now = Date.now()
    const view = {
      id: `h${++this.n}`, shopId: shop.id, shopCode: shop.shopCode, shopName: shop.name, type: shop.type, area: shop.area,
      city: shop.city, ownerName: shop.ownerName, createdAt: new Date(now - 3600_000).toISOString(), expiresAt: new Date(now + 6 * 86400_000).toISOString(),
    }
    this.incoming.push({ view, shop, status: 'PENDING' })
    this.inbox.unshift({ id: `n${++this.n}`, type: 'SHOP_HANDOVER_REQUEST', title: 'A shop for you', body: `The owner of ${shop.name as string} wants to hand the shop over to you. Open Apni Dukan to accept or decline.`, url: '/handover', sentAt: new Date().toISOString(), read: false })
    return view
  }

  /** Another shop's owner invites this person's phone (ShopInvitesService.inviteHelper / inviteBarber). */
  offerInvite(role: 'HELPER' | 'BARBER' = 'HELPER', over: Json = {}): Json {
    const shop = MockApi.shopOf({ id: 'shop8', shopCode: 10555, name: 'Style Point', ownerName: 'Anil Gupta', area: 'Sector 15', status: 'APPROVED', type: 'SALON', ...over })
    const now = Date.now()
    const view = {
      id: `i${++this.n}`, shopId: shop.id, shopCode: shop.shopCode, shopName: shop.name, type: shop.type, area: shop.area,
      city: shop.city, role, createdAt: new Date(now - 3600_000).toISOString(), expiresAt: new Date(now + 6 * 86400_000).toISOString(),
    }
    this.incomingInvites.push({ view, shop, status: 'PENDING', staffId: role === 'BARBER' ? 'st2' : null })
    this.inbox.unshift({ id: `n${++this.n}`, type: 'SHOP_INVITE', title: `An invitation to join ${shop.name as string}`, body: `${shop.name as string} (${shop.area as string}) invited you to join as a ${role === 'BARBER' ? 'barber' : 'helper'}. Open Apni Dukan to accept or decline.`, url: '/invites', sentAt: new Date().toISOString(), read: false })
    return view
  }

  /** A saved session for the app to pick up (as if the person signed in earlier). */
  savedSession(): string {
    const refresh = `refresh-saved-${++this.n}`
    this.refreshTokens.set(refresh, 'live')
    return JSON.stringify({ refreshToken: refresh, user: this.user })
  }

  /** Ends every access token now (as if they expired): the next call must refresh. */
  expireAccess() {
    this.accessValid.clear()
  }

  /** The access token of a call carried the shop claim. */
  static tokenHasShop(auth: string | null): boolean {
    const part = auth?.replace('Bearer ', '').split('.')[1]
    if (!part) return false
    try {
      return Boolean(JSON.parse(Buffer.from(part, 'base64url').toString()).shop)
    } catch {
      return false
    }
  }

  /** The shop the access token names (its "shop" claim), or null. */
  static tokenShopOf(auth: string | null): string | null {
    const part = auth?.replace('Bearer ', '').split('.')[1]
    if (!part) return null
    try {
      return (JSON.parse(Buffer.from(part, 'base64url').toString()).shop as string | undefined) ?? null
    } catch {
      return null
    }
  }

  async attach(context: BrowserContext) {
    await context.route(`${API}/**`, async (route) => {
      if (this.offline) return route.abort('internetdisconnected')
      // A test can hold answers to some addresses (path with query, by substring) for a while
      for (const [part, ms] of this.slow) {
        if (route.request().url().includes(part)) await new Promise((r) => setTimeout(r, ms))
      }
      if (this.offline) return route.abort('internetdisconnected')
      try {
        await this.handle(route)
      } catch (e) {
        console.error('mock api failed on', route.request().method(), route.request().url(), e)
        await route.fulfill({ status: 500, body: JSON.stringify({ code: 'MOCK_FAILED', message: String(e) }) })
      }
    })
  }

  private view(a: Json): Json {
    const now = Date.now()
    const start = new Date(a.startsAt as string).getTime()
    const out: Json = {
      ...a,
      notStarted: a.status === 'CONFIRMED' && now >= start,
      noShowFrom: a.kind === 'BLOCK' ? null : new Date(start + 10 * 60_000).toISOString(),
      customerPhone: this.role === 'BARBER' ? null : (a.customerPhone ?? null),
      // SalonDayService.view: on a walk-in only while the viewer may still add walk-ins
      addedByMe: a.createdBy === this.user.id && (a.kind === 'BLOCK' || this.role !== 'BARBER' || this.walkIns),
    }
    delete out.code
    delete out.createdBy
    delete out.reassignedFrom
    delete out.wrongTries
    delete out.key
    return out
  }

  /** What holds a barber's time (the backend's HOLDING): CONFIRMED, IN_SERVICE, BLOCKED. */
  holdsBetween(staffId: unknown, from: number, to: number, except?: Json): Json[] {
    return this.appointments.filter(
      (x) =>
        x !== except &&
        x.staffId === staffId &&
        ['CONFIRMED', 'IN_SERVICE', 'BLOCKED'].includes(x.status as string) &&
        Date.parse(x.startsAt as string) < to &&
        Date.parse(x.endsAt as string) > from,
    )
  }

  /** SalonSetupService.requireRoomForStaff: at most 50 active barbers. */
  private noRoomForStaff() {
    return this.staff.filter((s) => s.active).length >= 50
  }

  /** The barber's CLOSED block for one of the salon's closed days (the day's count goes up). */
  private closedBlock(c: Json, st: Json) {
    const from = istInstant(c.date as string, '00:00')
    const to = new Date(Date.parse(from) + 86400_000).toISOString()
    this.appointments.push({ id: `b${++this.n}`, kind: 'BLOCK', blockType: 'CLOSED', staffId: st.id, status: 'BLOCKED', startsAt: from, endsAt: to, services: [], startedAt: null, startedWithCode: null, bookingNo: null, customerName: null, guestName: null, cancelReason: null, closureId: c.closureId, createdBy: this.user.id })
    c.barbers = (c.barbers as number) + 1
  }

  /** SalonSetupService.joinClosedDays: a barber added or switched on gets the salon's coming closed days. */
  private joinClosures(st: Json) {
    for (const c of this.closures) {
      if (Date.parse(istInstant(c.date as string, '00:00')) + 86400_000 <= Date.now()) continue
      if (this.appointments.some((a) => a.closureId === c.closureId && a.staffId === st.id && a.status === 'BLOCKED')) continue
      this.closedBlock(c, st)
    }
  }

  /**
   * SalonOfferService.check, in the same order, one error at a time as the backend: the request's own limits, the
   * salon live, the times, the dates, the services, the booking window, the pause, the hours, time left, overlaps.
   */
  private checkOffer(body: Json): { all: boolean; priced: Json[] } | { err: [number, string, string, Json?] } {
    const today = todayIst()
    const bad = (field: string, problem: string) => ({ err: [400, 'VALIDATION_FAILED', 'Some fields are not valid', { [field]: problem }] as [number, string, string, Json] })
    const pct = body.percentOff as number
    if (!Number.isInteger(pct) || pct < 5) return bad('percentOff', 'must be greater than or equal to 5')
    if (pct > 50) return bad('percentOff', 'must be less than or equal to 50')
    if (this.shop?.status !== 'APPROVED') return { err: [409, 'SALON_NOT_LIVE', 'Offers can be published once your salon is live.'] }
    if ((body.from == null) !== (body.until == null)) return bad(body.from == null ? 'from' : 'until', 'set both times, or neither')
    const onStep = (t: string) => /^\d{2}:\d{2}$/.test(t) && Number(t.slice(3)) % 15 === 0
    if (body.from != null && !onStep(body.from as string)) return bad('from', 'must be on a 15-minute step (:00, :15, :30 or :45)')
    if (body.until != null && !onStep(body.until as string)) return bad('until', 'must be on a 15-minute step (:00, :15, :30 or :45)')
    if (body.from != null && (body.from as string) >= (body.until as string)) return bad('until', 'must be after the start time')
    if ((body.startsOn as string) < today) return bad('startsOn', 'must be today or later')
    if ((body.endsOn as string) < (body.startsOn as string)) return bad('endsOn', 'must be on or after the first day')
    if ((body.endsOn as string) > addDays(today, 90)) return bad('endsOn', 'must be at most 90 days from today')
    const active = this.services.filter((s) => s.active)
    if (!active.length) return { err: [409, 'NO_SERVICES', 'Add your services before an offer.'] }
    const picked = (body.serviceIds ?? []) as string[]
    if (picked.some((id) => !active.some((s) => s.id === id))) return bad('serviceIds', "must be your salon's services that are switched on")
    const lastStart = addDays(today, this.settings.maxDaysAhead as number)
    if ((body.startsOn as string) > lastStart) {
      return { err: [409, 'OFFER_TOO_FAR', `Customers can book up to ${this.settings.maxDaysAhead} days ahead, so start the offer by ${shortDay(lastStart)}.`, { lastStart }] }
    }
    if (this.pausedUntil && Date.parse(this.pausedUntil) > Date.now() && Date.parse(this.pausedUntil) > Date.parse(istInstant(body.startsOn as string, (body.from as string) ?? '00:00'))) {
      return { err: [409, 'SALON_PAUSED', 'Online bookings are paused. Resume them first, or start the offer after that.'] }
    }
    if (!this.hours.length) return { err: [409, 'NO_SALON_HOURS', 'Set your opening hours first.'] }
    const outside: Json[] = []
    let timeLeft = false
    for (let d = body.startsOn as string; d <= (body.endsOn as string); d = addDays(d, 1)) {
      const wd = ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
      const open = this.hours.find((h) => h.weekday === wd)
      if (!open || this.closures.some((c) => c.date === d)) continue
      if (body.from != null && ((body.from as string) < (open.open as string) || (body.until as string) > (open.close as string))) {
        if (!outside.some((o) => o.weekday === wd)) outside.push({ weekday: wd, open: open.open, close: open.close })
        continue
      }
      // Today: only if the offer's time (or the day's opening) still lasts past now
      const nowHhmm = new Date(Date.now() + IST).toISOString().slice(11, 16)
      timeLeft ||= d > today || (((body.until as string) ?? (open.close as string)) > nowHhmm)
    }
    const NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    if (outside.length) {
      return { err: [409, 'OFFER_OUTSIDE_HOURS', `The offer's hours must be inside your opening hours: ${outside.map((o) => `${NAMES[o.weekday as number]} ${o.open}–${o.close}`).join(', ')}.`, { days: outside }] }
    }
    if (!timeLeft) return { err: [409, 'NO_OPEN_TIME', "Your salon isn't open at any time left in these dates."] }
    const all = picked.length === 0
    for (const other of this.offers) {
      const o = other.offer as Json
      if (offerState(other) === 'ENDED' || (o.endsOn as string) < (body.startsOn as string) || (o.startsOn as string) > (body.endsOn as string)) continue
      const [af, at] = [(o.from as string) ?? '00:00', (o.until as string) ?? '24:00']
      const [bf, bt] = [(body.from as string) ?? '00:00', (body.until as string) ?? '24:00']
      if (af >= bt || bf >= at) continue
      // One whose services are all switched off since covers nothing: not in the way
      const stillOn = o.allServices ? active.map((s) => s.id as string) : (o.serviceIds as string[]).filter((id) => active.some((s) => s.id === id))
      if (stillOn.length && (o.allServices || all || picked.some((id) => stillOn.includes(id)))) {
        const when = `${o.startsOn === o.endsOn ? shortDay(o.startsOn as string) : `${shortDay(o.startsOn as string)} – ${shortDay(o.endsOn as string)}`}${o.from ? `, ${o.from}–${o.until}` : ''}`
        return { err: [409, 'OFFER_OVERLAPS', `It overlaps your ${o.percentOff}% offer (${when}) on the same services. Pick other days, hours or services, or end that offer first.`, { offerId: o.id }] }
      }
    }
    const priced = active.filter((s) => all || picked.includes(s.id as string)).map((s) => ({ serviceId: s.id, name: s.name, pricePaise: s.pricePaise, offerPricePaise: offerPriceOf(s.pricePaise as number, pct), priceIsFrom: s.priceIsFrom }))
    return { all, priced }
  }

  private seesAll() {
    return this.role !== 'BARBER' || this.walkIns
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: this.cors() })
    // Support files (photos and PDFs here, a video to the fake R2): anyone signed in, no shop needed
    if (await this.ticketFiles.handle(route, url, method, this.user.id, this.cors())) return
    const contentType = req.headers()['content-type'] ?? null
    const raw = req.postData()
    const body = raw && contentType?.includes('json') ? JSON.parse(raw) : undefined
    const auth = req.headers()['authorization'] ?? null
    this.calls.push({ method, path: url.pathname + url.search, body, auth, idempotencyKey: req.headers()['idempotency-key'] ?? null, contentType, at: Date.now() })
    const p = url.pathname.replace(P, '')
    /**
     * Every successful GET carries an ETag: the day board and the upcoming list the backend's own ("s1-…": the
     * salon's change counter, who asks and what was asked), every other GET EtagConfig's fingerprint of the body. Sent
     * back unchanged as If-None-Match, the answer is 304 with no body.
     */
    const ok = (status: number, json?: unknown, extra: Record<string, string> = {}, ownTag?: string) => {
      const text = json === undefined ? '' : JSON.stringify(json)
      const etag = method === 'GET' && status >= 200 && status < 300 ? (ownTag ?? etagOf(text)) : null
      if (etag && matches(req.headers()['if-none-match'], etag)) {
        this.notModified.push(url.pathname + url.search)
        return route.fulfill({ status: 304, headers: { ...this.cors(), ETag: etag }, body: '' })
      }
      return route.fulfill({
        status,
        headers: { ...this.cors(), 'Content-Type': 'application/json', ...(etag ? { ETag: etag } : {}), ...extra },
        body: text,
      })
    }
    const fail = (status: number, code: string, message: string, details: Json = {}) => ok(status, { code, message, details })

    if (p.startsWith('/tiles/')) return route.fulfill({ status: 404, body: '' })
    // The saved salon video's (fake R2) link: a real little video, or 404 when it "ran out"
    if (p === '/video.mp4') {
      if (this.videoBroken) return route.fulfill({ status: 404, headers: this.cors(), body: '' })
      return route.fulfill({ status: 200, headers: { ...this.cors(), 'Content-Type': 'video/mp4' }, body: VIDEO })
    }

    // ---------- the fake R2 (the salon video's PUT goes here, straight from the phone) ----------
    if (p.startsWith('/__r2/')) {
      const id = p.split('/').pop()!.split('.')[0]
      const upload = this.videoUploads.get(id)
      if (method !== 'PUT' || !upload) return route.fulfill({ status: 403, headers: this.cors(), body: '<Error>SignatureDoesNotMatch</Error>' })
      if (this.r2Delay) await new Promise((r) => setTimeout(r, this.r2Delay))
      if (this.r2DropNext > 0) {
        this.r2DropNext--
        return route.abort('connectionreset')
      }
      if (this.r2Fail.times > 0) {
        this.r2Fail.times--
        return route.fulfill({ status: this.r2Fail.status, headers: this.cors(), body: '<Error>InternalError</Error>' })
      }
      // The link was signed for this type (R2 refuses another)
      if (contentType !== upload.contentType) return route.fulfill({ status: 403, headers: this.cors(), body: '<Error>SignatureDoesNotMatch</Error>' })
      const bytes = req.postDataBuffer()
      if (bytes && bytes.length > 0) this.r2.set(id, { size: bytes.length, head: bytes.subarray(0, 64) })
      // A file picked from disk is sent from the file itself, and Chromium doesn't show such a body to the test:
      // taken as arrived whole (its first bytes as an MP4's)
      else this.r2.set(id, { size: upload.sizeBytes, head: Buffer.from('\0\0\0\x20ftypisom', 'latin1') })
      return route.fulfill({ status: 200, headers: { ...this.cors(), ETag: '"r2"' }, body: '' })
    }

    // ---------- sign-in (public) ----------
    // OtpService: past the all-network numbers, a network that never signed this number in waits (429 TRY_LATER)
    if (p === '/auth/otp/send' && this.otpTryLater !== null) {
      const wait = this.otpTryLater
      this.otpTryLater = null
      return ok(429, { code: 'TRY_LATER', message: "Many tries for this number today. For its owner's safety, wait a little and try again.", details: {} }, { 'Retry-After': String(wait) })
    }
    if (p === '/auth/otp/send') return ok(202)
    if (p === '/auth/otp/verify') return body.code === '123456' ? ok(200, this.tokens()) : fail(400, 'WRONG_CODE', 'That code is not right. 4 tries left.')
    if (p === '/auth/refresh') {
      const state = this.refreshTokens.get(body.refreshToken)
      if (state === 'rotated') {
        // AuthService.refresh's grace: swapped under 30 s ago and the token it was swapped for never used, it is the
        // app that reloaded (or lost the answer) while its refresh was on the way: a new pair, the unused one ends
        const swap = this.swaps.get(body.refreshToken)
        const since = swap ? Date.now() - swap.at : Infinity
        if (swap && since <= REFRESH_GRACE_MS && this.refreshTokens.get(swap.successor) === 'live') {
          this.graceUsed++
          this.refreshTokens.set(swap.successor, 'revoked')
          this.graceReplaced.set(swap.successor, Date.now())   // revoked now: its own grace counts from here
          return ok(200, this.rotate(body.refreshToken, swap.at))
        }
        // Within the retry time (60 s) it is the app retrying: "sign in again" on that device; later, a copy
        if (since <= RETRY_GRACE_MS) return fail(401, 'INVALID_REFRESH_TOKEN', 'Sign in again.')
        return fail(401, 'REFRESH_TOKEN_REUSED', 'For your safety you were signed out everywhere. Sign in again.')
      }
      // GRACE_REPLACED: the pair the grace replaced, back after the grace: someone else had the token
      const replacedAt = this.graceReplaced.get(body.refreshToken)
      if (state === 'revoked' && replacedAt !== undefined && Date.now() - replacedAt > REFRESH_GRACE_MS) {
        return fail(401, 'REFRESH_TOKEN_REUSED', 'For your safety you were signed out everywhere. Sign in again.')
      }
      if (state !== 'live') return fail(401, 'INVALID_REFRESH_TOKEN', 'Sign in again.')
      if (this.refreshDown > 0) {
        this.refreshDown--
        return fail(503, 'SERVICE_BUSY', "We're having a short problem. Try again in a few seconds.")
      }
      this.refreshTokens.set(body.refreshToken, 'rotated')
      return ok(200, this.rotate(body.refreshToken))
    }
    if (p === '/auth/logout') {
      // Signed out: the token ends ("sign in again" if it comes back), not a swap
      this.refreshTokens.set(body.refreshToken, 'revoked')
      return ok(204)
    }

    const token = auth?.replace('Bearer ', '') ?? ''
    if (!this.accessValid.has(token)) return fail(401, 'TOKEN_EXPIRED', 'Your session has expired. Refresh it.')

    // A test can make the next call to a path fail once.
    for (const [suffix, f] of this.failOnce) {
      if (p.endsWith(suffix)) {
        this.failOnce.delete(suffix)
        // Retry-After as GlobalExceptionHandler sends it (PHOTOS_BUSY: 60)
        return ok(f.status, { code: f.code, message: f.message, details: f.details ?? {} }, f.retryAfter ? { 'Retry-After': String(f.retryAfter) } : {})
      }
    }

    // ---------- changing the phone number (AuthService.sendPhoneChangeCode, changePhone), in its order ----------
    if (p === '/auth/me/phone/send-code') {
      const phone = normalize(body.newPhone)
      if (!phone) return fail(400, 'INVALID_PHONE', 'Enter a 10-digit Indian mobile number')
      if (phone === this.user.phone) return fail(400, 'SAME_PHONE', 'This is already your number.')
      if (++this.phoneChangeTries > 5) return fail(429, 'TOO_MANY_CODES', "You've asked for codes to change your number 5 times today. Try again tomorrow.")
      if (this.takenPhones.has(phone)) return fail(409, 'PHONE_IN_USE', 'This phone number already has its own account')
      // The second code: to the verified email, else to the number the account has now
      const toEmail = this.user.emailVerified
      this.phoneChangeCodes.set(phone, { second: toEmail ? 'EMAIL' : 'PHONE', phoneTries: 0, secondTries: 0 })
      return ok(200, toEmail
        ? { secondCodeTo: 'EMAIL', sentTo: `${this.user.email!.charAt(0)}***${this.user.email!.slice(this.user.email!.indexOf('@'))}` }
        : { secondCodeTo: 'PHONE', sentTo: `ending ${this.user.phone.slice(6)}` })
    }
    if (p === '/auth/me/phone') {
      if (!body.phoneCode || !body.secondCode) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { secondCode: 'must not be blank' })
      const phone = normalize(body.newPhone)
      if (!phone) return fail(400, 'INVALID_PHONE', 'Enter a 10-digit Indian mobile number')
      const sent = this.phoneChangeCodes.get(phone)
      if (!sent) return fail(400, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.')
      // Checked one after the other, each with its own tries: the new number's code, then the second code (looked for
      // where the account's second code goes now: none there if the email changed since the codes were sent)
      const check = (which: 'phoneTries' | 'secondTries', right: boolean) => {
        if (right) return null
        sent[which]++
        if (sent[which] >= 5) {
          this.phoneChangeCodes.delete(phone)
          return fail(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes. Ask for a new one.')
        }
        return fail(400, 'WRONG_CODE', 'That code is not correct', { attemptsLeft: 5 - sent[which] })
      }
      const first = check('phoneTries', body.phoneCode === '123456')
      if (first) return first
      if ((sent.second === 'EMAIL') !== this.user.emailVerified) return fail(400, 'CODE_EXPIRED', 'This code has expired. Ask for a new one.')
      const second = check('secondTries', body.secondCode === (sent.second === 'EMAIL' ? '654321' : '111222'))
      if (second) return second
      // Refused under the lock: the codes stay for another try
      if (this.takenPhones.has(phone)) return fail(409, 'PHONE_IN_USE', 'This phone number already has its own account')
      this.phoneChangeCodes.delete(phone)
      // Every earlier token ends (revoked: a refresh with one is refused, not reuse); this device gets a new pair
      for (const t of this.refreshTokens.keys()) this.refreshTokens.set(t, 'revoked')
      this.accessValid.clear()
      this.user = { ...this.user, phone }
      const tokens = this.tokens()
      if (this.loseNextPhoneChange) {
        this.loseNextPhoneChange = false
        return route.abort('connectionreset')
      }
      return ok(200, tokens)
    }
    if (p === '/auth/me' && method === 'GET') return ok(200, this.user)
    if (p === '/auth/me' && method === 'PATCH') {
      this.user = { ...this.user, name: body.name }
      return ok(200, this.user)
    }
    // "Need help" (TicketService.ask): a verified email and a name; a message of 10 to 5,000 characters
    if (p === '/helpdesk/tickets' && method === 'POST') {
      if (!this.user.emailVerified || !this.user.name) {
        return fail(403, 'PROFILE_INCOMPLETE', 'Verify your email and tell us your name first.', {
          missing: [...(this.user.emailVerified ? [] : ['email']), ...(this.user.name ? [] : ['name'])],
        })
      }
      const text = String(body.message ?? '').trim()
      if (text.length < 10 || text.length > 5000) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { message: 'write 10 to 5000 characters' })
      const taken = this.ticketFiles.take(body.fileIds, this.user.id)
      if (!Array.isArray(taken)) return fail(taken.status, taken.code, taken.message)
      const t = this.newTicket(body.app as string, (body.subject as string | null) ?? null, text)
      t.messages[0].files = taken
      return ok(201, { id: t.id, number: t.number, sentTo: this.user.email })
    }
    // "My requests" (TicketService.mine / myTicket / addToMine): only this person's, newest activity first
    if (p === '/helpdesk/tickets' && method === 'GET') {
      const mine = this.tickets.filter((t) => t.owner === this.user.id)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)).slice(0, 30)
      return ok(200, mine.map(myTicket))
    }
    const help = p.match(/^\/helpdesk\/tickets\/([^/]+)(\/messages)?$/)
    if (help) {
      const t = this.tickets.find((x) => x.id === help[1] && x.owner === this.user.id)
      if (!t) return fail(404, 'NOT_FOUND', 'Ticket not found')
      if (help[2] && method === 'POST') {
        const text = String(body.message ?? '').trim()
        const withFiles = Array.isArray(body.fileIds) && (body.fileIds as unknown[]).length > 0
        if ((!withFiles && text.length < 2) || text.length > 5000) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { message: 'write 2 to 5000 characters' })
        // TicketService.addToMine: the same words, still the newest message and not resolved since: a repeat, kept once
        const last = t.messages[t.messages.length - 1]
        if (!withFiles && t.status !== 'RESOLVED' && last && !last.fromSupport && last.body === text) return ok(200, { ticket: myTicket(t), messages: t.messages })
        if (this.addedThisHour >= 20) return fail(429, 'TOO_MANY_MESSAGES', "You've written a lot in the last hour. We'll read those first.")
        const taken = this.ticketFiles.take(body.fileIds, this.user.id)
        if (!Array.isArray(taken)) return fail(taken.status, taken.code, taken.message)
        this.addedThisHour++
        const at = new Date().toISOString()
        t.messages.push({ seq: t.messages.length + 1, fromSupport: false, supportName: null, body: text, attachments: 0, at, files: taken })
        t.status = 'OPEN'
        t.lastMessageAt = at
      }
      return ok(200, { ticket: myTicket(t), messages: t.messages })
    }
    if (p === '/auth/email/send-code') return ok(202)
    if (p === '/auth/email/verify') {
      if (body.code !== '654321') return fail(400, 'WRONG_CODE', 'That code is not right.')
      this.user = { ...this.user, email: body.email, emailVerified: true }
      return ok(200, this.user)
    }
    if (p === '/auth/logout-all') return ok(204)
    // Deleting the account (AuthService.sendDeleteCode / deleteAccount): an owner is refused first; a booking soon or
    // a booking pause come through failOnce, as SalonAccountDeletion.checkCanDelete answers them
    const ownerRefused = () =>
      fail(409, 'SHOP_OWNER', 'You own a shop on Apni Dukan. Close it or hand it over before deleting your account.')
    // Unlocking a verified salon's details (AuthService.sendEditCode / unlockEditing, EditUnlockStore)
    if (p === '/auth/me/edit-code' && method === 'POST') {
      if (!this.shop || this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', "Only a shop's owner needs this code.")
      this.editCodesSent++
      return ok(202)
    }
    if (p === '/auth/me/edit-unlock' && method === 'POST') {
      if (body.code !== '123456') return fail(400, 'WRONG_CODE', 'That code is not correct', { attemptsLeft: 4 })
      this.editUntil = new Date(Date.now() + 15 * 60_000).toISOString()
      return ok(200, { until: this.editUntil, secondsLeft: 900 })
    }
    if (p === '/auth/me/edit-unlock' && method === 'GET') {
      const left = this.editUntil ? Math.max(0, Math.floor((Date.parse(this.editUntil) - Date.now()) / 1000)) : 0
      return ok(200, { until: left > 0 ? this.editUntil : null, secondsLeft: left })
    }
    if (p === '/auth/me/edit-unlock' && method === 'DELETE') {
      this.editUntil = null
      return ok(204)
    }
    if (p === '/auth/me/delete-code') return this.shop && this.role === 'OWNER' ? ownerRefused() : ok(202)
    if (p === '/auth/me/delete') {
      if (body.code !== '123456') return fail(400, 'WRONG_CODE', 'That code is not correct', { attemptsLeft: 4 })
      if (this.shop && this.role === 'OWNER') return ownerRefused()
      // Left the shop, every device signed out
      this.shop = null
      this.accessValid.clear()
      this.refreshTokens.clear()
      return ok(204)
    }
    if (p === '/push/public-key') return ok(200, { publicKey: null })

    // ---------- the shop ----------
    if (p === '/shops/me' && method === 'GET') {
      if (this.shopDown > 0) {
        this.shopDown--
        return fail(503, 'SERVICE_BUSY', "We're having a short problem. Try again in a few seconds.")
      }
      if (!this.shop && this.addedToShop) {
        this.shop = this.addedToShop
        this.role = this.shop.myRole as Role
      }
      if (!this.shop) return fail(404, 'NO_SHOP', 'You have no shop yet.')
      // ShopResponse: recheckSince is the owner's only; a barber gets no statusReason (forBarber)
      const mine = this.role === 'OWNER' ? this.shop : { ...this.shop, recheckSince: null, ...(this.role === 'BARBER' ? { statusReason: null } : {}) }
      return ok(200, mine)
    }
    if (p === '/shops/geocode' && method === 'POST') {
      // The same checks as ShopRequests.Geocode, then AddressLocator's answers
      const bad: Json = {}
      if (typeof body.addressLine !== 'string' || body.addressLine.trim().length < 5) bad.addressLine = 'size must be between 5 and 200'
      if (typeof body.area !== 'string' || body.area.trim().length < 2) bad.area = 'size must be between 2 and 100'
      if (typeof body.city !== 'string' || body.city.trim().length < 2) bad.city = 'size must be between 2 and 60'
      if (!/^[1-9]\d{5}$/.test(body.pincode ?? '')) bad.pincode = 'must be a 6-digit pincode'
      if (Object.keys(bad).length) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', bad)
      if (this.geocodeDelay) await new Promise((r) => setTimeout(r, this.geocodeDelay))
      if (this.geocode === 'off') return fail(503, 'GEOCODING_OFF', "Address search isn't available. Use your location.")
      // The person's 10 Google lookups for the day are used up: Retry-After is what is left of the day's window
      if (this.geocode === 'used-up') {
        return ok(429, { code: 'TRY_LATER', message: 'Many address searches in a short time. Wait a little, or use your location.', details: {} }, { 'Retry-After': '80000' })
      }
      if (!this.geocode) return fail(404, 'ADDRESS_NOT_FOUND', "Couldn't find that address. Check the pincode and area, or use your location.")
      return ok(200, this.geocode)
    }
    if (p === '/shops/reverse-geocode' && method === 'POST') {
      // ShopRequests.ReverseGeocode: inside India
      if (!(body.latitude >= 6 && body.latitude <= 37.6 && body.longitude >= 68 && body.longitude <= 97.5)) {
        return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { latitude: 'must be in India' })
      }
      if (this.reverseDelay) await new Promise((r) => setTimeout(r, this.reverseDelay))
      if (this.reverse === 'off') return fail(503, 'GEOCODING_OFF', "Address search isn't available. Use your location.")
      if (this.reverse === 'down') return fail(503, 'GEOCODING_UNAVAILABLE', "Address search isn't working right now.")
      if (!this.reverse) return fail(404, 'ADDRESS_NOT_FOUND', "Couldn't find that address.")
      return ok(200, this.reverse)
    }
    if (p === '/shops' && method === 'POST') {
      if (this.shop) return fail(409, 'ALREADY_HAS_SHOP', 'You already have a shop.')
      if (!this.user.emailVerified || !this.user.name) return fail(403, 'PROFILE_INCOMPLETE', 'Add your email and name first.')
      if (!/^[1-9]\d{5}$/.test(body.pincode)) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { pincode: 'must be a 6-digit pincode' })
      this.role = 'OWNER'
      this.shop = MockApi.shopOf({ ...body, status: 'DRAFT', myRole: 'OWNER', type: body.type ?? 'KIRANA', ownerPhotoFileId: null, shopPhotoFileId: null, shopVideoFileId: null, registrationDocType: null, registrationDocFileId: null, registrationDocCheckedAt: null, licenceCheck: null, licenceCheckReason: null, licenceValidUntil: null, gstin: null, udyamNumber: null, version: 0 })
      // A new salon has no services, hours or barbers yet
      this.services = []
      this.hours = []
      this.staff = []
      return ok(201, this.shop)
    }
    if (p === '/shops/me' && method === 'PATCH') {
      if (!this.shop || this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can do this.')
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      // A salon has no GSTIN or Udyam number now: anything sent for them is ignored (ShopService.update)
      const { version: _v, gstin: _g, udyamNumber: _u, ...change } = body
      // ShopService.update: a verified address can't be moved by the owner (409 ADDRESS_LOCKED)
      const moved = ['addressLine', 'area', 'city', 'pincode', 'latitude', 'longitude'].some((k) => change[k] !== undefined && change[k] !== this.shop![k])
      if (moved && this.shop.addressLocked) return fail(409, 'ADDRESS_LOCKED', 'Your address was verified by our field team, so only they can change it. Ask them with Request address change.')
      const nothing = Object.keys(change).every((k) => change[k] === this.shop![k])
      if (nothing) return ok(200, this.shop)
      if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      // The trade licence was matched against the name, owner and address: changing one checks it again
      const matched = ['name', 'ownerName', 'addressLine', 'area', 'pincode'].some((k) => change[k] !== undefined && change[k] !== this.shop![k])
      const recheckLicence = matched && Boolean(this.shop.registrationDocFileId) && this.shop.registrationDocType === 'TRADE_LICENCE'
      this.shop = { ...this.shop, ...change, ...(recheckLicence ? MockApi.licencePending : {}), version: (this.shop.version as number) + 1 }
      return ok(200, this.shop)
    }
    if (p === '/shops/me/photos') {
      if (!this.shop) return fail(404, 'NO_SHOP', 'You have no shop yet.')
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      const newPhoto = (body.ownerPhotoFileId !== undefined && body.ownerPhotoFileId !== this.shop.ownerPhotoFileId)
        || (body.shopPhotoFileId !== undefined && body.shopPhotoFileId !== this.shop.shopPhotoFileId)
      if (!newPhoto) return ok(200, this.shop)
      if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      this.recheckIfLive(
        (body.ownerPhotoFileId !== undefined && body.ownerPhotoFileId !== this.shop.ownerPhotoFileId)
          || (body.shopPhotoFileId !== undefined && body.shopPhotoFileId !== this.shop.shopPhotoFileId),
      )
      this.shop = {
        ...this.shop,
        ownerPhotoFileId: body.ownerPhotoFileId ?? this.shop.ownerPhotoFileId,
        shopPhotoFileId: body.shopPhotoFileId ?? this.shop.shopPhotoFileId,
        version: (this.shop.version as number) + 1,
      }
      return ok(200, this.shop)
    }
    if (p === '/shops/me/video' && method === 'PUT') {
      if (!this.shop || this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can change these details.')
      if (this.shop.type !== 'SALON') return fail(409, 'NOT_A_SALON', 'The salon video is only for salons.')
      if (this.shopChangedOnVideo > 0) {
        // Someone else saved the shop just now: its version moved on
        this.shopChangedOnVideo--
        this.shop = { ...this.shop, version: (this.shop.version as number) + 1 }
      }
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      const f = this.files.find((x) => x.id === body.fileId && x.purpose === 'SHOP_VIDEO')
      if (!f) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { fileId: 'must be a video uploaded with POST /files/video-uploads' })
      if (f.id === this.shop.shopVideoFileId) return ok(200, this.shop)
      if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      this.recheckIfLive(f.id !== this.shop.shopVideoFileId)
      this.shop = { ...this.shop, shopVideoFileId: f.id, version: (this.shop.version as number) + 1 }
      return ok(200, this.shop)
    }
    if (p === '/shops/me/registration-document' && method === 'PUT') {
      if (!this.shop || this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can change these details.')
      if (this.shop.type !== 'SALON') return fail(409, 'NOT_A_SALON', 'The registration document is only for salons.')
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      if (body.type !== 'TRADE_LICENCE') return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { type: 'must be TRADE_LICENCE: only a municipal trade licence counts' })
      const f = this.files.find((x) => x.id === body.fileId && x.purpose === 'REG_DOC')
      if (!f) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { fileId: 'must be a photo or PDF uploaded with purpose REG_DOC' })
      // The same licence again: as it is, unless it wasn't accepted (then checked again)
      if (f.id === this.shop.registrationDocFileId && body.type === this.shop.registrationDocType && this.shop.licenceCheck !== 'FAILED') return ok(200, this.shop)
      if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      // ShopService.setRegistrationDoc: the salon stays as it is; the new licence waits for the automatic check
      this.shop = { ...this.shop, registrationDocType: body.type, registrationDocFileId: f.id, ...MockApi.licencePending, version: (this.shop.version as number) + 1 }
      return ok(200, this.shop)
    }
    if (p === '/shops/me/registration-document' && method === 'DELETE') {
      if (!this.shop || this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can change these details.')
      if (this.shop.type !== 'SALON') return fail(409, 'NOT_A_SALON', 'The registration document is only for salons.')
      if (Number(url.searchParams.get('version')) !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      if (this.shop.registrationDocFileId) {
        if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
        this.shop = { ...this.shop, registrationDocType: null, registrationDocFileId: null, registrationDocCheckedAt: null, licenceCheck: null, licenceCheckReason: null, licenceValidUntil: null, version: (this.shop.version as number) + 1 }
      }
      return ok(200, this.shop)
    }
    // ---- Address change requests (AddressRequestService) ----
    if (p === '/shops/me/address-request') {
      if (!this.shop) return fail(404, 'NO_SHOP', 'You have no shop yet.')
      if (this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can change the address.')
      const latest = this.addressRequests.at(-1)
      if (method === 'GET') return latest ? ok(200, latest) : ok(204)
      if (method === 'POST') {
        // ShopRequests.AddressRequest (@Valid): before anything else
        const bad: Json = {}
        if (typeof body.version !== 'number') bad.version = 'must not be null'
        if (typeof body.addressLine !== 'string' || body.addressLine.trim().length < 5 || body.addressLine.length > 200) bad.addressLine = 'size must be between 5 and 200'
        if (typeof body.area !== 'string' || body.area.trim().length < 2 || body.area.length > 100) bad.area = 'size must be between 2 and 100'
        if (typeof body.city !== 'string' || body.city.trim().length < 2 || body.city.length > 60) bad.city = 'size must be between 2 and 60'
        if (!/^[1-9]\d{5}$/.test(body.pincode ?? '')) bad.pincode = 'must be a 6-digit pincode'
        if (!(body.latitude >= 6 && body.latitude <= 37.6)) bad.latitude = 'must be greater than or equal to 6.0'
        if (!(body.longitude >= 68 && body.longitude <= 97.5)) bad.longitude = 'must be greater than or equal to 68.0'
        if (Object.keys(bad).length) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', bad)
      }
      const version = method === 'DELETE' ? Number(url.searchParams.get('version')) : body.version
      if (version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone else saved changes to this shop. Reload and try again.')
      const waiting = this.addressRequests.find((x) => x.status === 'PENDING')
      if (method === 'DELETE') {
        if (waiting) {
          waiting.status = 'CANCELLED'
          waiting.decidedAt = new Date().toISOString()
          this.shop = { ...this.shop, version: (this.shop.version as number) + 1 }
          this.endAddressRecheck()
        }
        return ok(204)
      }
      if (!this.shop.addressLocked) return fail(409, 'ADDRESS_NOT_LOCKED', "Your address isn't verified yet: change it yourself in Salon details.")
      if (this.shop.status === 'SUSPENDED' || this.shop.status === 'CLOSED') return fail(409, 'WRONG_STATUS', `${this.shop.status === 'SUSPENDED' ? 'Your shop is suspended' : 'Your shop is closed'}, so it can't ask for a new address. Write to us from More → Need help.`, { status: this.shop.status })
      if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      const same = ['addressLine', 'area', 'city', 'pincode'].every((k) => String(body[k]).trim() === this.shop![k])
        && body.latitude === this.shop.latitude && body.longitude === this.shop.longitude
      if (same) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { addressLine: 'is the address you have now; change the address or move the pin' })
      if (waiting) {
        waiting.status = 'CANCELLED'
        waiting.decidedAt = new Date().toISOString()
      }
      const made = {
        id: `ar${++this.n}`, addressLine: body.addressLine.trim(), area: body.area.trim(), city: body.city.trim(), pincode: body.pincode,
        latitude: body.latitude, longitude: body.longitude, status: 'PENDING', reason: null, createdAt: new Date().toISOString(), decidedAt: null,
      }
      this.addressRequests.push(made)
      const waitedBefore = Boolean(this.shop.recheckSince)
      this.recheckIfLive(true)
      if (!waitedBefore && this.shop.status === 'APPROVED') this.recheckOnlyForAddress = true
      this.shop = { ...this.shop, version: (this.shop.version as number) + 1 }
      return ok(201, made)
    }
    if (p === '/shops/me/submit') {
      if (!this.shop) return fail(404, 'NO_SHOP', 'You have no shop yet.')
      // ShopService.submitForVisit: the version first (ownedShop), then what is missing
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      if (!this.shop.ownerPhotoFileId || !this.shop.shopPhotoFileId || (this.shop.type === 'SALON' && !this.shop.shopVideoFileId)) {
        const missing: Json = {}
        if (!this.shop.ownerPhotoFileId) missing.ownerPhotoFileId = "add the owner's photo"
        if (!this.shop.shopPhotoFileId) missing.shopPhotoFileId = 'add a photo of the shop'
        if (this.shop.type === 'SALON' && !this.shop.shopVideoFileId) missing.shopVideoFileId = 'add a short video of the salon'
        return fail(409, 'PHOTOS_REQUIRED', "Add the owner's photo, a photo of the shop and a short video of the salon first.", missing)
      }
      if (this.shop.type === 'SALON') {
        const missing: Json = {}
        if (!this.services.some((s) => s.active)) missing.services = 'add the services the salon offers'
        if (!this.hours.length) missing.hours = "set the salon's opening hours"
        if (Object.keys(missing).length) {
          return fail(409, 'REGISTRATION_INCOMPLETE', "Add the salon's services and its opening hours first.", missing)
        }
      }
      this.shop = { ...this.shop, status: 'PENDING_VISIT', statusReason: null, version: (this.shop.version as number) + 1 }
      return ok(200, this.shop)
    }
    // ---------- invitations (ShopInvitesService): the same answer for any number; nobody joins until they accept ----------
    const INVITE_ANSWER = "Invitation sent. They'll see it in Apni Dukan when they sign in with this number."
    if (p === '/shops/me/helpers' && method === 'POST') {
      if (this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can do this.')
      const phone = normalizeMockPhone(body?.phone)
      if (!phone) return fail(400, 'INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number')
      if (phone === this.user.phone) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { phone: 'is your own number' })
      const same = this.shopInvites.find((v) => v.phone === phone)
      if (same) return ok(202, { message: INVITE_ANSWER, invite: same })
      if (this.members.some((m) => m.phone === phone)) return fail(409, 'ALREADY_A_MEMBER', 'This number already works in your shop.')
      const helpers = this.members.filter((m) => m.role === 'HELPER').length + this.shopInvites.filter((v) => v.role === 'HELPER').length
      if (helpers >= 10) return fail(409, 'TOO_MANY_HELPERS', 'A shop can have up to 10 helpers, counting invitations still waiting. Remove or cancel one first.')
      const invite = { id: `i${++this.n}`, phone, role: 'HELPER', staffId: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() }
      this.shopInvites.push(invite)
      return ok(202, { message: INVITE_ANSWER, invite })
    }
    if (p === '/shops/me/invites' && method === 'GET') {
      if (this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can do this.')
      return ok(200, this.shopInvites)
    }
    const shopInvite = p.match(/^\/shops\/me\/invites\/([^/]+)$/)
    if (shopInvite && method === 'DELETE') {
      const v = this.shopInvites.find((x) => x.id === shopInvite[1])
      if (!v) return fail(404, 'INVITE_NOT_FOUND', 'No such invitation.')
      this.shopInvites = this.shopInvites.filter((x) => x !== v)
      const s = this.staff.find((x) => x.id === v.staffId)
      if (s) Object.assign(s, { invitedPhone: null, version: (s.version as number) + 1 })
      return ok(204)
    }
    if (p === '/me/invites' && method === 'GET') {
      return ok(200, this.incomingInvites.filter((v) => v.status === 'PENDING' && Date.parse(v.view.expiresAt as string) > Date.now()).map((v) => v.view))
    }
    const inviteAnswer = p.match(/^\/me\/invites\/([^/]+)\/(accept|decline)$/)
    if (inviteAnswer && method === 'POST') {
      const v = this.incomingInvites.find((x) => x.view.id === inviteAnswer[1])
      if (!v) return fail(404, 'INVITE_NOT_FOUND', 'No such invitation.')
      const gone = (status: string) => fail(409, 'INVITE_GONE', "This invitation isn't open any more.", { status })
      if (v.status !== 'PENDING') return gone(v.status)
      if (Date.parse(v.view.expiresAt as string) <= Date.now()) return gone('EXPIRED')
      if (inviteAnswer[2] === 'decline') {
        v.status = 'DECLINED'
        return ok(204)
      }
      if (this.shop) return fail(409, 'ALREADY_IN_A_SHOP', 'You work in another shop. Leave it first, then accept.')
      v.status = 'ACCEPTED'
      const role = v.view.role as Role
      this.shop = { ...v.shop, myRole: role }
      this.role = role
      this.myStaffId = role === 'BARBER' ? v.staffId : null
      this.walkIns = false
      this.members = [
        { userId: 'u1', name: this.user.name, phone: this.user.phone, role, staffId: this.myStaffId, walkInAccess: false },
        { userId: 'u0', name: v.shop.ownerName, phone: '9000000001', role: 'OWNER', staffId: null, walkInAccess: true },
      ]
      if (role === 'BARBER') this.staff[1].loginPhone = this.user.phone
      return ok(200, this.shop)
    }
    const helper = p.match(/^\/shops\/me\/helpers\/([^/]+)$/)
    if (helper && method === 'DELETE') {
      this.members = this.members.filter((m) => m.userId !== helper[1])
      return ok(200, [])
    }
    // ---------- closing and handing over (ShopOwnershipService) ----------
    const SAME_ANSWER = "If that number has an Apni Dukan account, they'll see your request."
    const shopOwnerOnly = () => fail(403, 'OWNER_ONLY', 'Only the shop owner can do this.')
    const noShop = () => fail(404, 'NO_SHOP', "You haven't registered or joined a shop yet.")
    const shopChanged = () => fail(409, 'SHOP_CHANGED', 'Someone else saved changes to this shop. Reload and try again.')
    if (p === '/shops/me/close' && method === 'POST') {
      if (typeof body?.version !== 'number') return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { version: 'must not be null' })
      if (typeof body.reason === 'string' && body.reason.length > 200) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { reason: 'size must be between 0 and 200' })
      // No membership: a retry of a close that worked (a lost reply) answers the closed shop again
      if (!this.shop) return this.closedShop ? ok(200, this.closedShop) : noShop()
      if (this.role !== 'OWNER') return shopOwnerOnly()
      if (body.version !== this.shop.version) return shopChanged()
      if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
      if (reason !== null && reason.length < 2) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { reason: 'must be 2 to 200 characters' })
      const closed = { ...this.shop, status: 'CLOSED', statusReason: reason, version: (this.shop.version as number) + 1 }
      // Every upcoming online booking cancelled, each customer told (one statement for all)
      for (const a of this.appointments) {
        if (a.kind === 'BOOKING' && a.status === 'CONFIRMED' && Date.parse(a.startsAt as string) > Date.now()) {
          Object.assign(a, { status: 'CANCELLED_BY_SALON', cancelReason: 'The salon has closed.' })
        }
      }
      this.ownHandover = null
      this.closedShop = closed
      // Everyone's membership ends, the owner's too (who keeps their sessions)
      this.shop = null
      this.members = []
      this.myStaffId = null
      return ok(200, closed)
    }
    if (p === '/shops/me/handover') {
      if (!this.shop) return noShop()
      if (this.role !== 'OWNER') return shopOwnerOnly()
      if (method === 'GET') {
        if (this.ownHandover && Date.parse(this.ownHandover.expiresAt as string) <= Date.now()) this.ownHandover = null
        return this.ownHandover ? ok(200, this.ownHandover) : fail(404, 'NO_HANDOVER', 'No hand-over request is waiting.')
      }
      if (method === 'DELETE') {
        this.ownHandover = null
        return ok(204)
      }
      // POST: the phone is read first, then the day's count (a refused try counts too), then version, own number, one waiting
      const phone = normalizeMockPhone(body?.phone)
      if (!phone) return fail(400, 'INVALID_PHONE', 'Enter a 10-digit Indian mobile number')
      // ShopOwnershipService.requestHandover: the code before the day's count
      if (this.editLocked()) return fail(403, 'EDIT_LOCKED', "Your shop is verified: confirm it's you with the code we send to your phone first.")
      if (++this.handoverAsks > 5) {
        return ok(429, { code: 'TOO_MANY_REQUESTS', message: 'Too many hand-over requests today. Try again tomorrow.', details: {} }, { 'Retry-After': '3600' })
      }
      if (body.version !== this.shop.version) return shopChanged()
      if (phone === this.user.phone) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { phone: 'is your own number' })
      if (this.ownHandover) return fail(409, 'HANDOVER_PENDING', 'You already asked someone to take over this shop. Cancel that request first.')
      const now = Date.now()
      this.ownHandover = { id: `h${++this.n}`, phone, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 7 * 86400_000).toISOString() }
      // The same answer whether or not the number has an account
      return ok(202, { message: SAME_ANSWER, handover: this.ownHandover })
    }
    if (p === '/me/handover' && method === 'GET') {
      return ok(200, this.incoming.filter((h) => h.status === 'PENDING' && Date.parse(h.view.expiresAt as string) > Date.now()).map((h) => h.view))
    }
    const answer = p.match(/^\/me\/handover\/([^/]+)\/(accept|decline)$/)
    if (answer && method === 'POST') {
      const h = this.incoming.find((x) => x.view.id === answer[1])
      if (!h) return fail(404, 'HANDOVER_NOT_FOUND', 'No such hand-over request.')
      const gone = (status: string) => fail(409, 'HANDOVER_GONE', "This hand-over request isn't open any more.", { status })
      if (answer[2] === 'accept' && (!this.user.emailVerified || !this.user.name)) {
        return fail(403, 'PROFILE_INCOMPLETE', 'Add your email and name first.', { missing: [!this.user.emailVerified && 'email', !this.user.name && 'name'].filter(Boolean) })
      }
      if (h.status !== 'PENDING') return gone(h.status)
      if (Date.parse(h.view.expiresAt as string) <= Date.now()) return gone('EXPIRED')
      if (answer[2] === 'decline') {
        h.status = 'DECLINED'
        return ok(204)
      }
      if (this.shop && this.shop.id !== h.shop.id) return fail(409, 'ALREADY_IN_A_SHOP', 'You work in another shop. Leave it first, then accept.')
      h.status = 'ACCEPTED'
      // A helper or barber of this shop is promoted (a barber's own sign-in on his profile goes); anyone else joins as owner
      this.shop = { ...h.shop, myRole: 'OWNER' }
      this.role = 'OWNER'
      this.myStaffId = null
      this.walkIns = true
      this.inbox.unshift({ id: `n${++this.n}`, type: 'SHOP_HANDOVER_DONE', title: 'The shop is yours', body: `You now own ${h.shop.name as string} on Apni Dukan. Check its details and photos.`, url: '/shops/me', sentAt: new Date().toISOString(), read: false })
      return ok(200, this.shop)
    }

    if (p === '/shops/me/leave') {
      if (this.role === 'OWNER') return fail(409, 'OWNER_CANT_LEAVE', "The owner can't leave the shop.")
      this.shop = null
      return ok(204)
    }

    // ---------- files ----------
    // Files act for the token's shop only while the database agrees (a token from before a hand-over, closing or
    // removal: 403 SHOP_REQUIRED)
    if (p.startsWith('/files') && (!this.shop || MockApi.tokenShopOf(auth) !== this.shop.id || this.staleFileTokenOnce)) {
      this.staleFileTokenOnce = false
      return fail(403, 'SHOP_REQUIRED', 'Register or join a shop first.')
    }
    // ---------- the salon video (VideoUploadService): a one-time link, the PUT to R2, then complete ----------
    if (p === '/files/video-uploads' && method === 'POST') {
      if (this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can add the salon video.')
      const type = String(body?.contentType ?? '').split(';')[0].trim().toLowerCase()
      if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(type)) return fail(400, 'UNSUPPORTED_FILE_TYPE', 'The video must be MP4, MOV or WebM')
      if (body.sizeBytes > 100 * 1024 * 1024) return fail(413, 'FILE_TOO_LARGE', 'A video can be at most 100 MB')
      if (this.shop?.type !== 'SALON') return fail(409, 'NOT_A_SALON', 'The salon video is only for salons.')
      // durationSeconds may be null (the phone couldn't read it): then only the size counts
      if (body.durationSeconds !== null && (body.durationSeconds < 14 || body.durationSeconds > 46)) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { durationSeconds: 'must be 15 to 45 seconds' })
      if (this.videoUploads.size >= 5) return fail(429, 'TOO_MANY_UPLOADS', 'This shop started 5 video uploads today. Try again tomorrow.')
      const id = `vu${++this.n}`
      this.videoUploads.set(id, { sizeBytes: body.sizeBytes, contentType: type, fileId: null, createdAt: Date.now() })
      const ext = type === 'video/quicktime' ? 'mov' : type.split('/')[1]
      return ok(201, {
        uploadId: id,
        uploadUrl: `${API}/__r2/apni-dukan/shops/shop1/videos/${id}.${ext}?X-Amz-Signature=fake`,
        contentType: type,
        sizeBytes: body.sizeBytes,
        expiresAt: minutesFromNow(15),
        expiresInSeconds: 900,
      })
    }
    const completing = p.match(/^\/files\/video-uploads\/([^/]+)\/complete$/)
    if (completing && method === 'POST') {
      if (this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can add the salon video.')
      const id = completing[1]
      const upload = this.videoUploads.get(id)
      if (!upload) return fail(404, 'UPLOAD_NOT_FOUND', 'No such upload')
      if (upload.fileId) return ok(200, this.files.find((x) => x.id === upload.fileId))
      const stored = this.r2.get(id)
      if (!stored) return fail(409, 'UPLOAD_NOT_FINISHED', "The video hasn't arrived yet. Send it again.")
      const ftyp = stored.head.subarray(4, 8).toString('latin1') === 'ftyp'
      const ebml = stored.head.length >= 4 && stored.head.readUInt32BE(0) === 0x1a45dfa3
      if (stored.size !== upload.sizeBytes) {
        this.r2.delete(id)
        return fail(400, 'UPLOAD_SIZE_MISMATCH', "The video that arrived isn't the one described. Send it again.")
      }
      if (upload.contentType === 'video/webm' ? !ebml : !ftyp) {
        this.r2.delete(id)
        return fail(400, 'UNSUPPORTED_FILE_TYPE', "That file isn't a video.")
      }
      const f = { id: `fv${++this.n}`, purpose: 'SHOP_VIDEO', contentType: upload.contentType, sizeBytes: upload.sizeBytes, originalName: null, createdAt: new Date().toISOString(), duplicate: false }
      this.files.push(f)
      upload.fileId = f.id
      return ok(201, f)
    }
    if (p === '/files' && method === 'POST') {
      if (!contentType?.startsWith('multipart/form-data')) return fail(400, 'VALIDATION_FAILED', 'Send a file.')
      // The salon's registration document is the owner's (FileService.requireOwnerFor)
      if (url.searchParams.get('purpose') === 'REG_DOC' && this.role !== 'OWNER') {
        return fail(403, 'OWNER_ONLY', 'Only the shop owner can add or open the registration document.')
      }
      const f = { id: `f${++this.n}`, purpose: url.searchParams.get('purpose'), contentType: 'image/jpeg', sizeBytes: 1000, originalName: 'x.jpg', createdAt: new Date().toISOString(), duplicate: false }
      this.files.push(f)
      return ok(201, f)
    }
    if (/^\/files\/[^/]+\/link$/.test(p)) {
      // A video plays from its own (fake R2) link; photos show the same little image
      const video = p.split('/')[2].startsWith('fv')
      return ok(200, { url: video ? `${API}/video.mp4` : `${API}/blob.png`, expiresAt: minutesFromNow(5) })
    }

    // ---------- the salon: every call needs a salon ----------
    if (p.startsWith('/salon')) {
      if (!this.shop) return fail(404, 'NO_SHOP', 'You have no shop yet.')
      if (this.shop.type !== 'SALON') return fail(409, 'NOT_A_SALON', 'This is only for salons.')
    }
    const owner = this.role === 'OWNER'
    const ownerOrHelper = owner || this.role === 'HELPER'
    const ownerOnly = () => fail(403, 'OWNER_ONLY', 'Only the salon owner can change this.')
    const notAllowed = () => fail(403, 'NOT_ALLOWED', "You can't do this.")

    if (p === '/salon/services' && method === 'GET') return ok(200, this.services)
    if (p === '/salon/service-catalog' && method === 'GET') return ok(200, CATALOG)
    if (p === '/salon/services/batch' && method === 'POST') {
      if (!owner) return ownerOnly()
      // SalonSetupService.addServices: each checked (TextCleaner), a name twice in the list (400), the limit, then a
      // name an active service has (409, on save); new ones go after the salon's, in the order sent
      const list = (body.services as Json[]).map((s) => ({ ...s, name: (s.name as string).trim().replace(/\s+/g, ' ') }))
      const key = (n: string) => n.toLowerCase()
      const seen = new Set<string>()
      for (const [i, s] of list.entries()) {
        if (((s.name as string).match(/[\p{L}\p{N}]/gu) ?? []).length < 2) {
          return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { [`services[${i}].name`]: 'must have at least 2 letters or digits' })
        }
        if (seen.has(key(s.name as string))) {
          return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { [`services[${i}].name`]: 'is in the list twice' })
        }
        seen.add(key(s.name as string))
      }
      if (this.services.filter((s) => s.active).length + list.length > 100) {
        return fail(409, 'TOO_MANY_SERVICES', 'A salon can have up to 100 active services. Switch off ones you no longer offer.')
      }
      if (list.some((s) => this.services.some((x) => x.active && key(x.name as string) === key(s.name as string)))) {
        return fail(409, 'SERVICE_NAME_TAKEN', 'There is already an active service with this name.')
      }
      const next = Math.max(-1, ...this.services.map((s) => s.sortOrder as number)) + 1
      const added = list.map((s, i) => ({ id: `v${++this.n}`, active: true, sortOrder: next + i, version: 0, priceIsFrom: false, returnAfterDays: 14, ...s }))
      this.services.push(...added)
      return ok(201, added)
    }
    if (p === '/salon/hours' && method === 'GET') return ok(200, { version: hoursVersion(this.hours), days: this.hours })
    if (p === '/salon/hours' && method === 'PUT') {
      if (!owner) return ownerOnly()
      if ((body.version ?? null) !== hoursVersion(this.hours)) return fail(409, 'HOURS_CHANGED', "Someone else saved the salon's hours. Reload and try again.")
      const days = body.days as Json[]
      if (!days.length) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { days: 'open at least one day' })
      const byDay = new Map(days.map((d) => [d.weekday as number, d]))
      // Barbers' hours must fit inside (SalonSetupService.setSalonHours)
      const fits = (h: Json) => {
        const d = byDay.get(h.weekday as number)
        return Boolean(d && (d.open as string) <= (h.start as string) && (h.end as string) <= (d.close as string))
      }
      // Working barbers only: a switched-off one is cut to fit when he is switched on
      const outside = this.staff.filter((s) => s.active && (s.hours as Json[]).some((h) => !fits(h)))
      if (outside.length && !body.trimStaffHours) {
        return fail(409, 'STAFF_HOURS_OUTSIDE', 'Some barbers work outside these hours. Change their hours first, or let the app cut them to fit.', {
          staff: outside.map((s) => ({ staffId: s.id, name: s.name })),
        })
      }
      // Cutting must not strand an upcoming booking (SalonSetupService.requireBookingsStillFit): all or nothing
      const strandedBy = (s: Json) =>
        this.appointments.filter((a) => {
          if (a.staffId !== s.id || a.kind === 'BLOCK' || a.status !== 'CONFIRMED' || Date.parse(a.startsAt as string) <= Date.now()) return false
          const local = new Date(Date.parse(a.startsAt as string) + IST)
          const weekday = ((local.getUTCDay() + 6) % 7) + 1
          const from = local.toISOString().slice(11, 16)
          const to = new Date(Date.parse(a.endsAt as string) + IST).toISOString().slice(11, 16)
          const d = byDay.get(weekday)
          return !d || from < (d.open as string) || (to > (d.close as string) && !(to === '00:00' && d.close === '24:00'))
        })
      const stranded = outside.flatMap(strandedBy)
      if (stranded.length) {
        return fail(409, 'BOOKINGS_IN_THE_WAY', "Some of his upcoming bookings wouldn't fit any more. Reassign or cancel them first.", {
          appointments: stranded.map((a) => ({ id: a.id, kind: a.kind, staffId: a.staffId, startsAt: a.startsAt, endsAt: a.endsAt })),
        })
      }
      for (const s of outside) {
        s.hours = (s.hours as Json[]).flatMap((h) => {
          const d = byDay.get(h.weekday as number)
          if (!d) return []
          const start = (h.start as string) > (d.open as string) ? h.start : d.open
          const end = (h.end as string) < (d.close as string) ? h.end : d.close
          return (end as string) > (start as string) ? [{ weekday: h.weekday, start, end }] : []
        })
        s.version = (s.version as number) + 1
      }
      this.hours = [...days].sort((a, b) => (a.weekday as number) - (b.weekday as number))
      return ok(200, { version: hoursVersion(this.hours), days: this.hours })
    }
    // ---- Offers (SalonOfferService) ----
    if (p === '/salon/offers/current' && method === 'GET') {
      // Anyone in the salon: running and to come, without the owner's numbers
      // SalonOfferStore.current: soonest first, then the bigger discount
      const v = (o: Json) => o.offer as Json
      const current = this.offers.filter((o) => offerState(o) !== 'ENDED').sort((a, b) =>
        (v(a).startsOn as string).localeCompare(v(b).startsOn as string) || (v(b).percentOff as number) - (v(a).percentOff as number))
      return ok(200, current.map((o) => ({ offer: o.offer, state: offerState(o) })))
    }
    if (p === '/salon/offers' && method === 'GET') {
      if (!ownerOrHelper) return notAllowed()
      return ok(200, this.offers.map((o) => ({ ...o, state: offerState(o) })))
    }
    if ((p === '/salon/offers' || p === '/salon/offers/preview') && method === 'POST') {
      if (!owner) return ownerOnly()
      const checked = this.checkOffer(body)
      if ('err' in checked) return fail(...checked.err)
      if (p === '/salon/offers/preview') return ok(200, { services: checked.priced, customers: this.offerCustomers })
      const offer = {
        offer: { id: `of${++this.n}`, percentOff: body.percentOff, allServices: checked.all, serviceIds: checked.all ? [] : [...body.serviceIds].sort(), startsOn: body.startsOn, endsOn: body.endsOn, from: body.from ?? null, until: body.until ?? null },
        createdAt: new Date().toISOString(),
        endedAt: null,
        notified: this.offerCustomers,
        bookings: 0,
      }
      this.offers.unshift(offer)
      return ok(201, { ...offer, state: offerState(offer) })
    }
    const offerEnd = p.match(/^\/salon\/offers\/([^/]+)\/end$/)
    if (offerEnd && method === 'POST') {
      if (!owner) return ownerOnly()
      const o = this.offers.find((x) => (x.offer as Json).id === offerEnd[1])
      if (!o) return fail(404, 'OFFER_NOT_FOUND', 'No such offer.')
      if (offerState(o) === 'ENDED') return fail(409, 'OFFER_OVER', 'This offer has already ended.')
      o.endedAt = new Date().toISOString()
      return ok(200, { ...o, state: offerState(o) })
    }
    if (p === '/salon/ratings' && method === 'GET') {
      if (!ownerOrHelper) return notAllowed()
      const afterAt = url.searchParams.get('afterAt')
      const start = afterAt ? this.ratings.findIndex((r) => r.bookingId === url.searchParams.get('afterId')) + 1 : 0
      const items = this.ratings.slice(start, start + 30)
      const last = items.at(-1)
      return ok(200, {
        summary: afterAt ? null : this.ratingSummary,
        items,
        next: items.length === 30 && last ? { afterAt: last.ratedAt, afterId: last.bookingId } : null,
      })
    }
    if (p === '/salon/services' && method === 'POST') {
      if (!owner) return ownerOnly()
      if (this.services.some((s) => s.active && s.name === body.name)) return fail(409, 'SERVICE_NAME_TAKEN', 'You already have a service with this name.')
      const s = { id: `v${++this.n}`, active: true, sortOrder: 0, version: 0, priceIsFrom: false, returnAfterDays: 14, ...body }
      this.services.push(s)
      return ok(201, s)
    }
    const svc = p.match(/^\/salon\/services\/([^/]+)$/)
    if (svc) {
      if (!owner) return ownerOnly()
      const s = this.services.find((x) => x.id === svc[1])!
      if (body.version !== s.version) return fail(409, 'SERVICE_CHANGED', 'This service was changed meanwhile. Reload.')
      const { version: _v, ...change } = body
      Object.assign(s, change, { version: (s.version as number) + 1 })
      return ok(200, s)
    }
    // Barbers' sign-in phones are for the owner only (SalonSetupService)
    if (p === '/salon/staff' && method === 'GET') return ok(200, owner ? this.staff : this.staff.map((s) => ({ ...s, loginPhone: null, invitedPhone: null })))
    if (p === '/salon/staff/me' && method === 'POST') {
      // SalonSetupService.addOwnerAsBarber: linked to his own sign-in, every active service, the salon's hours
      if (!owner) return ownerOnly()
      if (this.staff.some((x) => x.loginPhone === this.user.phone)) return fail(409, 'ALREADY_A_BARBER', 'You are already one of the barbers.')
      if (this.noRoomForStaff()) return fail(409, 'TOO_MANY_STAFF', 'A salon can have up to 50 active barbers. Switch off ones who have left.')
      const s = {
        id: `st${++this.n}`, name: this.user.name ?? 'Owner', active: true,
        serviceIds: this.services.filter((v) => v.active).map((v) => v.id),
        hours: this.hours.map((d) => ({ weekday: d.weekday, start: d.open, end: d.close })),
        loginPhone: this.user.phone, invitedPhone: null, photoFileId: null, version: 0,
      }
      this.staff.push(s)
      this.joinClosures(s)
      return ok(201, s)
    }
    if (p === '/salon/staff' && method === 'POST') {
      if (!owner) return ownerOnly()
      if (this.noRoomForStaff()) return fail(409, 'TOO_MANY_STAFF', 'A salon can have up to 50 active barbers. Switch off ones who have left.')
      const s = { id: `st${++this.n}`, name: body.name, active: true, serviceIds: [], hours: [], loginPhone: null, photoFileId: null, version: 0 }
      this.staff.push(s)
      this.joinClosures(s)
      return ok(201, s)
    }
    const st = p.match(/^\/salon\/staff\/([^/]+)(\/login|\/photo|\/services|\/hours)?$/)
    if (st && !p.includes('/blocks')) {
      if (!owner) return ownerOnly()
      const s = this.staff.find((x) => x.id === st[1])
      if (!s) return fail(404, 'STAFF_NOT_FOUND', 'No such barber.')
      if (!st[2] && method === 'DELETE') {
        // SalonSetupService.removeStaff: not while he has upcoming bookings; then out of the list for good
        // AppointmentStore.upcomingForStaff: a booking or walk-in still to come or still running
        if (this.appointments.some((a) => a.staffId === s.id && (a.status === 'CONFIRMED' || a.status === 'IN_SERVICE') && Date.parse(a.endsAt as string) > Date.now())) {
          return fail(409, 'STAFF_HAS_BOOKINGS', 'This barber still has upcoming bookings or walk-ins. Reassign or cancel them first.')
        }
        this.staff = this.staff.filter((x) => x !== s)
        this.shopInvites = this.shopInvites.filter((v) => v.staffId !== s.id)
        return ok(204, null)
      }
      const bump = () => Object.assign(s, { version: (s.version as number) + 1 })
      if (st[2] === '/login') {
        // A sign-in is an invitation now (SalonSetupService.linkLogin): loginPhone stays null until he accepts
        if (method === 'DELETE') {
          // SalonSetupService.unlink: the owner's own profile keeps his sign-in
          if (s.loginPhone === this.user.phone) return fail(409, 'OWNER_PROFILE', 'This is your own barber profile. Switch it off or remove it instead.')
          s.loginPhone = null
          s.invitedPhone = null
          this.shopInvites = this.shopInvites.filter((v) => v.staffId !== s.id)
          return ok(200, bump())
        }
        const phone = normalizeMockPhone(body?.phone)
        if (!phone) return fail(400, 'INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number')
        if (phone === this.user.phone) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { phone: 'is your own number' })
        if (this.members.some((m) => m.phone === phone)) return fail(409, 'ALREADY_A_MEMBER', 'This number already works in your shop.')
        if (this.shopInvites.some((v) => v.phone === phone && v.staffId !== s.id)) {
          return fail(409, 'INVITE_PENDING', 'This number already has an invitation to your shop waiting. Cancel it first.')
        }
        this.shopInvites = this.shopInvites.filter((v) => v.staffId !== s.id)
        this.shopInvites.push({ id: `i${++this.n}`, phone, role: 'BARBER', staffId: s.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() })
        s.invitedPhone = phone
        return ok(200, bump())
      }
      if (st[2] === '/photo') {
        s.photoFileId = body.fileId
        return ok(200, bump())
      }
      if (body.version !== s.version) return fail(409, 'STAFF_CHANGED', 'This barber was changed meanwhile. Reload.')
      // A barber's hours must lie inside the salon's (SalonSetupService.requireInsideSalonHours)
      if (st[2] === '/hours' && this.hours.length) {
        for (const h of body.hours as Json[]) {
          const d = this.hours.find((x) => x.weekday === h.weekday)
          if (!d || (h.start as string) < (d.open as string) || (h.end as string) > (d.close as string)) {
            return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { hours: d ? "is outside the salon's hours" : 'the salon is closed that day' })
          }
        }
      }
      // New hours or services must not strand his upcoming bookings (SalonSetupService.requireBookingsStillFit)
      if (st[2] === '/services' || st[2] === '/hours') {
        const stranded = this.appointments.filter((a) => {
          if (a.staffId !== s.id || a.kind === 'BLOCK' || a.status !== 'CONFIRMED' || new Date(a.startsAt as string).getTime() <= Date.now()) return false
          if (st[2] === '/services') return (a.services as Json[]).some((v) => !(body.serviceIds as string[]).includes(v.serviceId as string))
          const local = new Date(new Date(a.startsAt as string).getTime() + IST)
          const weekday = ((local.getUTCDay() + 6) % 7) + 1
          const from = local.toISOString().slice(11, 16)
          const to = new Date(new Date(a.endsAt as string).getTime() + IST).toISOString().slice(11, 16)
          return !(body.hours as Json[]).some((h) => h.weekday === weekday && (h.start as string) <= from && (to <= (h.end as string) || to === '00:00'))
        })
        if (stranded.length) {
          return fail(409, 'BOOKINGS_IN_THE_WAY', "Some of his upcoming bookings wouldn't fit any more. Reassign or cancel them first.", {
            appointments: stranded.map((a) => ({ id: a.id, kind: a.kind, staffId: a.staffId, startsAt: a.startsAt, endsAt: a.endsAt })),
          })
        }
      }
      if (st[2] === '/services') s.serviceIds = body.serviceIds
      else if (st[2] === '/hours') s.hours = body.hours
      else {
        if (body.active === false && this.appointments.some((a) => a.staffId === s.id && a.status === 'CONFIRMED')) {
          return fail(409, 'STAFF_HAS_BOOKINGS', 'He has bookings coming up. Move or cancel them first.')
        }
        if (body.active === true && !s.active && this.noRoomForStaff()) return fail(409, 'TOO_MANY_STAFF', 'A salon can have up to 50 active barbers. Switch off ones who have left.')
        if (body.name !== undefined) s.name = body.name
        // Switched off, a barber's sign-in, membership and waiting invitation go (not the owner's own:
        // SalonSetupService.unlink)
        if (body.active === false && s.active && s.loginPhone !== this.user.phone) {
          const phone = s.loginPhone
          if (phone) this.members = this.members.filter((m) => m.phone !== phone)
          s.loginPhone = null
          s.invitedPhone = null
          this.shopInvites = this.shopInvites.filter((v) => v.staffId !== s.id)
        }
        const switchedOn = body.active === true && !s.active
        if (body.active === true && !s.active && this.hours.length) {
          // Switched back on: his hours are cut to the salon's (SalonSetupService.fitToSalonHours)
          s.hours = (s.hours as Json[]).flatMap((h) => {
            const d = this.hours.find((x) => x.weekday === h.weekday)
            if (!d) return []
            const start = (h.start as string) > (d.open as string) ? h.start : d.open
            const end = (h.end as string) < (d.close as string) ? h.end : d.close
            return (end as string) > (start as string) ? [{ weekday: h.weekday, start, end }] : []
          })
        }
        if (body.active !== undefined) s.active = body.active
        if (switchedOn) this.joinClosures(s)
      }
      return ok(200, bump())
    }
    if (p === '/salon/settings' && method === 'GET') return ok(200, this.settings)
    if (p === '/salon/settings') {
      if (!owner) return ownerOnly()
      if (body.version !== this.settings.version) return fail(409, 'SETTINGS_CHANGED', 'The settings were changed meanwhile. Reload.')
      this.settings = { ...this.settings, ...body, version: ((this.settings.version as number | null) ?? -1) + 1, updatedAt: new Date().toISOString() }
      return ok(200, this.settings)
    }

    if (p === '/salon/day') {
      if (this.dayDown > 0) {
        this.dayDown--
        // With Retry-After when a test sets it, as GlobalExceptionHandler sends it (5)
        return ok(503, { code: 'SERVICE_BUSY', message: "We're having a short problem. Try again in a few seconds.", details: {} },
          this.busyRetryAfter ? { 'Retry-After': String(this.busyRetryAfter) } : {})
      }
      const date = url.searchParams.get('date') ?? todayIst()
      const from = new Date(istInstant(date, '00:00')).getTime()
      const to = from + 86400_000
      const onDay = (a: Json) => a.status !== 'REMOVED' && Date.parse(a.startsAt as string) < to && Date.parse(a.endsAt as string) > from
      // Active barbers, plus switched-off ones who had something that day (as the backend does); each column by
      // start, then id (AppointmentStore.forDay)
      const byStart = (x: Json, y: Json) => micros(x.startsAt as string) - micros(y.startsAt as string) || ((x.id as string) < (y.id as string) ? -1 : 1)
      const barbers = this.staff
        .filter((s) => s.active || this.appointments.some((a) => a.staffId === s.id && onDay(a)))
        .filter((s) => this.seesAll() || s.id === this.myStaffId)
        .map((s) => ({
          staffId: s.id,
          name: s.name,
          hours: [{ start: '10:00', end: '20:00' }],
          appointments: this.appointments.filter((a) => a.staffId === s.id && onDay(a)).sort(byStart).map((a) => this.view(a)),
        }))
      const setupVersion = this.setupVersion()
      const board = new Map<string, string>()
      barbers.forEach((c) => (c.appointments as Json[]).forEach((a) => board.set(a.id as string, JSON.stringify(a))))
      const seq = `q${++this.seqN}-${date}`
      // The cursor carries its date, the setup, who asked and what that answer showed (the real one: transaction
      // numbers and the time; the outcome is the same: what changed on this board since)
      const cursor = { date, setupVersion, who: this.who(), board }
      this.daySeqs.set(seq, cursor)
      const since = url.searchParams.get('since')
      if (since !== null) {
        const before = this.daySeqs.get(since)
        // SalonDayService.deltaPossible: a cursor not ours (or older than an hour: forgotten), another date, the setup
        // changed, or someone else asking: the whole day, full: true. No ETag of ours on these answers.
        if (before && before.date === date && before.setupVersion === setupVersion && before.who === cursor.who && !this.wholeDayNext) {
          const changed = barbers
            .flatMap((c) => c.appointments as Json[])
            .filter((a) => before.board.get(a.id as string) !== JSON.stringify(a))
          const removed = [...before.board.keys()].filter((id) => !board.has(id))
          this.deltas.push({ since, changed: changed.map((a) => a.id as string), removed })
          return ok(200, { date, barbers: null, myStaffId: this.myStaffId, full: false, seq, setupVersion, changed, removed })
        }
        this.wholeDayNext = false
        this.deltas.push({ since, full: true })
        return ok(200, { date, barbers, myStaffId: this.myStaffId, full: true, seq, setupVersion, changed: null, removed: null })
      }
      const view = { date, barbers, myStaffId: this.myStaffId, full: true, seq, setupVersion, changed: null, removed: null }
      // The tag is about the board, not the seq (the same board answers 304 while nothing changed)
      return ok(200, view, {}, this.salonTag(`day ${url.searchParams.get('date') ?? ''}`, { date, barbers, myStaffId: this.myStaffId }))
    }
    if (p === '/salon/upcoming' && url.searchParams.has('since')) {
      // SalonDayService.upcomingChanges: the whole list (all its pages) as this caller sees it, compared with what the
      // list looked like when that seq was given out
      const until = Date.parse(istInstant(addDays(todayIst(), 32), '00:00'))
      const now = new Map<string, string>()
      this.appointments
        .filter((a) => a.kind !== 'BLOCK' && a.status === 'CONFIRMED')
        .filter((a) => Date.parse(a.endsAt as string) > Date.now() && Date.parse(a.startsAt as string) < until)
        .filter((a) => this.seesAll() || a.staffId === this.myStaffId)
        .sort((x, y) => micros(x.startsAt as string) - micros(y.startsAt as string) || ((x.id as string) < (y.id as string) ? -1 : 1))
        .forEach((a) => now.set(a.id as string, JSON.stringify(this.view(a))))
      const setupVersion = this.setupVersion()
      const seq = `u${++this.seqN}-${todayIst()}`
      const cursor = { date: todayIst(), setupVersion, who: this.who(), board: now }
      this.daySeqs.set(seq, cursor)
      const before = this.daySeqs.get(url.searchParams.get('since')!)
      // Not ours ("start"), another India day, the setup changed, someone else: full (load the pages again)
      if (!before || before.date !== cursor.date || before.setupVersion !== setupVersion || before.who !== cursor.who || this.wholeUpcomingNext) {
        this.wholeUpcomingNext = false
        this.upcomingDeltas.push({ since: url.searchParams.get('since')!, full: true })
        return ok(200, { full: true, seq, setupVersion, changed: null, removed: null })
      }
      const changed = [...now.entries()].filter(([id, json]) => before.board.get(id) !== json).map(([, json]) => JSON.parse(json))
      const removed = [...before.board.keys()].filter((id) => !now.has(id))
      this.upcomingDeltas.push({ since: url.searchParams.get('since')!, changed: changed.map((a: Json) => a.id as string), removed })
      return ok(200, { full: false, seq, setupVersion, changed, removed })
    }
    if (p === '/salon/upcoming' && this.failUpcomingPages > 0) {
      this.failUpcomingPages--
      return fail(500, 'INTERNAL_ERROR', 'Something went wrong on our side.')
    }
    if (p === '/salon/upcoming' || p === '/salon/history') {
      // The page asked for (AppointmentCursor.of): Spring reads both values first (one it can't read is 400
      // BAD_REQUEST, as GlobalExceptionHandler.handleTypeMismatch; an empty one counts as not sent), then one
      // without the other is 400 VALIDATION_FAILED naming afterId
      const afterStart = url.searchParams.get('afterStart') || null
      const afterId = url.searchParams.get('afterId') || null
      const unreadable = (value: string, name: string) => fail(400, 'BAD_REQUEST', `'${value}' is not a valid value for '${name}'`)
      if (afterStart !== null && (!INSTANT.test(afterStart) || Number.isNaN(Date.parse(afterStart)))) return unreadable(afterStart, 'afterStart')
      if (afterId !== null && !APPOINTMENT_ID.test(afterId)) return unreadable(afterId, 'afterId')
      if ((afterStart === null) !== (afterId === null)) {
        return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { afterId: 'send afterStart and afterId together' })
      }
      const history = p === '/salon/history'
      if (history && !ownerOrHelper) return notAllowed()
      if (afterId !== null && this.failPages > 0) {
        this.failPages -= 1
        return fail(500, 'INTERNAL_ERROR', 'Something went wrong on our side.')
      }
      const cmpId = (x: Json, y: Json) => ((x.id as string) < (y.id as string) ? -1 : (x.id as string) > (y.id as string) ? 1 : 0)
      const at = (a: Json) => micros(a.startsAt as string)
      const after = afterStart === null ? null : micros(afterStart)
      if (!history) {
        // CONFIRMED and not over yet (running late included), starting before the end of the 31st day from today;
        // startsAt then id ascending; 100 a page
        const until = Date.parse(istInstant(addDays(todayIst(), 32), '00:00'))
        const page = this.appointments
          .filter((a) => a.kind !== 'BLOCK' && a.status === 'CONFIRMED')
          .filter((a) => Date.parse(a.endsAt as string) > Date.now() && Date.parse(a.startsAt as string) < until)
          .filter((a) => this.seesAll() || a.staffId === this.myStaffId)
          .sort((x, y) => at(x) - at(y) || cmpId(x, y))
          .filter((a) => after === null || at(a) > after || (at(a) === after && (a.id as string) > afterId!))
          .slice(0, PAGE)
          .map((a) => this.view(a))
        return ok(200, page, {}, this.salonTag(`upcoming ${afterStart ?? ''}/${afterId ?? ''}`, page))
      }
      // History: bookings and walk-ins on the India dates from..to, startsAt descending then id ascending, 100 a
      // page with `next`; the counts and the completed amount over the whole range on every page
      const from = url.searchParams.get('from')!
      const to = url.searchParams.get('to')!
      const start = Date.parse(istInstant(from, '00:00'))
      const end = Date.parse(istInstant(addDays(to, 1), '00:00'))
      const inRange = this.appointments.filter(
        (a) => a.kind !== 'BLOCK' && Date.parse(a.startsAt as string) >= start && Date.parse(a.startsAt as string) < end,
      )
      const counts: Record<string, number> = {}
      inRange.forEach((a) => (counts[a.status as string] = (counts[a.status as string] ?? 0) + 1))
      const completedPaise = inRange
        .filter((a) => a.status === 'COMPLETED')
        .reduce((t, a) => t + (a.services as Json[]).reduce((u, sv) => u + (sv.pricePaise as number), 0), 0)
      const rest = inRange
        .sort((x, y) => at(y) - at(x) || cmpId(x, y))
        .filter((a) => after === null || at(a) < after || (at(a) === after && (a.id as string) > afterId!))
      const shown = rest.slice(0, PAGE)
      const last = shown[shown.length - 1]
      const next = rest.length > PAGE ? { afterStart: last.startsAt, afterId: last.id } : null
      // The totals on the first page only (null on later pages)
      const first = afterId === null
      return ok(200, { from, to, counts: first ? counts : null, completedPaise: first ? completedPaise : null, appointments: shown.map((a) => this.view(a)), truncated: next !== null, next })
    }

    const act = p.match(/^\/salon\/appointments\/([^/]+)\/(start|finish|no-show|undo-no-show|reassign|cancel)$/)
    if (act) {
      const a = this.appointments.find((x) => x.id === act[1])
      if (!a || a.kind === 'BLOCK') return fail(404, 'NOT_FOUND', 'No such appointment.')
      const changed = () => fail(409, 'WRONG_STATUS', `It is ${a.status} now. Reload.`, { reason: 'CHANGED', status: a.status })
      const start = new Date(a.startsAt as string).getTime()
      const length = new Date(a.endsAt as string).getTime() - start
      const inChairWalkIn = a.kind === 'WALK_IN' && a.status === 'IN_SERVICE'
      // SalonAccess.actsFor: a barber acts on his own column only; a walk-in he added and still in the chair he may
      // fix or finish (lockedForOwnOrAdded) while he still has walk-in access; one taken from him answers REASSIGNED
      const actsFor = ownerOrHelper || a.staffId === this.myStaffId
      const fixing = act[2] === 'reassign' || act[2] === 'cancel' || act[2] === 'finish'
      const creatorFix = fixing && inChairWalkIn && a.createdBy === this.user.id && this.walkIns
      if (!actsFor && !creatorFix) {
        if (a.reassignedFrom === this.myStaffId) return fail(409, 'WRONG_STATUS', 'It was given to another barber. Reload.', { reason: 'REASSIGNED' })
        return fail(404, 'NOT_FOUND', 'No such appointment.')
      }
      if (act[2] === 'start') {
        if (a.status !== 'CONFIRMED') return changed()
        if (Date.now() < start - 15 * 60_000) return fail(409, 'WRONG_STATUS', 'Too early: Start is allowed from 15 minutes before.', { reason: 'TOO_EARLY', startFrom: new Date(start - 15 * 60_000).toISOString() })
        if (Date.now() >= start + 10 * 60_000) return fail(409, 'WRONG_STATUS', 'It was held until the start plus 10 minutes and is a no-show now. Add the customer as a walk-in.', { reason: 'HELD_OVER', heldUntil: new Date(start + 10 * 60_000).toISOString() })
        if (a.kind === 'BOOKING') {
          if (body?.withoutCode) {
            if (!ownerOrHelper) return fail(403, 'NOT_ALLOWED', "Only the owner or a helper can start without the customer's code.")
          } else {
            // StartCodes: 5 wrong tries lock the code (429 START_CODE_LOCKED, even for the right one)
            const wrong = (a.wrongTries as number | undefined) ?? 0
            if (wrong >= 5) return fail(429, 'START_CODE_LOCKED', 'Too many wrong codes. Start it without the code if the customer is here.')
            if (body?.code !== a.code) {
              a.wrongTries = wrong + 1
              if (wrong + 1 >= 5) return fail(429, 'START_CODE_LOCKED', 'Too many wrong codes. Start it without the code if the customer is here.')
              return fail(400, 'WRONG_START_CODE', "That code doesn't match.", { triesLeft: 5 - wrong - 1 })
            }
          }
        }
        // Started early: the barber is busy from now for its length (refused if his chair is still taken)
        const minute = Date.now() - (Date.now() % 60_000)
        if (minute < start) {
          const from = minute
          const clash = this.holdsBetween(a.staffId, from, start, a).length > 0
          if (clash) return fail(409, 'BARBER_BUSY', 'The barber is busy (another customer or a break) until the booking’s time. Start this then, or finish the one before first.', { reason: 'STILL_BUSY', startAt: a.startsAt })
          Object.assign(a, { startsAt: new Date(from).toISOString(), endsAt: new Date(from + length).toISOString() })
        } else if (minute > start && this.holdsBetween(a.staffId, start, minute + length, a).length === 0) {
          // Started late: the full length from now when he is free for it
          a.endsAt = new Date(minute + length).toISOString()
        }
        Object.assign(a, { status: 'IN_SERVICE', startedAt: new Date().toISOString(), startedWithCode: a.kind === 'BOOKING' ? !body?.withoutCode : null })
        return ok(200, this.view(a))
      }
      if (act[2] === 'finish') {
        if (a.status !== 'IN_SERVICE') return changed()
        // Never past its planned end (the automatic end completes it there)
        const end = Math.min(Math.max(Date.now(), start + 60_000), Date.parse(a.endsAt as string))
        Object.assign(a, { status: 'COMPLETED', endsAt: new Date(end).toISOString() })
        return ok(200, this.view(a))
      }
      if (act[2] === 'no-show') {
        if (a.status !== 'CONFIRMED') return changed()
        if (Date.now() < start + 10 * 60_000) return fail(409, 'WRONG_STATUS', 'The customer may still come: No-show is allowed later.', { reason: 'TOO_EARLY', noShowFrom: new Date(start + 10 * 60_000).toISOString() })
        a.status = 'NO_SHOW'
        return ok(200, this.view(a))
      }
      if (!ownerOrHelper && !creatorFix) return notAllowed()
      if (act[2] === 'undo-no-show') {
        if (a.status !== 'NO_SHOW') return changed()
        if (Date.now() > start + 24 * 3600_000) return fail(409, 'WRONG_STATUS', 'Too late to undo here (more than 24 hours). Apni Dukan support can still remove the customer\'s strike.', { reason: 'TOO_LATE' })
        // The backend closes it as cancelled by the salon (the strike goes); it never waits again
        Object.assign(a, { status: 'CANCELLED_BY_SALON', cancelReason: 'No-show undone' })
        return ok(200, this.view(a))
      }
      if (act[2] === 'reassign') {
        if (a.status !== 'CONFIRMED' && !inChairWalkIn) return changed()
        const target = this.staff.find((s) => s.id === body.staffId)
        if (!target || !target.active) return fail(404, 'STAFF_NOT_FOUND', 'No such barber.')
        const needs = (a.services as { serviceId: string }[]).map((s) => s.serviceId)
        if (!needs.every((id) => (target.serviceIds as string[]).includes(id))) {
          return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { staffId: "this barber doesn't do all of its services" })
        }
        let from = start
        let to = Date.parse(a.endsAt as string)
        if (inChairWalkIn) {
          // The rest of the visit, with him, from now (at least 5 minutes); started_at stays
          from = Date.now() - (Date.now() % 60_000)
          to = from + Math.max(to - from, 5 * 60_000)
        }
        if (this.holdsBetween(target.id, from, to, a).length) return fail(409, 'BARBER_BUSY', `${target.name} is busy at that time.`)
        a.reassignedFrom = a.staffId
        a.staffId = body.staffId
        Object.assign(a, { startsAt: new Date(from).toISOString(), endsAt: new Date(to).toISOString() })
        return ok(200, this.view(a))
      }
      if (a.status !== 'CONFIRMED' && !inChairWalkIn) return changed()
      if (inChairWalkIn && Date.now() > Date.parse((a.startedAt as string | null) ?? (a.startsAt as string)) + 15 * 60_000) return fail(409, 'WRONG_STATUS', 'It has been in the chair for more than 15 minutes. Finish it instead.', { reason: 'IN_CHAIR_TOO_LONG' })
      Object.assign(a, { status: 'CANCELLED_BY_SALON', cancelReason: body.reason })
      return ok(200, this.view(a))
    }

    if (p === '/salon/walk-ins/options') {
      if (!this.walkIns) return fail(403, 'WALK_INS_NOT_ALLOWED', 'The owner hasn’t allowed you to add walk-ins.')
      const ids = url.searchParams.getAll('services')
      const able = this.staff.filter((s) => s.active && ids.every((i) => (s.serviceIds as string[]).includes(i)))
      if (!able.length) return fail(409, 'NO_BARBER_FOR_SERVICES', 'No barber here does all of these services together. Try booking them separately.')
      return ok(
        200,
        able
          .map((s, i) => ({ staffId: s.id, name: s.name, freeNow: i === 0, startAt: i === 0 ? null : minutesFromNow(40), time: i === 0 ? null : '16:30', bookedMinutesToday: 0 })),
      )
    }
    if (p === '/salon/walk-ins') {
      if (!this.walkIns) return fail(403, 'WALK_INS_NOT_ALLOWED', 'The owner hasn’t allowed you to add walk-ins.')
      const key = req.headers()['idempotency-key']
      if (!key) return fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key.')
      const earlier = this.appointments.find((a) => a.key === key)
      if (earlier) return ok(201, this.view(earlier))
      if (body.name !== null && (body.name.trim().length < 2 || body.name.length > 60)) {
        return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { name: 'must be 2 to 60 letters' })
      }
      const a = this.addBooking({ kind: 'WALK_IN', staffId: body.staffId, serviceIds: body.serviceIds, startsAt: minutesFromNow(0), status: 'IN_SERVICE', customerName: null, customerPhone: null, bookingNo: null, guestName: body.name, key, createdBy: this.user.id, startedAt: minutesFromNow(0) })
      return ok(201, this.view(a))
    }

    const blocks = p.match(/^\/salon\/staff\/([^/]+)\/blocks(\/conflicts|\/[^/]+)?$/)
    if (blocks) {
      const staffId = blocks[1]
      if (this.role === 'BARBER' && staffId !== this.myStaffId) return fail(404, 'STAFF_NOT_FOUND', 'No such barber.')
      const inTheWay = (from: number, to: number) => this.holdsBetween(staffId, from, to)
      if (blocks[2] === '/conflicts') {
        return ok(200, inTheWay(Date.parse(url.searchParams.get('from')!), Date.parse(url.searchParams.get('to')!)).map((a) => this.view(a)))
      }
      if (method === 'POST') {
        if (body.type === 'LEAVE' && !owner) return fail(403, 'OWNER_ONLY', 'Only the salon owner can add leave.')
        const want = (Date.parse(body.endAt) - Date.parse(body.startAt)) / 60_000
        if (Date.parse(body.endAt) <= Date.now()) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { endAt: 'is in the past' })
        if (!ownerOrHelper && want > 240) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { endAt: 'is too far from the start (at most 4 hours)' })
        if (!ownerOrHelper) {
          // A barber's own breaks: today or tomorrow, at most 4 hours a day in all (India days, clipped)
          const dayAfterTomorrow = new Date(istInstant(addDays(todayIst(), 2), '00:00')).getTime()
          if (Date.parse(body.startAt) >= dayAfterTomorrow) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { startAt: 'must be today or tomorrow for your own break; ask the owner for time off further ahead' })
          const day = new Date(Date.parse(body.startAt) + IST).toISOString().slice(0, 10)
          const dayFrom = Date.parse(istInstant(day, '00:00'))
          const dayTo = dayFrom + 86400_000
          const used = this.appointments
            .filter((x) => x.kind === 'BLOCK' && x.blockType === 'BREAK' && x.status === 'BLOCKED' && x.staffId === staffId && x.createdBy === this.user.id)
            .reduce((t, x) => t + Math.max(0, Math.min(Date.parse(x.endsAt as string), dayTo) - Math.max(Date.parse(x.startsAt as string), dayFrom)) / 60_000, 0)
          if (used + want > 240) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { endAt: `is past your 4 hours of breaks for that day (${used} minutes used); ask the owner for longer` })
        }
        const hit = inTheWay(Date.parse(body.startAt), Date.parse(body.endAt))
        if (hit.length) return fail(409, 'BLOCK_CONFLICTS', 'Some appointments are in the way. Reassign or cancel them first.', { appointments: hit.map((a) => ({ id: a.id, kind: a.kind, staffId: a.staffId, startsAt: a.startsAt, endsAt: a.endsAt })) })
        const b = { id: `b${++this.n}`, kind: 'BLOCK', blockType: body.type, staffId, status: 'BLOCKED', startsAt: body.startAt, endsAt: body.endAt, services: [], startedAt: null, startedWithCode: null, bookingNo: null, customerName: null, guestName: null, cancelReason: null, closureId: null, createdBy: this.user.id }
        this.appointments.push(b)
        return ok(201, this.view(b))
      }
      const b = this.appointments.find((a) => a.id === blocks[2]!.slice(1))
      if (!b) return fail(404, 'NOT_FOUND', 'No such appointment.')
      if (b.blockType === 'LEAVE' && !owner) return fail(403, 'OWNER_ONLY', 'Only the salon owner can remove leave.')
      if (!ownerOrHelper && b.createdBy !== this.user.id) return fail(403, 'NOT_ALLOWED', 'The owner or a helper added this break; ask them to remove it.')
      if (b.status !== 'BLOCKED') return fail(409, 'WRONG_STATUS', 'It was already removed.')
      if (!ownerOrHelper && Date.now() >= Date.parse(b.startsAt as string)) return fail(409, 'WRONG_STATUS', 'This break has started; it stays. Ask the owner if it was a mistake.', { reason: 'STARTED' })
      b.status = 'REMOVED'
      return ok(204)
    }

    if (p === '/salon/closures' && method === 'GET') return ok(200, this.closures)
    if (p === '/salon/closures' && method === 'POST') {
      if (!owner) return ownerOnly()
      const from = new Date(istInstant(body.date, '00:00')).getTime()
      // SalonDayService.addClosure: the salon's own closed day (checked first), even with no barber yet; a CLOSED
      // block for each working barber
      if (this.closures.some((x) => x.date === body.date)) return fail(409, 'ALREADY_CLOSED', 'The salon is already closed that day.')
      const working = this.staff.filter((st) => st.active)
      const hit = working.flatMap((st) => this.holdsBetween(st.id, from, from + 86400_000))
      if (hit.length) return fail(409, 'BLOCK_CONFLICTS', 'Some appointments are in the way. Reassign or cancel them first.', { appointments: hit.map((a) => ({ id: a.id, kind: a.kind, staffId: a.staffId, startsAt: a.startsAt, endsAt: a.endsAt })) })
      const c = { closureId: `c${++this.n}`, date: body.date, barbers: 0 }
      this.closures.push(c)
      for (const st of working) this.closedBlock(c, st)
      return ok(201, c)
    }
    const closure = p.match(/^\/salon\/closures\/([^/]+)$/)
    if (closure) {
      if (!owner) return ownerOnly()
      if (!this.closures.some((c) => c.closureId === closure[1])) return fail(404, 'NOT_FOUND', 'No such appointment.')
      this.closures = this.closures.filter((c) => c.closureId !== closure[1])
      for (const a of this.appointments) if (a.closureId === closure[1] && a.status === 'BLOCKED') a.status = 'REMOVED'
      return ok(204)
    }

    if (p === '/salon/pause' && method === 'GET') return ok(200, { pausedUntil: this.pausedUntil })
    if (p === '/salon/pause') {
      if (!ownerOrHelper) return notAllowed()
      this.pausedUntil = body?.until ?? istInstant(addDays(todayIst(), 1), '00:00')
      return ok(200, { pausedUntil: this.pausedUntil })
    }
    if (p === '/salon/resume') {
      if (!ownerOrHelper) return notAllowed()
      this.pausedUntil = null
      return ok(200, { pausedUntil: null })
    }
    if (p === '/salon/members') return owner ? ok(200, this.members) : ownerOnly()
    const access = p.match(/^\/salon\/members\/([^/]+)\/walk-in-access$/)
    if (access) {
      if (!owner) return ownerOnly()
      const m = this.members.find((x) => x.userId === access[1])!
      m.walkInAccess = body.allowed
      return ok(200, this.members)
    }

    if (p === '/me/notifications') {
      // Newest first, 30 a page; `next` is an opaque cursor (here "c" and the index), anything else 400 BAD_CURSOR
      const cursor = url.searchParams.get('cursor')
      if (cursor !== null && !/^c\d+$/.test(cursor)) return fail(400, 'BAD_CURSOR', 'This list has changed. Open it again.')
      const from = cursor === null ? 0 : Number(cursor.slice(1))
      const items = this.inbox.slice(from, from + INBOX_PAGE)
      const next = from + INBOX_PAGE < this.inbox.length ? `c${from + INBOX_PAGE}` : null
      return ok(200, { items, unread: Math.min(100, this.inbox.filter((i) => !i.read).length), next }, {}, cursor === null ? this.inboxTag('list') : undefined)
    }
    if (p === '/me/notifications/unread-count') return ok(200, { unread: Math.min(100, this.inbox.filter((i) => !i.read).length) }, {}, this.inboxTag('count'))
    if (p === '/me/notifications/read') {
      const ids: string[] = body?.ids ?? []
      this.inbox.forEach((i) => {
        if (!ids.length || ids.includes(i.id as string)) i.read = true
      })
      return ok(204)
    }

    return fail(404, 'NOT_FOUND', `No mock for ${method} ${p}`)
  }

  /**
   * The backend's own tag of the day board and the upcoming list ("s1-…"): it changes with the salon's change
   * counter, who asks, what was asked and (here, as a stand-in for "until when time alone can't change it") the
   * answer itself.
   */
  /** The salon's setup counter: barbers, their hours and services, services, settings, who works there or may add walk-ins. */
  private setupVersion(): number {
    const now = JSON.stringify([this.staff, this.services, this.settings, this.members])
    if (this.setups[this.setups.length - 1] !== now) this.setups.push(now)
    return this.setups.length
  }

  private who(): string {
    return `${this.user.id} ${this.role} ${this.myStaffId ?? ''} ${this.walkIns}`
  }

  private salonTag(asked: string, answer: unknown): string {
    const who = `${this.user.id} ${this.role} ${this.myStaffId ?? ''} ${this.walkIns}`
    return `"s1-${createHash('md5').update(`${this.salonVersion} ${who} ${asked} ${JSON.stringify(answer)}`).digest('hex')}"`
  }

  private cors() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, If-None-Match',
      'Access-Control-Expose-Headers': 'Retry-After, ETag',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    }
  }
}
