import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from './client'
import { cursorQuery, nextAfterLast, type AfterCursor } from './pages'
import type {
  Appointment,
  ClosureView,
  DayView,
  HistoryView,
  Member,
  PauseView,
  ServiceItem,
  Settings,
  Shift,
  Staff,
  WalkInOption,
} from './types'

const S = '/api/v1/salon'

export const salonKeys = {
  all: ['salon'] as const,
  services: ['salon', 'services'] as const,
  staff: ['salon', 'staff'] as const,
  settings: ['salon', 'settings'] as const,
  day: (date: string) => ['salon', 'day', date] as const,
  days: ['salon', 'day'] as const,
  upcoming: ['salon', 'upcoming'] as const,
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
}

// ---------- setup (reads: anyone in the salon; changes: owner only) ----------

export const setupApi = {
  services: () => api<ServiceItem[]>('GET', `${S}/services`),
  addService: (s: ServiceIn) => api<ServiceItem>('POST', `${S}/services`, { body: s }),
  updateService: (id: string, version: number, change: Partial<ServiceIn> & { active?: boolean }) =>
    api<ServiceItem>('PATCH', `${S}/services/${id}`, { body: { version, ...change } }),

  staff: () => api<Staff[]>('GET', `${S}/staff`),
  addStaff: (name: string) => api<Staff>('POST', `${S}/staff`, { body: { name } }),
  updateStaff: (id: string, version: number, change: { name?: string; active?: boolean }) =>
    api<Staff>('PATCH', `${S}/staff/${id}`, { body: { version, ...change } }),
  linkLogin: (id: string, phone: string) => api<Staff>('PUT', `${S}/staff/${id}/login`, { body: { phone } }),
  unlinkLogin: (id: string) => api<Staff>('DELETE', `${S}/staff/${id}/login`),
  setPhoto: (id: string, fileId: string | null) => api<Staff>('PUT', `${S}/staff/${id}/photo`, { body: { fileId } }),
  setServices: (id: string, version: number, serviceIds: string[]) =>
    api<Staff>('PUT', `${S}/staff/${id}/services`, { body: { version, serviceIds } }),
  setHours: (id: string, version: number, hours: Shift[]) =>
    api<Staff>('PUT', `${S}/staff/${id}/hours`, { body: { version, hours } }),

  settings: () => api<Settings>('GET', `${S}/settings`),
  updateSettings: (version: number | null, change: { minLeadMinutes?: number; maxDaysAhead?: number }) =>
    api<Settings>('PATCH', `${S}/settings`, { body: { version, ...change } }),
}

export const useServices = () => useQuery({ queryKey: salonKeys.services, queryFn: setupApi.services })
export const useStaff = () => useQuery({ queryKey: salonKeys.staff, queryFn: setupApi.staff })
export const useSettings = () => useQuery({ queryKey: salonKeys.settings, queryFn: setupApi.settings })

// ---------- the day's work ----------

export const dayApi = {
  day: (date: string) => api<DayView>('GET', `${S}/day?date=${date}`),
  /** One page of the upcoming list; `after` is where the page before ended (null: the first page). */
  upcoming: (after: AfterCursor | null = null) =>
    api<Appointment[]>('GET', `${S}/upcoming${after ? `?${cursorQuery(after).slice(1)}` : ''}`),
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

  walkInOptions: (serviceIds: string[]) =>
    api<WalkInOption[]>('GET', `${S}/walk-ins/options?${serviceIds.map((s) => `services=${s}`).join('&')}`),
  addWalkIn: (key: string, body: { serviceIds: string[]; staffId: string; name: string | null }) =>
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

/** The day screen. Refreshed every 30 seconds while open, and on every return to the app. */
export function useDay(date: string) {
  return useQuery({ queryKey: salonKeys.day(date), queryFn: () => dayApi.day(date), refetchInterval: 30_000 })
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
 * Online bookings to come, soonest first, 100 a page ("Show more"). Refreshed every 60 seconds and on return to the
 * app: every loaded page is asked again with its ETag (304 when unchanged).
 */
export function useUpcoming() {
  return useInfiniteQuery({
    queryKey: salonKeys.upcoming,
    initialPageParam: null as AfterCursor | null,
    queryFn: ({ pageParam }) => dayApi.upcoming(pageParam),
    getNextPageParam: (last: Appointment[], all: Appointment[][]) => nextAfterLast(last, all, UPCOMING_PAGE, UPCOMING_MAX_PAGES),
    refetchInterval: 60_000,
  })
}

/**
 * Whether anything comes after the capped coming-up list: the page after the last loaded booking, asked once (not
 * polled; again when the salon's data is refreshed), only to say yes or no. Without it the note at the cap would show
 * when exactly 500 bookings exist and nothing comes after.
 */
export function useMoreAfterCap(after: AfterCursor | null) {
  return useQuery({
    queryKey: [...salonKeys.upcoming, 'after-cap', after?.afterStart ?? null, after?.afterId ?? null],
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
