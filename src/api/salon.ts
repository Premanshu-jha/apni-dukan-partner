import type { ServiceIconName } from '../lib/serviceIcons'
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from './client'
import { isApiError } from './errors'
import { loadDay } from './dayBoard'
import { applyUpcoming, pageOf, type UpcomingChanges, type UpcomingPage } from './upcomingList'
import { cursorQuery, type AfterCursor } from './pages'
import type {
  Appointment,
  CatalogService,
  OpenDay,
  RatingsPage,
  SalonHours,
  ClosureView,
  DayView,
  HistoryView,
  Member,
  PauseView,
  ServiceItem,
  Settings,
  Shift,
  Staff,
  WalkInOption, WalkInPrice,
} from './types'

const S = '/api/v1/salon'

export const salonKeys = {
  all: ['salon'] as const,
  services: ['salon', 'services'] as const,
  staff: ['salon', 'staff'] as const,
  settings: ['salon', 'settings'] as const,
  catalog: ['salon', 'service-catalog'] as const,
  hours: ['salon', 'hours'] as const,
  /** Each service's price for a walk-in now (with the salon's offer). */
  walkInPrices: ['salon', 'walk-in-prices'] as const,
  ratings: ['salon', 'ratings'] as const,
  day: (date: string) => ['salon', 'day', date] as const,
  days: ['salon', 'day'] as const,
  upcoming: ['salon', 'upcoming'] as const,
  /** The `seq` of the coming-up list's last delta (or of its first page), for the next `since=`; null: no deltas. */
  upcomingSeq: ['salon', 'upcoming-seq'] as const,
  /** The seq of a load of the coming-up list still running (it becomes `upcomingSeq` once every page is in). */
  upcomingPendingSeq: ['salon', 'upcoming-pending-seq'] as const,
  /** The 60-second poll of the coming-up list's deltas. */
  upcomingPoll: ['salon', 'upcoming-poll'] as const,
  history: (from: string, to: string) => ['salon', 'history', from, to] as const,
  closures: ['salon', 'closures'] as const,
  pause: ['salon', 'pause'] as const,
  members: ['salon', 'members'] as const,
}

export interface ServiceIn {
  name: string
  durationMinutes: number
  pricePaise: number
  priceIsFrom: boolean
  sortOrder?: number
  /** Days after a visit to remind the customer to come back (0: never); 14 when left out. */
  returnAfterDays?: number
  /** Its picture (lib/serviceIcons), one of those that fit its name. */
  icon?: ServiceIconName
}

// ---------- setup (reads: anyone in the salon; changes: owner only) ----------

export const setupApi = {
  services: () => api<ServiceItem[]>('GET', `${S}/services`),
  addService: (s: ServiceIn) => api<ServiceItem>('POST', `${S}/services`, { body: s }),
  /** Several at once, all or none (registration). */
  addServices: (services: ServiceIn[]) => api<ServiceItem[]>('POST', `${S}/services/batch`, { body: { services } }),
  catalog: () => api<CatalogService[]>('GET', `${S}/service-catalog`),
  hours: () => api<SalonHours>('GET', `${S}/hours`),
  /** The whole week; trimStaffHours cuts barbers' hours outside it (else 409 STAFF_HOURS_OUTSIDE names them). */
  setHours: (version: string | null, days: OpenDay[], trimStaffHours = false) =>
    api<SalonHours>('PUT', `${S}/hours`, { body: { version, days, ...(trimStaffHours ? { trimStaffHours } : {}) } }),
  updateService: (id: string, version: number, change: Partial<ServiceIn> & { active?: boolean }) =>
    api<ServiceItem>('PATCH', `${S}/services/${id}`, { body: { version, ...change } }),

  staff: () => api<Staff[]>('GET', `${S}/staff`),
  addStaff: (name: string) => api<Staff>('POST', `${S}/staff`, { body: { name } }),
  updateStaff: (id: string, version: number, change: { name?: string; active?: boolean }) =>
    api<Staff>('PATCH', `${S}/staff/${id}`, { body: { version, ...change } }),
  /** The owner also cuts hair: a barber profile linked to his own sign-in (every service, the salon's hours). 201. */
  addMeAsBarber: () => api<Staff>('POST', `${S}/staff/me`),
  /** Remove a barber for good (owner): out of the list, his sign-in goes; past bookings keep his name. 204. */
  removeStaff: (id: string) => api<void>('DELETE', `${S}/staff/${id}`),
  linkLogin: (id: string, phone: string) => api<Staff>('PUT', `${S}/staff/${id}/login`, { body: { phone } }),
  unlinkLogin: (id: string) => api<Staff>('DELETE', `${S}/staff/${id}/login`),
  setPhoto: (id: string, fileId: string | null) => api<Staff>('PUT', `${S}/staff/${id}/photo`, { body: { fileId } }),
  setServices: (id: string, version: number, serviceIds: string[]) =>
    api<Staff>('PUT', `${S}/staff/${id}/services`, { body: { version, serviceIds } }),
  setStaffHours: (id: string, version: number, hours: Shift[]) =>
    api<Staff>('PUT', `${S}/staff/${id}/hours`, { body: { version, hours } }),

  settings: () => api<Settings>('GET', `${S}/settings`),
  updateSettings: (version: number | null, change: { minLeadMinutes?: number; maxDaysAhead?: number }) =>
    api<Settings>('PATCH', `${S}/settings`, { body: { version, ...change } }),
}

