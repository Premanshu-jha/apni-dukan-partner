import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { turnOnPush } from '../../api/push'
import { addOwnerAsBarber, ownProfile } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Banner, Button, Card } from '../../components/ui'
import { t, useT } from '../../i18n'
import { PushProblem, pushErrorText, resultText } from '../profile/Notifications'
import type { Step, StepId } from './setupSteps'
import { useSeen } from './storage'
import { useSetupState } from './useSetupState'

/** The salon's share page (its link and QR for customers): built on its own screen; this card only links to it. */
export const SHARE_PATH = '/salon/share'

/**
 * "Get your salon ready" on Today, for the owner and helpers (barbers don't see it): how far along the salon is
 * ("3 of 7 done"), the one step to do next with its button, and the rest as a short list.
 *
 * Needed steps (customers can't book without them: services, barbers, each barber's services and weekly hours,
 * opening hours) stay until done. Good-to-do steps (notifications on this phone, the team's sign-ins, sharing the
 * salon, a first offer) stay until done or skipped; a skip is remembered for this account in this salon. When all are
 * done the card says "Your salon is ready" once, then is gone. A helper sees what's left with "Only the owner can do
 * this" where it is the owner's, and can turn on notifications on his own phone. Skipped steps that still aren't done
 * are counted at the bottom ("2 steps skipped · Show them"), which brings them back. What it reads: useSetupState.
 */
/** What the card holds: still loading, a needed step left, only good-to-do steps left, or nothing (all done). */
export type ChecklistState = 'loading' | 'needed' | 'good' | 'none'

/**
 * @param hidden worked out but not drawn (Today shows the first-time tips in its place: one guide card at a time)
 * @param onState told what the card holds, so Today can choose what to show first
 */
