import type { SalonHours, ServiceItem as Service, ShopRole, ShopStatus, Staff } from '../../api/types'

/**
 * The "Get your salon ready" steps, worked out from what the app already read (no request of its own for the needed
 * ones). Needed: customers can't book without them, so they can't be skipped. Good to do: each can be skipped, and a
 * skip is remembered for this account in this salon.
 */
export type StepId = 'services' | 'barbers' | 'barberSetup' | 'hours' | 'allBarbers' | 'notifications' | 'team' | 'share' | 'offer'
export const NEEDED: readonly StepId[] = ['services', 'barbers', 'barberSetup', 'hours']

export interface Step {
  id: StepId
  needed: boolean
  done: boolean
  /**
   * barberSetup and allBarbers: the first barber still without services or weekly hours (his page opens); allBarbers
   * also how many still are
   */
  barber?: { id: string; name: string }
  barbersLeft?: number
}

export interface StepFacts {
  role: ShopRole
  status: ShopStatus
  services: Service[]
  staff: Staff[]
  hours: SalonHours
  /** This phone: notifications on (null: the phone can't have them, the step isn't shown) */
  pushOn: boolean | null
  /** Someone else can sign in (a barber's sign-in, a helper) or is invited; null: not known (the step waits) */
  teamInvited: boolean | null
  /** The salon made an offer before; null: not known */
  anyOffer: boolean | null
  /** The salon's share page was opened from this card */
  shared: boolean
  skips: readonly string[]
}

/** A barber who can't be booked yet: no weekly hours, or none of the salon's services on offer given to him. */
export function needsSetup(s: Staff, services: Service[]): boolean {
  return s.hours.length === 0 || !s.serviceIds.some((id) => services.some((v) => v.id === id && v.active))
}

/**
 * The steps this person sees, in order (needed first). A barber sees none.
 *
 * The needed barber step is the Share page's own rule (whatsMissing): at least one working barber customers can book
 * (weekly hours and one of the services on offer). Every other working barber set up the same way is good to do
 * ("allBarbers": skippable, opening the exact barber still missing them), so a salon customers can already book is
 * never held back by a second barber added without hours. A salon with one working barber has only the needed step.
 *
 * A helper sees the needed ones (the owner does them: the card says so) and the one he can do on his own phone,
 * notifications. While the salon waits for the field team's visit, or is off the app, sharing it and an offer are
 * left out (no customer can find it yet); off the app, so is everything else that is only good to do. Skipped steps
 * are left out.
 */
export function setupSteps(f: StepFacts): Step[] {
  if (f.role === 'BARBER') return []
  const active = f.staff.filter((s) => s.active)
  const waiting = active.filter((s) => needsSetup(s, f.services))
  const bookable = active.length > waiting.length
  const steps: Step[] = [
    { id: 'services', needed: true, done: f.services.some((s) => s.active) },
    { id: 'barbers', needed: true, done: active.length > 0 },
    {
      id: 'barberSetup',
      needed: true,
      done: bookable,
      barber: !bookable && waiting[0] ? { id: waiting[0].id, name: waiting[0].name } : undefined,
    },
    { id: 'hours', needed: true, done: f.hours.days.length > 0 },
  ]
  if (f.status === 'SUSPENDED') return steps
  const owner = f.role === 'OWNER'
  const live = f.status === 'APPROVED'
  const extra: Array<Step | null> = [
    // The owner's (helpers can't change barbers); one working barber has only the needed step
    owner && active.length > 1
      ? {
          id: 'allBarbers',
          needed: false,
          done: waiting.length === 0,
          barber: waiting[0] ? { id: waiting[0].id, name: waiting[0].name } : undefined,
          barbersLeft: waiting.length,
        }
      : null,
    f.pushOn === null ? null : { id: 'notifications', needed: false, done: f.pushOn },
    owner && f.teamInvited !== null ? { id: 'team', needed: false, done: f.teamInvited } : null,
    owner && live ? { id: 'share', needed: false, done: f.shared } : null,
    owner && live && f.anyOffer !== null ? { id: 'offer', needed: false, done: f.anyOffer } : null,
  ]
  for (const s of extra) if (s && !f.skips.includes(s.id)) steps.push(s)
  return steps
}

/** The step to do next: the first needed one not done, else the first one good to do. Null when all are done. */
export function nextStep(steps: Step[]): Step | null {
  return steps.find((s) => s.needed && !s.done) ?? steps.find((s) => !s.done) ?? null
}

/**
 * The good-to-do steps this person skipped that still aren't done (an offer made after skipping it doesn't count):
 * what "Show them" brings back. Steps that don't apply here (sharing while waiting for the visit) aren't counted.
 */
export function skippedOpen(f: StepFacts): StepId[] {
  return setupSteps({ ...f, skips: [] })
    .filter((s) => !s.needed && !s.done && f.skips.includes(s.id))
    .map((s) => s.id)
}