export const useServices = () => useQuery({ queryKey: salonKeys.services, queryFn: setupApi.services })
export const useStaff = () => useQuery({ queryKey: salonKeys.staff, queryFn: setupApi.staff })
export const useSettings = () => useQuery({ queryKey: salonKeys.settings, queryFn: setupApi.settings })
/** The catalog never changes while the app runs: read once. */
export const useCatalog = () => useQuery({ queryKey: salonKeys.catalog, queryFn: setupApi.catalog, staleTime: Infinity })
export const useSalonHours = () => useQuery({ queryKey: salonKeys.hours, queryFn: setupApi.hours })

export const ratingsApi = {
  page: (after: { afterAt: string; afterId: string } | null) =>
    api<RatingsPage>(
      'GET',
      `${S}/ratings${after ? `?afterAt=${encodeURIComponent(after.afterAt)}&afterId=${encodeURIComponent(after.afterId)}` : ''}`,
    ),
}

/** The salon's ratings, newest first, 30 a page ("Show more"); the summary is on the first page. */
export function useRatings() {
  return useInfiniteQuery({
    queryKey: salonKeys.ratings,
    initialPageParam: null as { afterAt: string; afterId: string } | null,
    queryFn: ({ pageParam }) => ratingsApi.page(pageParam),
    getNextPageParam: (last: RatingsPage) => last.next ?? undefined,
    staleTime: 60_000,
  })
}

// ---------- the day's work ----------

