import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { offerKeys, offersApi } from '../../api/offers'
import { pushSupported } from '../../api/push'
import { dayApi, salonKeys, useSalonHours, useServices, useStaff } from '../../api/salon'
import { shopApi, shopKeys, useShop } from '../../api/shop'
import { storage } from '../../lib/storage'
import { useSession } from '../../store/session'
import { DISMISSED, useSubscribed } from '../profile/Notifications'
import { nextStep, setupSteps, skippedOpen, type StepId } from './setupSteps'
import { useMark, useSeen, useSkips } from './storage'

/** The checklist's own reads (team, offers) are asked again at most once a minute: Today is opened all day. */
const STALE = 60_000

/**
 * Where the salon stands on "Get your salon ready", for the card on Today and the "Steps you skipped" row on the Salon
 * tab (both read the same cached lists, so opening one after the other asks nothing new).
 *
 * Under load: the needed steps come from the setup lists the app reads anyway (services, barbers, hours, shared with
 * the Salon tab). The team lists are read only for the owner and only until the team is known to sign in; the offers
 * list only for a live salon's owner and only until an offer exists; each at most once a minute. Skipped steps are read
 * too, so a step done after skipping it (an offer made from Offers) isn't offered back. Nothing here polls.
 *
 * Notifications: the old "Not now" on the day board (DISMISSED) is for this phone, whoever is signed in. It counts as
 * this account having skipped the step, unless this account brought the step back ("pushBack"). Bringing it back
 * never clears DISMISSED, so another person on this phone isn't asked again because of it. Skip on the card is this
 * account's only: it never sets DISMISSED, so a barber on the same phone still gets his own prompt.
 */
export function useSetupState() {
  const shop = useShop()
  const owner = shop.myRole === 'OWNER'
  const myPhone = useSession((s) => s.user?.phone ?? null)
  const services = useServices()
  const staff = useStaff()
  const hours = useSalonHours()
  const [savedSkips, skipStep, unskipSteps] = useSkips(shop.id)
  const [shared, markShared] = useSeen(`shared.${shop.id}`)
  const [pushBack, setPushBack] = useMark('pushBack')
  const [pushOn, setPushOn] = useSubscribed()
  const live = shop.status === 'APPROVED'
  const extras = shop.status !== 'SUSPENDED'

  // Someone else signs in: a barber's own sign-in (or one invited), else a helper or an invitation waiting
  const teamByStaff = staff.data?.some((s) => s.invitedPhone || (s.loginPhone && s.loginPhone !== myPhone)) ?? false
  const askTeam = owner && extras && staff.data !== undefined && !teamByStaff
  const members = useQuery({ queryKey: salonKeys.members, queryFn: dayApi.members, enabled: askTeam, staleTime: STALE })
  const invites = useQuery({ queryKey: shopKeys.invites, queryFn: shopApi.invites, enabled: askTeam, staleTime: STALE })
  const askOffers = owner && live
  const offers = useQuery({ queryKey: offerKeys.list, queryFn: offersApi.list, enabled: askOffers, staleTime: STALE })

  const pushStep = pushSupported()
  const phoneSaidNotNow = storage.get(DISMISSED) === '1'
  const skips = phoneSaidNotNow && !pushBack && !savedSkips.includes('notifications') ? [...savedSkips, 'notifications'] : savedSkips

  // Not ready until everything it counts is known, so the count and the next step don't change under the finger
  const waiting =
    !services.data ||
    !staff.data ||
    !hours.data ||
    (pushStep && pushOn === null) ||
    (askTeam && (members.isPending || invites.isPending)) ||
    (askOffers && offers.isPending)
  // A setup list that couldn't be read: no card (the Salon tab says so), and nothing waits on it
  const failed = [services, staff, hours].some((q) => q.isError && q.data === undefined)
  const facts =
    waiting || failed
      ? null
      : {
          role: shop.myRole,
          status: shop.status,
          services: services.data!,
          staff: staff.data!,
          hours: hours.data!,
          pushOn: pushStep ? Boolean(pushOn) : null,
          // A list that failed to load leaves its step out, rather than a step that may already be done
          teamInvited: teamByStaff
            ? true
            : members.data && invites.data
              ? members.data.some((m) => m.role !== 'OWNER') || invites.data.length > 0
              : null,
          anyOffer: offers.data ? offers.data.length > 0 : null,
          shared,
          skips,
        }
  const steps = facts ? setupSteps(facts) : []
  const skipped = facts ? skippedOpen(facts) : []

  const skip = useCallback(
    (id: StepId) => {
      // This account's skip only (not the phone's DISMISSED: someone else on this phone is still asked)
      if (id === 'notifications') setPushBack(false)
      skipStep(id)
    },
    [skipStep, setPushBack],
  )
  /** The skipped steps come back on the card. */
  const showSkipped = useCallback(
    (ids: readonly StepId[]) => {
      if (ids.includes('notifications')) setPushBack(true)
      unskipSteps(ids)
    },
    [unskipSteps, setPushBack],
  )

  /** Reads the setup lists that failed again (the card's "Try again"). */
  const retry = useCallback(() => {
    for (const q of [services, staff, hours]) if (q.isError) void q.refetch()
  }, [services, staff, hours])

  return {
    waiting,
    failed,
    retry,
    steps,
    next: nextStep(steps),
    skipped,
    skip,
    showSkipped,
    markShared,
    setPushOn,
    live,
    extras,
    owner,
    myPhone,
    staff: staff.data,
  }
}
