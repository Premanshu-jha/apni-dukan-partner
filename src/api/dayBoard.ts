import type { Appointment, BarberColumn, DayView } from './types'

/**
 * The day board's deltas (backend README, "Day board deltas"): the first read of a date is the whole day (`full: true`,
 * with `seq`); every poll after asks `?since=<seq>` for the same date and gets only what changed (`full: false`:
 * `changed` to replace by id or add to its barber's column, `removed` to drop), or the whole day again (`full: true`)
 * when it must reload. The board the screen shows is the last whole day with every delta since applied to it.
 */

/** A column's order, as the backend lists it: by start, then id. */
function byStart(x: Appointment, y: Appointment): number {
  return x.startsAt < y.startsAt ? -1 : x.startsAt > y.startsAt ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0
}

/**
 * The board with a delta applied: each changed appointment replaces the one with its id (taken out of whatever column
 * held it: a reassign moves it) and goes into its `staffId`'s column, kept sorted by start; removed ids are dropped
 * (ids not shown are ignored). Null when the delta can't be applied to this board and the whole day must be read: it
 * is for another date, or names a barber this board has no column for.
 */
export function applyDelta(board: DayView, delta: DayView): DayView | null {
  if (delta.date !== board.date) return null
  const changed = delta.changed ?? []
  const gone = new Set<string>([...(delta.removed ?? []), ...changed.map((a) => a.id)])
  const byStaff = new Map<string, Appointment[]>()
  for (const a of changed) {
    if (!board.barbers.some((c) => c.staffId === a.staffId)) return null
    // In the order they were written: a later copy of the same id wins
    const list = (byStaff.get(a.staffId) ?? []).filter((x) => x.id !== a.id)
    byStaff.set(a.staffId, [...list, a])
  }
  const touched = (c: BarberColumn) => byStaff.has(c.staffId) || c.appointments.some((a) => gone.has(a.id))
  const barbers = board.barbers.map((c) =>
    touched(c)
      ? { ...c, appointments: [...c.appointments.filter((a) => !gone.has(a.id)), ...(byStaff.get(c.staffId) ?? [])].sort(byStart) }
      : c,
  )
  return {
    ...board,
    barbers,
    myStaffId: delta.myStaffId,
    seq: delta.seq,
    setupVersion: delta.setupVersion ?? board.setupVersion,
  }
}

/** The calls the board needs (dayApi's, passed in so this stays testable). */
export interface DayReads {
  /** The whole day (ETag and 304 as before). */
  full: (date: string) => Promise<DayView>
  /** What changed since `seq` on this date (no ETag). */
  since: (date: string, seq: string) => Promise<DayView>
}

/**
 * The board for a date: the whole day when nothing is held yet for it (or what is held has no `seq`: an older backend),
 * else the held board with what changed since. A delta that can't be applied reads the whole day at once. A failed read
 * throws, so the screen keeps the board it had (and its `seq`, for the next try).
 */
export async function loadDay(date: string, held: DayView | undefined, reads: DayReads): Promise<DayView> {
  const whole = (v: DayView): DayView => ({ ...v, changed: null, removed: null })
  if (!held || held.date !== date || !held.seq) return whole(await reads.full(date))
  const answer = await reads.since(date, held.seq)
  // full: true is the whole day again: replace everything held (so is an answer with barbers and no `full` at all)
  if (answer.full !== false && answer.barbers) return whole(answer)
  const next = answer.full === false ? applyDelta(held, answer) : null
  return next ?? whole(await reads.full(date))
}