export function SetupChecklist({ hidden = false, onState }: { hidden?: boolean; onState?: (state: ChecklistState) => void }) {
  const t = useT()
  const qc = useQueryClient()
  const shop = useShop()
  const { waiting, failed, retry, steps, next, skipped, skip, showSkipped, markShared, setPushOn, live, extras, owner, myPhone, staff } = useSetupState()
  // Each step's screen comes back here with its back arrow (not to the Salon tab)
  const location = useLocation()
  const from = location.pathname + location.search
  const [readySeen, markReady] = useSeen(`ready.${shop.id}`)
  const [busy, setBusy] = useState<StepId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [readyNow, setReadyNow] = useState(false)

  const allDone = !waiting && steps.length > 0 && next === null
  // Taken off the app by our team: nothing is "ready" (customers can't book, approval isn't what it waits for)
  const suspended = shop.status === 'SUSPENDED'
  // The moment it is ready: said once (on this phone, for this account), and kept on screen for this visit
  // (not while hidden: the moment would pass unseen; not while suspended: it isn't true then)
  if (allDone && owner && !hidden && !suspended && !readySeen && !readyNow) setReadyNow(true)
  useEffect(() => {
    if (readyNow) markReady()
  }, [readyNow, markReady])
  const state: ChecklistState = failed ? 'none' : waiting ? 'loading' : next === null ? 'none' : next.needed ? 'needed' : 'good'
  useEffect(() => onState?.(state), [state, onState])

  if (hidden) return null
  // A list the card needs couldn't be read: said, with a way to try again (never a card that just isn't there)
  if (failed) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted" role="status">
        {t('day.setupCheckFailed')}
        <button type="button" className="min-h-11 px-1 font-medium text-link underline" onClick={retry}>
          {t('common.retry')}
        </button>
      </p>
    )
  }
  if (readyNow && !suspended) {
    return (
      <Banner tone="good">
        {live ? t('day.setupReady') : t('day.setupReadyWaiting', { name: shop.name })}
      </Banner>
    )
  }
  if (waiting || next === null) return null

  const done = steps.filter((s) => s.done).length
  const needed = steps.filter((s) => s.needed)
  const good = steps.filter((s) => !s.needed)
  const ownerAddsMe = owner && !ownProfile(staff, myPhone)

  const turnOn = () =>
    run('notifications', async () => {
      const r = await turnOnPush()
      if (r === 'on') setPushOn(true)
      else setError(resultText(r))
    })

  async function run(id: StepId, call: () => Promise<void>) {
    setBusy(id)
    setError(null)
    try {
      await call()
    } catch (e) {
      setError(pushErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{t('day.setupTitle')}</h2>
        <span className="shrink-0 text-sm text-muted">{t('day.setupProgress', { done, total: steps.length })}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={t('day.setupTitle')}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-valuetext={t('day.setupProgress', { done, total: steps.length })}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <p className="text-sm text-muted">
        {!owner ? t('day.setupIntroHelper') : live ? t('day.setupIntro') : t('day.setupIntroWaiting', { name: shop.name })}
      </p>

      {/* The one thing to do now, with its button */}
      <section aria-label={t('day.setupNext')} className="flex flex-col gap-2 rounded-xl border border-brand/40 bg-brand/10 p-3">
        <p className="text-xs font-medium tracking-wide text-link uppercase">{t('day.setupNext')}</p>
        <p className="font-semibold">{stepText(next)}</p>
        {next.id === 'allBarbers' && (next.barbersLeft ?? 0) > 1 && (
          <p className="text-sm text-muted">{t('day.setupBarbersLeft', { count: next.barbersLeft ?? 0 })}</p>
        )}
        {next.id === 'team' && <p className="text-sm text-muted">{t('day.setupTeamBody')}</p>}
        {error && <PushProblem text={error} />}
        {next.needed && !owner ? (
          <p className="text-sm text-muted">{t('day.setupOwnerOnly')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <NextButtons
              step={next}
              from={from}
              busy={busy}
              ownerAddsMe={ownerAddsMe}
              onAddMe={() => run('barbers', () => addOwnerAsBarber(qc))}
              onPush={turnOn}
              onShare={markShared}
            />
            {!next.needed && (
              <Button
                variant="ghost"
                onClick={() => {
                  setError(null)
                  skip(next.id)
                }}
              >
                {t('day.setupSkip')}
              </Button>
            )}
          </div>
        )}
      </section>

      <StepList title={t('day.setupNeeded')} steps={needed} next={next} owner={owner} from={from} onShare={markShared} />
      {good.length > 0 && (
        <StepList
          title={t('day.setupGood')}
          steps={good}
          next={next}
          owner={owner}
          from={from}
          onShare={markShared}
          // A helper's own step, notifications, can be done from its row too (his next step is the owner's then)
          push={!owner ? { busy: busy === 'notifications', onPush: turnOn } : undefined}
        />
      )}
      {owner && !live && extras && <p className="text-xs text-muted">{t('day.setupLaterWaiting')}</p>}
      {/* A skip is never a dead end: the skipped steps can come back from here (and from the Salon tab once the card is gone) */}
      {skipped.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
          {t('day.setupSkippedCount', { count: skipped.length })} ·
          <button type="button" className="min-h-11 px-1 font-medium text-link underline" onClick={() => showSkipped(skipped)}>
            {t('day.setupShowSkipped')}
          </button>
        </p>
      )}
    </Card>
  )
}

/** A step's line, as the person reads it. */
function stepText(s: Step): string {
  switch (s.id) {
    case 'services':
      return t('day.setupServices')
    case 'barbers':
      return t('day.setupBarbers')
    case 'barberSetup':
      return s.barber ? t('day.setupBarberHoursNamed', { name: s.barber.name }) : t('day.setupBarberOne')
    case 'hours':
      return t('day.setupOpeningHours')
    case 'allBarbers':
      return s.barber && !s.done ? t('day.setupBarberHoursNamed', { name: s.barber.name }) : t('day.setupBarberHours')
    case 'notifications':
      return t('day.setupNotifications')
    case 'team':
      return t('day.setupTeam')
    case 'share':
      return t('day.setupShare')
    case 'offer':
      return t('day.setupOffer')
  }
}

/** Where a step's row goes (the exact barber still missing his services or hours). Null: done on the card itself. */
function stepLink(s: Step): string | null {
  switch (s.id) {
    case 'services':
      return '/setup/services'
    case 'barbers':
      return '/setup/staff'
    case 'barberSetup':
    case 'allBarbers':
      return s.barber ? `/setup/staff/${s.barber.id}` : '/setup/staff'
    case 'hours':
      return '/setup/hours'
    case 'notifications':
      return null
    case 'team':
      return '/setup/staff'
    case 'share':
      return SHARE_PATH
    case 'offer':
      return '/salon/offers/new'
  }
}

/** The button words: what tapping does. */
const linkClass = 'inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-semibold'
const primary = `${linkClass} bg-brand text-brand-ink`
const secondary = `${linkClass} border border-line bg-raised text-ink`

function NextButtons({
  step,
  from,
  busy,
  ownerAddsMe,
  onAddMe,
  onPush,
  onShare,
}: {
  step: Step
  /** This screen (Today): where the step's screen goes back to */
  from: string
  busy: StepId | null
  ownerAddsMe: boolean
  onAddMe: () => void
  onPush: () => void
  onShare: () => void
}) {
  const t = useT()
  const state = { from }
  switch (step.id) {
    case 'services':
      return <Link to="/setup/services" state={state} className={primary}>{t('day.setupGoServices')}</Link>
    case 'barbers':
      return (
        <>
          <Link to="/setup/staff" state={state} className={primary}>{t('day.setupGoBarbers')}</Link>
          {/* The owner who cuts hair too: one tap, without leaving Today */}
          {ownerAddsMe && (
            <Button variant="secondary" className="min-h-11" busy={busy === 'barbers'} onClick={onAddMe}>
              {t('setup.addMe')}
            </Button>
          )}
        </>
      )
    case 'barberSetup':
    case 'allBarbers':
      return (
        <Link to={stepLink(step) ?? '/setup/staff'} state={state} className={primary}>
          {step.barber ? t('day.setupOpenBarber', { name: step.barber.name }) : t('day.setupGoBarbers')}
        </Link>
      )
    case 'hours':
      return <Link to="/setup/hours" state={state} className={primary}>{t('day.setupGoHours')}</Link>
    case 'notifications':
      return (
        <Button className="min-h-11" busy={busy === 'notifications'} onClick={onPush}>
          {t('profile.turnOn')}
        </Button>
      )
    case 'team':
      return (
        <>
          <Link to="/setup/staff" state={state} className={primary}>{t('day.setupGoBarbersSignIn')}</Link>
          <Link to="/team" state={state} className={secondary}>{t('day.setupGoHelper')}</Link>
        </>
      )
    case 'share':
      return (
        <Link to={SHARE_PATH} state={state} className={primary} onClick={onShare}>
          {t('day.setupGoShare')}
        </Link>
      )
    case 'offer':
      return <Link to="/salon/offers/new" state={state} className={primary}>{t('day.setupGoOffer')}</Link>
  }
}

/** One group of steps: done ones ticked (still tappable, to change them), the next one in bold. */
function StepList({
  title,
  steps,
  next,
  owner,
  from,
  onShare,
  push,
}: {
  title: string
  steps: Step[]
  next: Step
  owner: boolean
  from: string
  onShare: () => void
  /** The notifications row gets its own Turn on (a helper's, whose next step is the owner's) */
  push?: { busy: boolean; onPush: () => void }
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted">{title}</p>
      <ul className="flex flex-col">
        {steps.map((s) => {
          const to = stepLink(s)
          // A helper can't change the owner's steps: plain text (the owner-only note is on the next step)
          const linked = to !== null && (owner || !s.needed)
          const inner = (
            <>
              <span aria-hidden className={`w-4 shrink-0 text-center ${s.done ? 'text-good' : 'text-muted'}`}>
                {s.done ? '✓' : '○'}
              </span>
              <span className={s.done ? 'text-muted line-through' : s === next ? 'font-semibold text-ink' : linked ? 'text-link underline' : ''}>
                {stepText(s)}
              </span>
              <span className="sr-only">{s.done ? t('day.setupDone') : t('day.setupToDo')}</span>
            </>
          )
          return (
            <li key={s.id}>
              {linked ? (
                <Link to={to} state={{ from }} onClick={s.id === 'share' ? onShare : undefined} className="flex min-h-11 items-center gap-2 text-sm">
                  {inner}
                </Link>
              ) : push && s.id === 'notifications' && !s.done && s !== next ? (
                <span className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
                  {inner}
                  <Button variant="secondary" className="ml-auto min-h-11" busy={push.busy} onClick={push.onPush}>
                    {t('profile.turnOn')}
                  </Button>
                </span>
              ) : (
                <span className="flex min-h-11 items-center gap-2 text-sm">{inner}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
