import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, explain, isApiError, messageOf } from '../../api/errors'
import { dayApi, salonKeys, useServices, refreshSalonWork } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, EmptyState, ErrorBanner, ErrorState, Field, Loading, Page } from '../../components/ui'
import { language, useT } from '../../i18n'
import { clock12 } from '../../lib/ist'
import { duration, rupees } from '../../lib/money'
import { ServiceIcon } from '../../components/ServiceIcon'
import { priceNow, walkInTotal } from '../../lib/walkIn'
import { newIdempotencyKey } from './status'
import { serviceName } from '../../lib/serviceName'
import { FirstTimeHint } from '../guide/FirstTimeHint'
import { unsavedWarning } from '../../lib/unsaved'
import { can } from '../../lib/roles'

/**
 * A customer at the door without a booking: pick the services, then a barber who is free now, and start (it is in
 * the chair at once). Everyone busy: pick a barber's next free time today and keep it for the customer, who comes back
 * then (with their mobile number, they get an SMS with the time); the time is taken for online bookings at once.
 * Owner, or someone the owner gave walk-in access. Each service shows its price now (the salon's offer price, with its
 * own crossed out, while an offer applies), and the total at the bottom follows every tick.
 */
/** The most services one walk-in can have (as the backend allows). */
const MAX_SERVICES = 10

