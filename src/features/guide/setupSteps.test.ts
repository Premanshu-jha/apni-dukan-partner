import type { SalonHours, ServiceItem, Staff } from '../../api/types'
import { whatsMissing } from '../share/link'
import { needsSetup, nextStep, setupSteps, skippedOpen, type StepFacts } from './setupSteps'

const service = (id: string, active = true) => ({ id, active }) as ServiceItem
const barber = (id: string, over: Partial<Staff> = {}) =>
  ({ id, name: `Barber ${id}`, active: true, serviceIds: ['v1'], hours: [{ weekday: 1, start: '10:00', end: '20:00' }], loginPhone: null, ...over }) as Staff
const open: SalonHours = { version: '1', days: [{ weekday: 1, open: '10:00', close: '20:00' }] as unknown as SalonHours['days'] }

function facts(over: Partial<StepFacts> = {}): StepFacts {
  return {
    role: 'OWNER',
    status: 'APPROVED',
    services: [service('v1')],
    staff: [barber('b1')],
    hours: open,
    pushOn: false,
    teamInvited: false,
    anyOffer: false,
    shared: false,
    skips: [],
    ...over,
  }
}
const ids = (f: StepFacts) => setupSteps(f).map((s) => s.id)

describe('the "Get your salon ready" steps', () => {
  it('a brand-new salon: every step, the first needed one next', () => {
    const steps = setupSteps(facts({ services: [], staff: [], hours: { version: null, days: [] } }))
    expect(steps.map((s) => s.id)).toEqual(['services', 'barbers', 'barberSetup', 'hours', 'notifications', 'team', 'share', 'offer'])
    expect(steps.filter((s) => s.done)).toEqual([])
    expect(nextStep(steps)?.id).toBe('services')
  })

  it('needed: one barber customers can book (the Share page\'s rule); until then it opens the first barber to set up', () => {
    const steps = setupSteps(facts({ staff: [barber('b1', { hours: [] }), barber('b2', { serviceIds: [] })] }))
    const step = steps.find((s) => s.id === 'barberSetup')!
    expect(step.done).toBe(false)
    expect(step.barber).toEqual({ id: 'b1', name: 'Barber b1' })
    expect(nextStep(steps)?.id).toBe('barberSetup')
    // The same rule as share's whatsMissing: bookable as soon as one barber is
    expect(whatsMissing([service('v1')], [barber('b1', { hours: [] }), barber('b2', { serviceIds: [] })])).toBe('hours')
  })

  it('a bookable salon with a second barber not set up: the needed step is done, every barber is good to do and opens him', () => {
    const staff = [barber('b1'), barber('b2', { hours: [] }), barber('b3', { serviceIds: [] }), barber('b4', { active: false, hours: [] })]
    const steps = setupSteps(facts({ staff }))
    expect(whatsMissing([service('v1')], staff)).toBeNull()
    expect(steps.find((s) => s.id === 'barberSetup')!.done).toBe(true)
    const all = steps.find((s) => s.id === 'allBarbers')!
    expect(all).toMatchObject({ needed: false, done: false, barber: { id: 'b2', name: 'Barber b2' } })
    // b4 is off: not counted
    expect(all.barbersLeft).toBe(2)
    // Needed all done: the good-to-do steps lead now (tips and "ready" can come)
    expect(nextStep(steps)).toMatchObject({ id: 'allBarbers', needed: false })
    expect(steps.filter((s) => s.needed).every((s) => s.done)).toBe(true)
    // Skippable, and remembered like the others
    expect(ids(facts({ staff, skips: ['allBarbers'] }))).not.toContain('allBarbers')
    expect(skippedOpen(facts({ staff, skips: ['allBarbers'] }))).toEqual(['allBarbers'])
  })

  it('every barber set up, or only one working barber: no good-to-do barber step left open', () => {
    expect(setupSteps(facts({ staff: [barber('b1'), barber('b2')] })).find((s) => s.id === 'allBarbers')).toMatchObject({ done: true })
    expect(ids(facts({ staff: [barber('b1'), barber('b2', { active: false, hours: [] })] }))).not.toContain('allBarbers')
    // A helper can't change barbers: not his step
    expect(ids(facts({ role: 'HELPER', staff: [barber('b1'), barber('b2', { hours: [] })] }))).not.toContain('allBarbers')
  })

  it('a barber whose only service is off still needs setting up', () => {
    expect(needsSetup(barber('b1'), [service('v1', false)])).toBe(true)
    expect(needsSetup(barber('b1'), [service('v1')])).toBe(false)
  })

  it('needed done: the first good-to-do step is next; skipped steps are left out', () => {
    expect(nextStep(setupSteps(facts()))?.id).toBe('notifications')
    expect(ids(facts({ skips: ['notifications', 'share'] }))).toEqual(['services', 'barbers', 'barberSetup', 'hours', 'team', 'offer'])
    expect(nextStep(setupSteps(facts({ skips: ['notifications'] })))?.id).toBe('team')
  })

  it('all done or skipped: nothing next', () => {
    expect(nextStep(setupSteps(facts({ pushOn: true, teamInvited: true, shared: true, anyOffer: true })))).toBeNull()
    expect(nextStep(setupSteps(facts({ skips: ['notifications', 'team', 'share', 'offer'] })))).toBeNull()
  })

  it('needed steps can never be skipped', () => {
    expect(ids(facts({ services: [], skips: ['services', 'barbers'] }))).toContain('services')
  })

  it('a phone without notifications, or a list not known yet, leaves that step out', () => {
    expect(ids(facts({ pushOn: null, teamInvited: null, anyOffer: null }))).toEqual(['services', 'barbers', 'barberSetup', 'hours', 'share'])
  })

  it('waiting for the visit: no sharing or offer yet (no customer can find the salon)', () => {
    expect(ids(facts({ status: 'PENDING_VISIT' }))).toEqual(['services', 'barbers', 'barberSetup', 'hours', 'notifications', 'team'])
  })

  it('off the app: only the needed steps', () => {
    expect(ids(facts({ status: 'SUSPENDED' }))).toEqual(['services', 'barbers', 'barberSetup', 'hours'])
  })

  it('a helper: the needed steps and notifications on his own phone; a barber: nothing', () => {
    expect(ids(facts({ role: 'HELPER' }))).toEqual(['services', 'barbers', 'barberSetup', 'hours', 'notifications'])
    expect(ids(facts({ role: 'BARBER' }))).toEqual([])
  })

  it('skipped and still not done: what "Show them" brings back', () => {
    expect(skippedOpen(facts({ skips: ['notifications', 'offer'] }))).toEqual(['notifications', 'offer'])
    // An offer made after skipping it, or a step that doesn't apply while waiting for the visit, isn't offered back
    expect(skippedOpen(facts({ skips: ['notifications', 'offer'], anyOffer: true }))).toEqual(['notifications'])
    expect(skippedOpen(facts({ status: 'PENDING_VISIT', skips: ['share', 'team'] }))).toEqual(['team'])
    expect(skippedOpen(facts())).toEqual([])
  })
})