export const dayApi = {
  /** The whole day (the full form: ETag and 304). */
  day: (date: string) => api<DayView>('GET', `${S}/day?date=${date}`),
  /** Only what changed on this date since `seq` (exactly as received); never kept for If-None-Match. */
  dayChanges: (date: string, seq: string) =>
    api<DayView>('GET', `${S}/day?date=${date}&since=${encodeURIComponent(seq)}`, { keep: false }),
  /** One page of the upcoming list; `after` is where the page before ended (null: the first page). */
  upcoming: (after: AfterCursor | null = null) =>
    api<Appointment[]>('GET', `${S}/upcoming${after ? `?${cursorQuery(after).slice(1)}` : ''}`),
  /**
   * What changed on the coming-up list since `seq` ("start" for a first `seq`). An older backend ignores `since` and
   * answers the first page (an array): then there are no deltas.
   */
  upcomingChanges: (since: string) =>
    api<UpcomingChanges | Appointment[]>('GET', `${S}/upcoming?since=${encodeURIComponent(since)}`, { keep: false }),
  /** One page of the history; `after` is the page before's `next` (null: the first page). */
  history: (from: string, to: string, after: AfterCursor | null = null) =>
    api<HistoryView>('GET', `${S}/history?from=${from}&to=${to}${cursorQuery(after)}`),

  start: (id: string, body: { code?: string; withoutCode?: boolean }) =>
    api<Appointment>('POST', `${S}/appointments/${id}/start`, { body }),
  noShow: (id: string) => api<Appointment>('POST', `${S}/appointments/${id}/no-show`),
  /** Done before the planned end: the rest of the barber's time is free. */
  finish: (id: string) => api<Appointment>('POST', `${S}/appointments/${id}/finish`),
  undoNoShow: (id: string) => api<Appointment>('POST', `${S}/appointments/${id}/undo-no-show`),
  reassign: (id: string, staffId: string) =>
    api<Appointment>('POST', `${S}/appointments/${id}/reassign`, { body: { staffId } }),
  cancel: (id: string, reason: string) => api<Appointment>('POST', `${S}/appointments/${id}/cancel`, { body: { reason } }),

  /** Every active service's price for a walk-in starting now, with the salon's offer where one applies now. */
  walkInPrices: () => api<WalkInPrice[]>('GET', `${S}/walk-ins/prices`),
  walkInOptions: (serviceIds: string[]) =>
    api<WalkInOption[]>('GET', `${S}/walk-ins/options?${serviceIds.map((s) => `services=${s}`).join('&')}`),
  /** expectedPricePaise: the total the screen showed; a different price now is 409 PRICE_CHANGED (nothing added). */
  addWalkIn: (key: string, body: { serviceIds: string[]; staffId: string; name: string | null; expectedPricePaise?: number }) =>
    api<Appointment>('POST', `${S}/walk-ins`, { body, headers: { 'Idempotency-Key': key } }),

  conflicts: (staffId: string, from: string, to: string) =>
    api<Appointment[]>(
      'GET',
      `${S}/staff/${staffId}/blocks/conflicts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  addBlock: (staffId: string, body: { type: 'BREAK' | 'LEAVE'; startAt: string; endAt: string }) =>
    api<Appointment>('POST', `${S}/staff/${staffId}/blocks`, { body }),
  removeBlock: (staffId: string, blockId: string) => api<void>('DELETE', `${S}/staff/${staffId}/blocks/${blockId}`),

  closures: () => api<ClosureView[]>('GET', `${S}/closures`),
  addClosure: (date: string) => api<ClosureView>('POST', `${S}/closures`, { body: { date } }),
  removeClosure: (id: string) => api<void>('DELETE', `${S}/closures/${id}`),

  pause: () => api<PauseView>('GET', `${S}/pause`),
  pauseUntil: (until: string | null) => api<PauseView>('POST', `${S}/pause`, { body: until ? { until } : {} }),
  resume: () => api<PauseView>('POST', `${S}/resume`),

  members: () => api<Member[]>('GET', `${S}/members`),
  setWalkInAccess: (userId: string, allowed: boolean) =>
    api<Member[]>('PUT', `${S}/members/${userId}/walk-in-access`, { body: { allowed } }),
}

/**
 * The day screen. Refreshed every 30 seconds while open, and on every return to the app: the first read of a date is the
 * whole day, every refresh after only what changed since (see dayBoard.ts). Only the date in view is held: opening
 * another date forgets the boards of dates no screen shows, so paging through days doesn't pile up whole days.
 */
/** The salon's closed days (festival holidays), as the Closed days screen reads them; only fetched when enabled. */
export function useClosures(enabled = true) {
  return useQuery({ queryKey: salonKeys.closures, queryFn: dayApi.closures, enabled })
}

export function useDay(date: string) {
  const qc = useQueryClient()
  const day = useQuery({
    queryKey: salonKeys.day(date),
    queryFn: () =>
      loadDay(date, qc.getQueryData<DayView>(salonKeys.day(date)), { full: dayApi.day, since: dayApi.dayChanges }),
    refetchInterval: 30_000,
  })
  // After useQuery's own effects (declared above), so the screen has already moved off the date it showed before
  useEffect(() => {
    qc.removeQueries({
      queryKey: salonKeys.days,
      predicate: (q) => q.queryKey[2] !== date && q.getObserversCount() === 0,
    })
  }, [qc, date])
  return day
}

/** Appointments per page of the upcoming list and the history (SalonDayService.UPCOMING_PAGE, HISTORY_PAGE). */
export const UPCOMING_PAGE = 100
export const HISTORY_PAGE = 100
/**
 * At most this many pages are loaded (500 upcoming bookings, 1,000 in the history). A refresh of a paged list asks
 * every loaded page again, one after the other (so the pages stay joined without gaps or repeats), so the cap keeps
 * the upcoming list's minute-by-minute refresh to at most 5 small calls, each answered 304 when its page is unchanged
 * (each page has its own ETag). Beyond the cap the screen says where to look instead.
 */
export const UPCOMING_MAX_PAGES = 5
export const HISTORY_MAX_PAGES = 10

/**
 * Online bookings to come, soonest first, 100 a page ("Show more"), each page kept with its keyset cursor. Before the
 * first page a `seq` is asked for (`since=start`), so nothing written while the pages load is missed; the list is then
 * kept up to date by `useUpcomingPoll` (deltas), not by asking every page again. A whole reload (`full: true`, or an
 * older backend without deltas) asks every loaded page again, each with its ETag (304 when unchanged).
 */
export function useUpcoming() {
  const qc = useQueryClient()
  const list = useInfiniteQuery({
    queryKey: salonKeys.upcoming,
    initialPageParam: null as AfterCursor | null,
    queryFn: async ({ pageParam }) => {
      if (pageParam === null) {
        const first = await dayApi.upcomingChanges('start')
        // The new seq counts only once every page of this load is in (see below); until then there is none, so a
        // load that fails leaves the next poll (or Try again) to load the pages again, not to ask a delta from a seq
        // whose list was never shown
        qc.setQueryData(salonKeys.upcomingSeq, null)
        qc.setQueryData<PendingSeq>(salonKeys.upcomingPendingSeq, { seq: Array.isArray(first) ? null : first.seq, at: Date.now() })
      }
      return pageOf(await dayApi.upcoming(pageParam), UPCOMING_PAGE)
    },
    getNextPageParam: (last: UpcomingPage, all: UpcomingPage[]) =>
      all.length >= UPCOMING_MAX_PAGES ? undefined : (last.next ?? undefined),
    // Kept fresh by the deltas below, not by reloading every page
    refetchOnWindowFocus: false,
  })
  // The load's pages all came (TanStack updates the data once, after the last page): its seq is the one to go on from
  useEffect(() => {
    const pending = qc.getQueryData<PendingSeq>(salonKeys.upcomingPendingSeq)
    if (!pending || list.isFetching || list.dataUpdatedAt < pending.at) return
    qc.setQueryData(salonKeys.upcomingSeq, pending.seq)
    qc.setQueryData(salonKeys.upcomingPendingSeq, null)
  }, [qc, list.dataUpdatedAt, list.isFetching])
  return list
}

/** A load's seq (`since=start`, null from an older backend) and when it was asked, until its pages are all in. */
interface PendingSeq {
  seq: string | null
  at: number
}

/**
 * The coming-up list's poll: every 60 seconds and on return to the app, only what changed since the last `seq`,
 * applied to the loaded pages (see upcomingList.ts). `full: true`, no `seq` (an older backend) or a list not loaded:
 * every loaded page is asked again. A failed poll keeps the list and its `seq`.
 */
export function useUpcomingPoll(enabled: boolean) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: salonKeys.upcomingPoll,
    queryFn: async () => {
      const seq = qc.getQueryData<string | null>(salonKeys.upcomingSeq)
      const reload = () => qc.refetchQueries({ queryKey: salonKeys.upcoming, exact: true })
      // A page read in flight ("Show more", a reload) was started with the pages as they are and puts them back when
      // it ends: a delta applied now would be lost with its seq already moved on, and a reload would cut it short.
      // Skip this tick (same seq next time).
      const loading = () => qc.isFetching({ queryKey: salonKeys.upcoming, exact: true }) > 0
      if (loading()) return Date.now()
      if (!seq) {
        await reload()
        return Date.now()
      }
      const answer = await dayApi.upcomingChanges(seq)
      if (Array.isArray(answer)) {
        qc.setQueryData(salonKeys.upcomingSeq, null)
        await reload()
      } else if (answer.full) {
        // The reload's first page asks for its own seq (since=start), which counts only once every page is in; if a
        // page fails there is no seq, so the next poll (or Try again) loads the pages again
        await reload()
      } else if (!loading()) {
        qc.setQueryData<{ pages: UpcomingPage[]; pageParams: unknown[] }>(salonKeys.upcoming, (data) =>
          data ? { ...data, pages: applyUpcoming(data.pages, answer) } : data,
        )
        qc.setQueryData(salonKeys.upcomingSeq, answer.seq)
      }
      return Date.now()
    },
    enabled,
    // Not when the screen opens (the pages were just read): every 60 seconds, and on every return to the app
    initialData: 0,
    initialDataUpdatedAt: () => Date.now(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
    retry: false,
  })
}

/**
 * After a change to the salon's day (an action here, or a message about a booking): only what it can affect is read
 * again. The day board in view asks for its delta; the coming-up list, when open, polls its delta once (not every
 * page); the history and the after-the-cap check are marked out of date and read when next shown. `also`: the other
 * queries the change touches (closed days, the setup).
 */
export function refreshSalonWork(qc: QueryClient, also: QueryKey[] = []) {
  for (const key of also) void qc.invalidateQueries({ queryKey: key })
  void qc.invalidateQueries({ queryKey: salonKeys.days })
  void qc.invalidateQueries({ queryKey: ['salon', 'history'], refetchType: 'none' })
  void qc.invalidateQueries({ queryKey: ['salon', 'upcoming-after-cap'], refetchType: 'none' })
  const poll = qc.getQueryCache().find({ queryKey: salonKeys.upcomingPoll, exact: true })
  if (poll && poll.getObserversCount() > 0) void qc.refetchQueries({ queryKey: salonKeys.upcomingPoll, exact: true })
  else void qc.invalidateQueries({ queryKey: salonKeys.upcoming, exact: true, refetchType: 'none' })
}

/**
 * A barber's invitation was cancelled from Team's waiting list: his card and page stop saying "Invited" at once
 * (the barbers kept from before drop the phone), and the barbers are read again.
 */
export function forgetBarberInvite(qc: QueryClient, staffId: string) {
  qc.setQueryData<Staff[]>(salonKeys.staff, (list) => list?.map((s) => (s.id === staffId ? { ...s, invitedPhone: null } : s)))
  void qc.invalidateQueries({ queryKey: salonKeys.staff, refetchType: 'all' })
}

/**
 * The owner's own barber profile, if he has one: the one signed in with his phone (it keeps his sign-in while switched
 * off, and lets go of it only when removed).
 */
export function ownProfile(staff: Staff[] | undefined, phone: string | null): Staff | undefined {
  return phone === null ? undefined : staff?.find((s) => s.loginPhone === phone)
}

/**
 * Adds the owner as a barber. The barbers are read again whatever the answer, and this ends only once they are, so the
 * question or button can't show again in between; 409 ALREADY_A_BARBER (another tab, a double tap) counts as done.
 * Other errors are thrown.
 */
export async function addOwnerAsBarber(qc: QueryClient) {
  try {
    await setupApi.addMeAsBarber()
  } catch (e) {
    if (!isApiError(e, 'ALREADY_A_BARBER')) {
      await qc.refetchQueries({ queryKey: salonKeys.staff })
      throw e
    }
  }
  refreshSalonWork(qc, SETUP_KEYS.filter((k) => k !== salonKeys.staff))
  await qc.refetchQueries({ queryKey: salonKeys.staff })
}

/** The setup's queries (barbers, services, booking rules, who may add walk-ins): a setup change reads them again. */
export const SETUP_KEYS: QueryKey[] = [salonKeys.services, salonKeys.staff, salonKeys.settings, salonKeys.members, salonKeys.hours, salonKeys.walkInPrices]

/**
 * Whether anything comes after the capped coming-up list: the page after the last loaded booking, asked once (not
 * polled; again when the salon's data is refreshed), only to say yes or no. Without it the note at the cap would show
 * when exactly 500 bookings exist and nothing comes after.
 */
export function useMoreAfterCap(after: AfterCursor | null) {
  return useQuery({
    queryKey: ['salon', 'upcoming-after-cap', after?.afterStart ?? null, after?.afterId ?? null],
    queryFn: () => dayApi.upcoming(after),
    enabled: after !== null,
    select: (page: Appointment[]) => page.length > 0,
  })
}

/**
 * The history of a range of days, latest first, 100 a page with the backend's `next`. The totals are on every page
 * (the screen takes them from the first). Not polled: re-read on return to the app once a minute old.
 */
export function useHistory(from: string, to: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: salonKeys.history(from, to),
    initialPageParam: null as AfterCursor | null,
    queryFn: ({ pageParam }) => dayApi.history(from, to, pageParam),
    getNextPageParam: (last: HistoryView, all: HistoryView[]) =>
      all.length >= HISTORY_MAX_PAGES ? undefined : (last.next ?? undefined),
    enabled,
    staleTime: 60_000,
  })
}

export const usePause = () => useQuery({ queryKey: salonKeys.pause, queryFn: dayApi.pause })