export function WalkIn() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const services = useServices()
  const [chosenIds, setPicked] = useState<string[]>([])
  const [staffId, setStaffId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After no answer (or a server error) it may have been added: the choice is held as it was, so trying again with
  // the same key gives back that walk-in instead of adding a second one.
  const [held, setHeld] = useState(false)
  // The total the backend said after PRICE_CHANGED (shown to the owner): sent with the next tap, so a price read late
  // or not at all can't refuse the walk-in again. Ticking again forgets it.
  const [toldPrice, setToldPrice] = useState<number | null>(null)
  // One key per walk-in being added: a retry after a lost answer can't add it twice.
  const key = useRef(newIdempotencyKey())
  // Something ticked, typed or picked and not added yet: Back and Help ask first
  const unsaved = chosenIds.length > 0 || name.trim() !== '' || phone.trim() !== '' || staffId !== null
  // Whether a time kept for later can be sent to the customer by SMS (asked once; off: no number asked)
  const texts = useQuery({ queryKey: ['salon', 'walk-in-texts'], queryFn: dayApi.walkInTexts, staleTime: 3_600_000, retry: false })

  const active = services.data?.filter((s) => s.active) ?? []
  // A service the owner switched off meanwhile drops out of the choice (it can't be booked any more).
  const picked = chosenIds.filter((id) => active.some((s) => s.id === id))

  const options = useQuery({
    queryKey: ['salon', 'walk-in-options', ...picked],
    queryFn: () => dayApi.walkInOptions(picked),
    enabled: picked.length > 0,
    retry: false,
  })
  const option = options.data?.find((o) => o.staffId === staffId)
  // A barber busy now with a free time later today: that time is kept for the customer
  const later = option && !option.freeNow && option.startAt ? option.startAt : null
  // Prices now (or at the kept time), with the salon's offer: read again every minute (an offer's hours start or end
  // while the screen is open)
  const prices = useQuery({
    queryKey: [...salonKeys.walkInPrices, later ?? 'now'],
    queryFn: () => dayApi.walkInPrices(later ?? undefined),
    enabled: active.length > 0,
    refetchInterval: 60_000,
    retry: false,
  })
  const notAllowed = isApiError(options.error, 'WALK_INS_NOT_ALLOWED') || isApiError(prices.error, 'WALK_INS_NOT_ALLOWED')
  const nobody = isApiError(options.error, 'NO_BARBER_FOR_SERVICES')
  // Prices that couldn't be read again aren't shown as "now": the own prices, with a note saying the offer wasn't checked
  const pricesNow = prices.isError ? undefined : prices.data
  const pricesUnknown = !notAllowed && (prices.isError || (prices.isPending && prices.fetchStatus !== 'idle'))
  const chosen = active.filter((s) => picked.includes(s.id))
  const total = walkInTotal(chosen, pricesNow)
  const full = picked.length >= MAX_SERVICES
  // Its "4:15 PM" (the option's India time "16:15")
  const laterTime = later && option?.time ? clock12(option.time) : ''
  const phoneDigits = phone.replace(/[^0-9]/g, '').replace(/^(91|0)(?=[6-9][0-9]{9}$)/, '')

  function toggle(id: string) {
    setPicked((p) => {
      const now = p.filter((x) => active.some((s) => s.id === x))
      return now.includes(id) ? now.filter((x) => x !== id) : now.length >= MAX_SERVICES ? now : [...now, id]
    })
    setStaffId(null)
    setError(null)
    setToldPrice(null)
    // A different walk-in now: a key sent before can't be reused for it.
    key.current = newIdempotencyKey()
  }

  async function add() {
    if (!staffId || busy) return
    if (name.trim().length === 1) {
      setError(t('day.walkInNameTooShort'))
      return
    }
    if (later && phone.trim() && !/^[6-9][0-9]{9}$/.test(phoneDigits)) {
      setError(t('day.walkInPhoneWrong'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The total shown goes with it (the usual prices when the offer couldn't be checked): if the price now differs,
      // nothing is added (409 PRICE_CHANGED) and the screen says the new total
      await dayApi.addWalkIn(key.current, {
        serviceIds: picked,
        staffId,
        name: name.trim() || null,
        expectedPricePaise: toldPrice ?? total.pricePaise,
        ...(later ? { startAt: later, ...(phone.trim() ? { phone: phoneDigits } : {}) } : {}),
      })
      refreshSalonWork(qc)
      // Kept for later: Today says once what to tell the customer (the time, with whom)
      navigate('/salon/day', { replace: true, ...(later && option ? { state: { walkInKept: { time: laterTime, name: option.name } } } : {}) })
    } catch (e) {
      if (isApiError(e, 'PRICE_CHANGED')) {
        const now = (e as ApiError).details?.pricePaise
        setToldPrice(typeof now === 'number' ? now : null)
        setError(
          typeof now === 'number'
            ? t('day.walkInPriceChanged', { price: rupees(now, total.priceIsFrom) })
            : explain(e),
        )
        void prices.refetch()
      } else if (later && isApiError(e, 'BARBER_BUSY')) {
        // The kept time was taken by someone else meanwhile (the backend's English names the barber and the time)
        setError(language() === 'en' ? explain(e) : t('day.walkInKeptTaken'))
      } else {
        setError(explain(e))
      }
      if (isApiError(e, 'BARBER_BUSY') || isApiError(e, 'WALK_IN_TIME_PASSED')) {
        setStaffId(null)
        void options.refetch()
      }
      // A clear refusal (4xx) means nothing was added: the next try is a new walk-in. With no answer, or a server
      // error, it may have been added: keep the key, so trying again gives back that same walk-in.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        key.current = newIdempotencyKey()
        setHeld(false)
      } else {
        setHeld(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (shop.status === 'SUSPENDED') return <Page back="/salon/day" title={t('day.walkInTitle')}><Banner tone="bad">{t('day.walkInSuspended')}</Banner></Page>

  return (
    <Page
      back="/salon/day"
      title={t('day.walkInTitle')}
      leaveWarning={unsavedWarning(unsaved)}
      footer={
        active.length > 0 && !notAllowed ? (
          <div className="flex flex-col gap-2">
            <div role="status" aria-label={t('day.walkInTotalLabel')} className="flex flex-col">
              {total.count ? (
                <>
                  <p className="font-semibold">
                    {t('day.walkInTotal', { count: total.count })} ·{' '}
                    {total.listPricePaise != null && (
                      <>
                        <s className="font-normal text-muted">
                          <span className="sr-only">{t('day.srWas')} </span>
                          {rupees(total.listPricePaise, total.priceIsFrom)}
                        </s>{' '}
                        <span className="sr-only">{t('day.srNow')} </span>
                      </>
                    )}
                    <span className={total.listPricePaise != null ? 'text-accent' : ''}>{rupees(total.pricePaise, total.priceIsFrom)}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {total.listPricePaise == null
                      ? t('day.walkInAbout', { duration: duration(total.minutes) })
                      : total.offerUntil
                        ? t('day.walkInAboutOfferTill', { duration: duration(total.minutes), time: clock12(total.offerUntil) })
                        : t('day.walkInAboutOfferToday', { duration: duration(total.minutes) })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">{t('day.walkInTickHint')}</p>
              )}
              {pricesUnknown &&
                (prices.isError ? (
                  <p className="text-sm text-warn">
                    {t('day.walkInOfferUnchecked')}{' '}
                    <button type="button" className="font-medium text-link underline" onClick={() => void prices.refetch()}>
                      {t('day.walkInCheckAgain')}
                    </button>
                  </p>
                ) : (
                  <p className="text-sm text-muted">{t('day.walkInCheckingOffer')}</p>
                ))}
            </div>
            {option && (
              <Button busy={busy} onClick={add}>
                {later ? t('day.walkInKeepWith', { time: laterTime, name: option.name }) : t('day.walkInStartWith', { name: option.name })}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {/* What this is, always said in one line: a customer at the door, without a booking */}
      <p className="text-sm text-muted">{t('day.walkInIntro')}</p>
      {/* Only where a walk-in can be added (not to a barber the owner hasn't allowed) */}
      <FirstTimeHint screen="walkIn" text={t('guide.hintWalkIn', { free: t('guide.quoted', { text: t('day.freeNow') }) })} show={!services.isPending && active.length > 0 && !notAllowed} />
      {services.isPending ? (
        <Loading />
      ) : services.isError ? (
        <ErrorState message={messageOf(services.error)} onRetry={() => services.refetch()} />
      ) : active.length === 0 ? (
        shop.myRole === 'OWNER' ? (
          // The owner is the one who adds them: one tap there, and back here after
          <EmptyState
            title={t('day.walkInNoServicesTitle')}
            body={t('day.walkInNoServicesBodyOwner')}
            action={
              <Link
                to="/setup/services"
                state={{ from: '/salon/walk-in' }}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink"
              >
                {t('day.walkInAddServices')}
              </Link>
            }
          />
        ) : (
          <EmptyState title={t('day.walkInNoServicesTitle')} body={t('day.walkInNoServicesBody')} />
        )
      ) : notAllowed ? (
        <EmptyState title={t('day.walkInNotAllowedTitle')} body={t('day.walkInNotAllowedBody')} />
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-label={t('day.services')}>
            <p className="text-sm font-medium text-muted">{t('day.walkInWhat')}</p>
            {full && <p className="text-sm text-muted">{t('day.walkInMaxServices', { max: MAX_SERVICES })}</p>}
            {active.map((s) => {
              const p = priceNow(s, pricesNow)
              return (
                <label key={s.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2">
                  <input
                    type="checkbox"
                    checked={picked.includes(s.id)}
                    disabled={held || (full && !picked.includes(s.id))}
                    onChange={() => toggle(s.id)}
                    className="h-5 w-5 accent-brand"
                  />
                  <ServiceIcon service={s} size={22} className="text-link" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words">{serviceName(s.name)}</span>
                    <span className="text-sm text-muted">{duration(s.durationMinutes)}</span>
                  </span>
                  {p.listPricePaise != null ? (
                    <span className="text-right">
                      <s className="block text-sm text-muted">
                        <span className="sr-only">{t('day.srWas')} </span>
                        {rupees(p.listPricePaise, s.priceIsFrom)}
                      </s>
                      <span className="font-semibold text-accent">
                        <span className="sr-only">{t('day.srNow')} </span>
                        {rupees(p.pricePaise, s.priceIsFrom)}
                      </span>
                      <span className="block text-xs text-muted">{p.offerUntil ? t('day.offerTill', { time: clock12(p.offerUntil) }) : t('day.offerToday')}</span>
                    </span>
                  ) : (
                    <span className="font-semibold">{rupees(p.pricePaise, s.priceIsFrom)}</span>
                  )}
                </label>
              )
            })}
          </section>

          {picked.length > 0 && (
            <section className="flex flex-col gap-2" aria-label={t('day.barber')}>
              {/* Nobody free now: what to do (keep a later time) said before the list, not under it */}
              {options.data && options.data.length > 0 && !options.data.some((o) => o.freeNow) ? (
                <Banner tone="info">
                  {options.data.some((o) => o.startAt) ? t('day.walkInNobodyFreeNow') : t('day.walkInNoTimeToday')}
                </Banner>
              ) : (
                <p className="text-sm font-medium text-muted">{t('day.walkInWho')}</p>
              )}
              {options.isPending ? (
                <Loading />
              ) : nobody ? (
                <Banner tone="warn">
                  {t('day.walkInNoBarberTogether')}
                  {/* Who does which service is set on each barber's page (the owner changes it; a helper can look) */}
                  {can(shop.myRole).seeSetup && (
                    <Link to="/setup/staff" state={{ from: '/salon/walk-in' }} className="mt-1 flex min-h-11 items-center text-link underline">
                      {t('day.walkInSetWhoDoes')}
                    </Link>
                  )}
                </Banner>
              ) : options.isError ? (
                <ErrorState message={explain(options.error)} onRetry={() => options.refetch()} />
              ) : options.data.length === 0 ? (
                <Banner tone="warn">{t('day.walkInNoBarber')}</Banner>
              ) : (
                options.data.map((o) => (
                  <button
                    key={o.staffId}
                    type="button"
                    aria-pressed={staffId === o.staffId}
                    // Free now: starts now. Busy with a free time later today: that time can be kept for the customer
                    disabled={(!o.freeNow && !o.startAt) || held}
                    onClick={() => {
                      setStaffId(o.staffId)
                      key.current = newIdempotencyKey()
                    }}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left disabled:opacity-50 ${staffId === o.staffId ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
                  >
                    <span className="min-w-0 font-medium break-words">{o.name}</span>
                    <span className="flex shrink-0 flex-col items-end text-right text-sm">
                      <span className={o.freeNow ? 'font-semibold text-good' : 'text-muted'}>
                        {o.freeNow ? t('day.freeNow') : o.time ? t('day.busyFreeAt', { time: clock12(o.time) }) : t('day.noTimeLeftToday')}
                      </span>
                      {!o.freeNow && o.startAt && <span className="text-link">{t('day.keepThisTime')}</span>}
                    </span>
                  </button>
                ))
              )}
            </section>
          )}

          {option && (
            <Card className="flex flex-col gap-3">
              {later && <Banner tone="info">{t('day.walkInKeepExplain', { time: laterTime, name: option.name })}</Banner>}
              <Field id="guest-name" label={t('day.walkInNameLabel')} value={name} maxLength={60} disabled={held} onChange={(e) => setName(e.target.value)} />
              {later && texts.data?.sms && (
                <Field
                  id="guest-phone"
                  label={t('day.walkInPhoneLabel')}
                  hint={t('day.walkInPhoneHint', { time: laterTime })}
                  value={phone}
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={16}
                  disabled={held}
                  onChange={(e) => setPhone(e.target.value)}
                />
              )}
              {held && <Banner tone="warn">{t('day.walkInHeld')}</Banner>}
              {error && <ErrorBanner message={error} />}
              <p className="text-sm text-muted">{t('day.walkInCheckTotal')}</p>
            </Card>
          )}
          {error && !option && <ErrorBanner message={error} />}
        </>
      )}
    </Page>
  )
}
