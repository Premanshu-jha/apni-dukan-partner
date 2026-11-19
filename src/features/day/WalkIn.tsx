import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, explain, isApiError, messageOf } from '../../api/errors'
import { dayApi, salonKeys, useServices, refreshSalonWork } from '../../api/salon'
import { useShop } from '../../api/shop'
import { Banner, Button, Card, EmptyState, ErrorState, Field, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { clock12 } from '../../lib/ist'
import { duration, rupees } from '../../lib/money'
import { ServiceIcon } from '../../components/ServiceIcon'
import { priceNow, walkInTotal } from '../../lib/walkIn'
import { newIdempotencyKey } from './status'

/**
 * A customer who walked in: pick the services, then a barber who is free now (or see when each is next free), and
 * add it. A walk-in starts now (it is in the chair at once). Owner, or someone the owner gave walk-in access. Each
 * service shows its price now (the salon's offer price, with its own crossed out, while an offer applies), and the
 * total at the bottom follows every tick.
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

  const active = services.data?.filter((s) => s.active) ?? []
  // A service the owner switched off meanwhile drops out of the choice (it can't be booked any more).
  const picked = chosenIds.filter((id) => active.some((s) => s.id === id))

  const options = useQuery({
    queryKey: ['salon', 'walk-in-options', ...picked],
    queryFn: () => dayApi.walkInOptions(picked),
    enabled: picked.length > 0,
    retry: false,
  })
  // Prices now, with the salon's offer: read again every minute (an offer's hours start or end while the screen is open)
  const prices = useQuery({
    queryKey: salonKeys.walkInPrices,
    queryFn: dayApi.walkInPrices,
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
  const option = options.data?.find((o) => o.staffId === staffId)

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
      })
      refreshSalonWork(qc)
      navigate('/salon/day', { replace: true })
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
      } else {
        setError(explain(e))
      }
      if (isApiError(e, 'BARBER_BUSY')) {
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
                {t('day.walkInStartWith', { name: option.name })}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {services.isPending ? (
        <Loading />
      ) : services.isError ? (
        <ErrorState message={messageOf(services.error)} onRetry={() => services.refetch()} />
      ) : active.length === 0 ? (
        <EmptyState title={t('day.walkInNoServicesTitle')} body={t('day.walkInNoServicesBody')} />
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
                    <span className="[overflow-wrap:anywhere]">{s.name}</span>
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
              <p className="text-sm font-medium text-muted">{t('day.walkInWho')}</p>
              {options.isPending ? (
                <Loading />
              ) : nobody ? (
                <Banner tone="warn">{t('day.walkInNoBarberTogether')}</Banner>
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
                    disabled={!o.freeNow || held}
                    onClick={() => {
                      setStaffId(o.staffId)
                      key.current = newIdempotencyKey()
                    }}
                    className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left disabled:opacity-50 ${staffId === o.staffId ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
                  >
                    <span className="font-medium">{o.name}</span>
                    <span className="text-sm text-muted">
                      {o.freeNow ? t('day.freeNow') : o.time ? t('day.busyFreeAt', { time: clock12(o.time) }) : t('day.noTimeLeftToday')}
                    </span>
                  </button>
                ))
              )}
            </section>
          )}

          {option && (
            <Card className="flex flex-col gap-3">
              <Field id="guest-name" label={t('day.walkInNameLabel')} value={name} maxLength={60} disabled={held} onChange={(e) => setName(e.target.value)} />
              {held && <Banner tone="warn">{t('day.walkInHeld')}</Banner>}
              {error && <Banner tone="bad">{error}</Banner>}
              <p className="text-sm text-muted">{t('day.walkInCheckTotal')}</p>
            </Card>
          )}
          {error && !option && <Banner tone="bad">{error}</Banner>}
        </>
      )}
    </Page>
  )
}
