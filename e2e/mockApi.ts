import { createHash } from 'node:crypto'
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
const IST = 5.5 * 3600_000
const P = '/api/v1'

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
}

type Json = Record<string, unknown>

export function todayIst(): string {
  return new Date(Date.now() + IST).toISOString().slice(0, 10)
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
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
  { id: 'v1', name: 'Haircut', durationMinutes: 30, pricePaise: 20000, priceIsFrom: false, active: true, sortOrder: 0, version: 0 },
  { id: 'v2', name: 'Beard trim', durationMinutes: 15, pricePaise: 10000, priceIsFrom: false, active: true, sortOrder: 1, version: 0 },
  { id: 'v3', name: 'Hair colour', durationMinutes: 60, pricePaise: 80000, priceIsFrom: true, active: true, sortOrder: 2, version: 0 },
]

const week = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '00:00', end: '23:45' }))

export class MockApi {
  user: MockUser = { id: 'u1', phone: '9848012345', name: null, email: null, emailVerified: false, admin: false }
  /** Paths (with the query) answered 304 Not Modified, in order. */
  notModified: string[] = []
  calls: Call[] = []
  /** The person's shop (null = 404 NO_SHOP). */
  shop: Json | null = null
  role: Role = 'OWNER'
  services: Json[] = SERVICES.map((s) => ({ ...s, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' }))
  staff: Json[] = [
    { id: 'st1', name: 'Ravi', active: true, serviceIds: ['v1', 'v2', 'v3'], hours: week, loginPhone: null, photoFileId: null, version: 0 },
    { id: 'st2', name: 'Imran', active: true, serviceIds: ['v1', 'v2'], hours: week, loginPhone: '9000000002', photoFileId: null, version: 0 },
  ]
  settings: Json = { minLeadMinutes: 30, maxDaysAhead: 14, version: null, updatedAt: null }
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
  /** Next answer of an action, by path suffix: a code + status, once. */
  failOnce = new Map<string, { status: number; code: string; message: string; details?: Json; retryAfter?: number }>()
  /** GET /salon/day answers 503 this many times. */
  dayDown = 0
  /** Every request fails as with no network. */
  offline = false
  /** GET /shops/me answers 503 this many times. */
  shopDown = 0
  /** Helpers added from the other side: "check again" finds a shop. */
  addedToShop: Json | null = null
  private n = 0
  private accessValid = new Set<string>()
  refreshTokens = new Map<string, 'live' | 'rotated'>()

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
      version: 3,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      ...over,
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

  async attach(context: BrowserContext) {
    await context.route(`${API}/**`, async (route) => {
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
      noShowFrom: a.kind === 'BLOCK' ? null : new Date(start + 15 * 60_000).toISOString(),
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

  private seesAll() {
    return this.role !== 'BARBER' || this.walkIns
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: this.cors() })
    const contentType = req.headers()['content-type'] ?? null
    const raw = req.postData()
    const body = raw && contentType?.includes('json') ? JSON.parse(raw) : undefined
    const auth = req.headers()['authorization'] ?? null
    this.calls.push({ method, path: url.pathname + url.search, body, auth, idempotencyKey: req.headers()['idempotency-key'] ?? null, contentType })
    const p = url.pathname.replace(P, '')
    const ok = (status: number, json?: unknown, extra: Record<string, string> = {}) => {
      const text = json === undefined ? '' : JSON.stringify(json)
      // Every successful GET carries an ETag; sent back unchanged as If-None-Match, the answer is 304 with no body
      const etag = method === 'GET' && status >= 200 && status < 300 ? etagOf(text) : null
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

    // ---------- sign-in (public) ----------
    if (p === '/auth/otp/send') return ok(202)
    if (p === '/auth/otp/verify') return body.code === '123456' ? ok(200, this.tokens()) : fail(400, 'WRONG_CODE', 'That code is not right. 4 tries left.')
    if (p === '/auth/refresh') {
      const state = this.refreshTokens.get(body.refreshToken)
      if (state === 'rotated') return fail(401, 'REFRESH_TOKEN_REUSED', 'For your safety you were signed out everywhere. Sign in again.')
      if (state !== 'live') return fail(401, 'INVALID_REFRESH_TOKEN', 'Sign in again.')
      this.refreshTokens.set(body.refreshToken, 'rotated')
      return ok(200, this.tokens())
    }
    if (p === '/auth/logout') {
      this.refreshTokens.set(body.refreshToken, 'rotated')
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

    if (p === '/auth/me' && method === 'PATCH') {
      this.user = { ...this.user, name: body.name }
      return ok(200, this.user)
    }
    if (p === '/auth/email/send-code') return ok(202)
    if (p === '/auth/email/verify') {
      if (body.code !== '654321') return fail(400, 'WRONG_CODE', 'That code is not right.')
      this.user = { ...this.user, email: body.email, emailVerified: true }
      return ok(200, this.user)
    }
    if (p === '/auth/logout-all') return ok(204)
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
      return this.shop ? ok(200, this.shop) : fail(404, 'NO_SHOP', 'You have no shop yet.')
    }
    if (p === '/shops' && method === 'POST') {
      if (this.shop) return fail(409, 'ALREADY_HAS_SHOP', 'You already have a shop.')
      if (!this.user.emailVerified || !this.user.name) return fail(403, 'PROFILE_INCOMPLETE', 'Add your email and name first.')
      if (!/^[1-9]\d{5}$/.test(body.pincode)) return fail(400, 'VALIDATION_FAILED', 'Some fields are not valid', { pincode: 'must be a 6-digit pincode' })
      this.role = 'OWNER'
      this.shop = MockApi.shopOf({ ...body, status: 'DRAFT', myRole: 'OWNER', type: body.type ?? 'KIRANA', ownerPhotoFileId: null, shopPhotoFileId: null, version: 0 })
      return ok(201, this.shop)
    }
    if (p === '/shops/me' && method === 'PATCH') {
      if (!this.shop || this.role !== 'OWNER') return fail(403, 'OWNER_ONLY', 'Only the shop owner can do this.')
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      const { version: _v, ...change } = body
      this.shop = { ...this.shop, ...change, gstin: change.gstin === '' ? null : change.gstin, udyamNumber: change.udyamNumber === '' ? null : change.udyamNumber, version: (this.shop.version as number) + 1 }
      return ok(200, this.shop)
    }
    if (p === '/shops/me/photos') {
      if (!this.shop) return fail(404, 'NO_SHOP', 'You have no shop yet.')
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      this.shop = {
        ...this.shop,
        ownerPhotoFileId: body.ownerPhotoFileId ?? this.shop.ownerPhotoFileId,
        shopPhotoFileId: body.shopPhotoFileId ?? this.shop.shopPhotoFileId,
        version: (this.shop.version as number) + 1,
      }
      return ok(200, this.shop)
    }
    if (p === '/shops/me/submit') {
      if (!this.shop) return fail(404, 'NO_SHOP', 'You have no shop yet.')
      if (!this.shop.ownerPhotoFileId || !this.shop.shopPhotoFileId) return fail(409, 'PHOTOS_REQUIRED', 'Add both photos first.')
      if (body.version !== this.shop.version) return fail(409, 'SHOP_CHANGED', 'Someone changed your shop. Reload and try again.')
      this.shop = { ...this.shop, status: 'PENDING_VISIT', statusReason: null, version: (this.shop.version as number) + 1 }
      return ok(200, this.shop)
    }
    if (p === '/shops/me/helpers' && method === 'POST') {
      if (this.members.some((m) => m.phone === body.phone)) return fail(409, 'ALREADY_IN_A_SHOP', 'This person already works in a shop.')
      this.members.push({ userId: `u${++this.n}`, name: null, phone: body.phone, role: 'HELPER', staffId: null, walkInAccess: false })
      return ok(200, this.members.map((m) => ({ userId: m.userId, name: m.name, phone: m.phone, role: m.role, joinedAt: '2026-11-01T00:00:00Z' })))
    }
    const helper = p.match(/^\/shops\/me\/helpers\/([^/]+)$/)
    if (helper && method === 'DELETE') {
      this.members = this.members.filter((m) => m.userId !== helper[1])
      return ok(200, [])
    }
    if (p === '/shops/me/leave') {
      if (this.role === 'OWNER') return fail(409, 'OWNER_CANT_LEAVE', "The owner can't leave the shop.")
      this.shop = null
      return ok(204)
    }

    // ---------- files ----------
    if (p === '/files' && method === 'POST') {
      if (!MockApi.tokenHasShop(auth)) return fail(403, 'SHOP_REQUIRED', 'Register or join a shop first.')
      if (!contentType?.startsWith('multipart/form-data')) return fail(400, 'VALIDATION_FAILED', 'Send a file.')
      const f = { id: `f${++this.n}`, purpose: url.searchParams.get('purpose'), contentType: 'image/jpeg', sizeBytes: 1000, originalName: 'x.jpg', createdAt: new Date().toISOString(), duplicate: false }
      this.files.push(f)
      return ok(201, f)
    }
    if (/^\/files\/[^/]+\/link$/.test(p)) return ok(200, { url: `${API}/blob.png`, expiresAt: minutesFromNow(5) })

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
    if (p === '/salon/services' && method === 'POST') {
      if (!owner) return ownerOnly()
      if (this.services.some((s) => s.active && s.name === body.name)) return fail(409, 'SERVICE_NAME_TAKEN', 'You already have a service with this name.')
      const s = { id: `v${++this.n}`, active: true, sortOrder: 0, version: 0, priceIsFrom: false, ...body }
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
    if (p === '/salon/staff' && method === 'GET') return ok(200, owner ? this.staff : this.staff.map((s) => ({ ...s, loginPhone: null })))
    if (p === '/salon/staff' && method === 'POST') {
      if (!owner) return ownerOnly()
      const s = { id: `st${++this.n}`, name: body.name, active: true, serviceIds: [], hours: [], loginPhone: null, photoFileId: null, version: 0 }
      this.staff.push(s)
      return ok(201, s)
    }
    const st = p.match(/^\/salon\/staff\/([^/]+)(\/login|\/photo|\/services|\/hours)?$/)
    if (st && !p.includes('/blocks')) {
      if (!owner) return ownerOnly()
      const s = this.staff.find((x) => x.id === st[1])
      if (!s) return fail(404, 'STAFF_NOT_FOUND', 'No such barber.')
      const bump = () => Object.assign(s, { version: (s.version as number) + 1 })
      if (st[2] === '/login') {
        s.loginPhone = method === 'DELETE' ? null : body.phone
        return ok(200, bump())
      }
      if (st[2] === '/photo') {
        s.photoFileId = body.fileId
        return ok(200, bump())
      }
      if (body.version !== s.version) return fail(409, 'STAFF_CHANGED', 'This barber was changed meanwhile. Reload.')
      if (st[2] === '/services') s.serviceIds = body.serviceIds
      else if (st[2] === '/hours') s.hours = body.hours
      else {
        if (body.active === false && this.appointments.some((a) => a.staffId === s.id && a.status === 'CONFIRMED')) {
          return fail(409, 'STAFF_HAS_BOOKINGS', 'He has bookings coming up. Move or cancel them first.')
        }
        if (body.name !== undefined) s.name = body.name
        if (body.active !== undefined) s.active = body.active
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
        return fail(503, 'SERVICE_BUSY', "We're having a short problem. Try again in a few seconds.")
      }
      const date = url.searchParams.get('date') ?? todayIst()
      const from = new Date(istInstant(date, '00:00')).getTime()
      const to = from + 86400_000
      const onDay = (a: Json) => a.status !== 'REMOVED' && Date.parse(a.startsAt as string) < to && Date.parse(a.endsAt as string) > from
      // Active barbers, plus switched-off ones who had something that day (as the backend does)
      const barbers = this.staff
        .filter((s) => s.active || this.appointments.some((a) => a.staffId === s.id && onDay(a)))
        .filter((s) => this.seesAll() || s.id === this.myStaffId)
        .map((s) => ({
          staffId: s.id,
          name: s.name,
          hours: [{ start: '10:00', end: '20:00' }],
          appointments: this.appointments.filter((a) => a.staffId === s.id && onDay(a)).map((a) => this.view(a)),
        }))
      return ok(200, { date, barbers, myStaffId: this.myStaffId })
    }
    if (p === '/salon/upcoming') {
      return ok(200, this.appointments.filter((a) => a.kind === 'BOOKING' && a.status === 'CONFIRMED' && (this.seesAll() || a.staffId === this.myStaffId)).map((a) => this.view(a)))
    }
    if (p === '/salon/history') {
      if (!ownerOrHelper) return notAllowed()
      const done = this.appointments.filter((a) => a.kind !== 'BLOCK' && a.status !== 'CONFIRMED')
      const counts: Record<string, number> = {}
      done.forEach((a) => (counts[a.status as string] = (counts[a.status as string] ?? 0) + 1))
      return ok(200, { from: url.searchParams.get('from'), to: url.searchParams.get('to'), counts, completedPaise: 50000, appointments: done.map((a) => this.view(a)), truncated: false })
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
        if (Date.now() >= start + 15 * 60_000) return fail(409, 'WRONG_STATUS', 'It was held until the start plus 15 minutes and is a no-show now. Add the customer as a walk-in.', { reason: 'HELD_OVER', heldUntil: new Date(start + 15 * 60_000).toISOString() })
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
        if (Date.now() < start + 15 * 60_000) return fail(409, 'WRONG_STATUS', 'The customer may still come: No-show is allowed later.', { reason: 'TOO_EARLY', noShowFrom: new Date(start + 15 * 60_000).toISOString() })
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
      const hit = this.staff.flatMap((st) => this.holdsBetween(st.id, from, from + 86400_000))
      if (hit.length) return fail(409, 'BLOCK_CONFLICTS', 'Some appointments are in the way. Reassign or cancel them first.', { appointments: hit.map((a) => ({ id: a.id, kind: a.kind, staffId: a.staffId, startsAt: a.startsAt, endsAt: a.endsAt })) })
      const c = { closureId: `c${++this.n}`, date: body.date, barbers: 2 }
      this.closures.push(c)
      return ok(201, c)
    }
    const closure = p.match(/^\/salon\/closures\/([^/]+)$/)
    if (closure) {
      if (!owner) return ownerOnly()
      this.closures = this.closures.filter((c) => c.closureId !== closure[1])
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

    // The backend counts unread up to 100 (NotificationStore.UNREAD_CAP)
    if (p === '/me/notifications') return ok(200, { items: this.inbox, unread: Math.min(100, this.inbox.filter((i) => !i.read).length), next: null })
    if (p === '/me/notifications/unread-count') return ok(200, { unread: Math.min(100, this.inbox.filter((i) => !i.read).length) })
    if (p === '/me/notifications/read') {
      const ids: string[] = body?.ids ?? []
      this.inbox.forEach((i) => {
        if (!ids.length || ids.includes(i.id as string)) i.read = true
      })
      return ok(204)
    }

    return fail(404, 'NOT_FOUND', `No mock for ${method} ${p}`)
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
