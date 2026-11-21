import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { offerKeys, offersApi, refreshOffers, type NewOffer as NewOfferBody, type OfferPreview, type OfferView } from '../../api/offers'
import { useSalonHours, useServices, useSettings } from '../../api/salon'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { Banner, Button, Card, Chip, ErrorState, Field, Loading, Page, Switch } from '../../components/ui'
import { useT } from '../../i18n'
import { addDays, todayIst, weekdayName } from '../../lib/ist'
import { rupees } from '../../lib/money'
import { checkOffer, endTime, MAX_DAYS_AHEAD, offerPrice, offerWhen } from './offerText'
import { serviceName } from '../../lib/serviceName'
import { unsavedWarning } from '../../lib/unsaved'
import { cameFrom } from '../shop/Register'

/** The offer in the list is this very one (a lost answer, then a second tap). */
function sameOffer(o: OfferView, b: NewOfferBody): boolean {
  return (
    o.percentOff === b.percentOff &&
    o.startsOn === b.startsOn &&
    o.endsOn === b.endsOn &&
    (o.from ?? undefined) === b.from &&
    (o.until ?? undefined) === b.until &&
    [...o.serviceIds].sort().join() === [...b.serviceIds].sort().join()
  )
}

const PERCENTS = [10, 15, 20, 25, 30]

/** The fields whose errors show under them; any other error shows above the button. */
const FIELDS = ['percentOff', 'serviceIds', 'startsOn', 'endsOn', 'from', 'until']

/**
 * A new offer (owner only): the discount, its services, its days and (if he likes) its hours, which must lie inside
 * the opening hours. "See preview" shows both prices and how many past customers will be told; "Publish and send"
 * publishes it and the message goes at once. Changing anything after the preview asks for a new one.
 */
export function NewOffer() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const services = useServices()
  const hours = useSalonHours()
  const settings = useSettings()
  const today = todayIst()
  // The field as typed (empty while being changed); the number from it
  const [percentText, setPercentText] = useState('20')
  const percentOff = percentText.trim() === '' ? Number.NaN : Number(percentText)
  const [allServices, setAll] = useState(true)
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState(addDays(today, 2))
  const [someHours, setSomeHours] = useState(false)
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [preview, setPreview] = useState<OfferPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const location = useLocation()
  // Back where it was opened from (Today's setup card), else the offers
  const back = cameFrom(location, '/salon/offers')
  // Anything changed from how the form opened, not published yet: Back and Help ask first
  const unsaved =
    percentText !== '20' || !allServices || serviceIds.length > 0 || startsOn !== today || endsOn !== addDays(today, 2) || someHours || from !== '' || until !== ''

  const active = (services.data ?? []).filter((s) => s.active)
  const lastEnd = addDays(today, MAX_DAYS_AHEAD)
  // Customers can book this many days ahead (the salon's booking rule): an offer must start inside that. Not read
  // (yet): no guess here, the backend checks it (409 OFFER_TOO_FAR)
  const lastStart = settings.data ? addDays(today, settings.data.maxDaysAhead) : lastEnd
  const problem = checkOffer({ percentOff, startsOn, endsOn, someHours, from, until, allServices, serviceIds, today, lastEnd, lastStart })
  const body: NewOfferBody = {
    percentOff,
    serviceIds: allServices ? [] : serviceIds,
    startsOn,
    endsOn,
    ...(someHours ? { from, until: endTime(until) } : {}),
  }
  /** Every change: the preview no longer matches, and an old error no longer applies. */
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPreview(null)
    setError(null)
  }

  async function run(publish: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (publish) {
        const done = await offersApi.publish(body)
        await refreshOffers(qc)
        navigate('/salon/offers', { replace: true, state: { published: done.notified } })
        return
      }
      setPreview(await offersApi.preview(body))
    } catch (e) {
      // Published already (the first tap's answer was lost, then this one overlapped it): go to the list as published
      if (publish && isApiError(e, 'OFFER_OVERLAPS')) {
        const list = await qc.fetchQuery({ queryKey: offerKeys.list, queryFn: offersApi.list, staleTime: 0 }).catch(() => [])
        // Only one made in the last two minutes (a forgotten old one isn't "just published")
        const same = list.find(
          (o) => o.offer.id === e.details.offerId && sameOffer(o.offer, body) && Date.now() - Date.parse(o.createdAt) < 120_000,
        )
        if (same) {
          navigate('/salon/offers', { replace: true, state: { published: same.notified } })
          return
        }
      }
      setError(e)
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  if (services.isPending || hours.isPending) return <Page back={back} title={t('offers.newOffer')}><Loading /></Page>
  if (services.isError || hours.isError) {
    return (
      <Page back={back} title={t('offers.newOffer')}>
        <ErrorState message={messageOf(services.error ?? hours.error)} onRetry={() => { void services.refetch(); void hours.refetch() }} />
      </Page>
    )
  }

  const toggle = (id: string) => change(setServiceIds)(serviceIds.includes(id) ? serviceIds.filter((x) => x !== id) : [...serviceIds, id])
  return (
    <Page back={back} title={t('offers.newOffer')} leaveWarning={unsavedWarning(unsaved)}>
      <Card className="flex flex-col gap-3">
        <p className="font-medium" id="percent-label">{t('offers.discount')}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="percent-label">
          {PERCENTS.map((p) => (
            <Chip key={p} selected={percentOff === p} onClick={() => change(setPercentText)(String(p))}>
              {p}%
            </Chip>
          ))}
        </div>
        <Field
          id="offer-percent"
          label={t('offers.otherDiscount')}
          type="number"
          inputMode="numeric"
          min={5}
          max={50}
          value={percentText}
          onChange={(e) => change(setPercentText)(e.target.value)}
          error={fieldError(error, 'percentOff')}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">{t('offers.allServices')}</p>
          <Switch label={t('offers.allServices')} checked={allServices} onChange={change(setAll)} />
        </div>
        {!allServices && (
          <ul className="flex flex-col gap-2" aria-label={t('offers.servicesInOffer')}>
            {active.map((s) => (
              <li key={s.id}>
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3">
                  <input type="checkbox" className="h-5 w-5" checked={serviceIds.includes(s.id)} onChange={() => toggle(s.id)} />
                  <span className="flex-1">{serviceName(s.name)}</span>
                  <span className="text-sm text-muted">
                    <s>{rupees(s.pricePaise, s.priceIsFrom)}</s> <span className="text-accent">{rupees(offerPrice(s.pricePaise, percentOff), s.priceIsFrom)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {fieldError(error, 'serviceIds') && <p className="text-sm text-bad">{fieldError(error, 'serviceIds')}</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field id="offer-starts" label={t('offers.firstDay')} type="date" min={today} max={lastStart} value={startsOn} onChange={(e) => change(setStartsOn)(e.target.value)} error={fieldError(error, 'startsOn')} />
          <Field id="offer-ends" label={t('offers.lastDay')} type="date" min={startsOn || today} max={lastEnd} value={endsOn} onChange={(e) => change(setEndsOn)(e.target.value)} error={fieldError(error, 'endsOn')} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('offers.someHours')}</p>
            <p className="text-sm text-muted">{t('offers.someHoursHint')}</p>
          </div>
          <Switch label={t('offers.someHours')} checked={someHours} onChange={change(setSomeHours)} />
        </div>
        {someHours && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field id="offer-from" label={t('offers.from')} type="time" step={900} value={from} onChange={(e) => change(setFrom)(e.target.value)} error={fieldError(error, 'from')} />
              <Field id="offer-until" label={t('offers.until')} type="time" step={900} value={until} onChange={(e) => change(setUntil)(e.target.value)} error={fieldError(error, 'until')} hint={t('offers.untilHint')} />
            </div>
            <p className="text-sm text-muted">
              {hours.data.days.length
                ? t('offers.insideHours', { hours: hours.data.days.map((d) => `${weekdayName(d.weekday)} ${d.open}–${d.close}`).join(', ') })
                : t('offers.insideHoursNotSet')}
            </p>
          </>
        )}
      </Card>

      {error !== null && !FIELDS.some((f) => fieldError(error, f)) && (
        <Banner tone="bad">
          {messageOf(error)}
          {isApiError(error, 'NO_SALON_HOURS') && (
            <>
              {' '}
              <Link to="/setup/hours" className="underline">
                {t('offers.setOpeningHours')}
              </Link>
            </>
          )}
        </Banner>
      )}

      {preview ? (
        <Card className="flex flex-col gap-3">
          <p className="font-semibold">
            <span className="text-accent">{t('offers.percentOff', { percent: percentOff })}</span> · {offerWhen({ startsOn, endsOn, from: someHours ? from : null, until: someHours ? endTime(until) : null })}
          </p>
          <ul className="flex flex-col gap-1" aria-label={t('offers.pricesInOffer')}>
            {preview.services.map((s) => (
              <li key={s.serviceId} className="flex justify-between gap-2 text-sm">
                <span>{serviceName(s.name)}</span>
                <span>
                  <s className="text-muted">{rupees(s.pricePaise, s.priceIsFrom)}</s> <strong className="text-accent">{rupees(s.offerPricePaise, s.priceIsFrom)}</strong>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm" role="status">
            {preview.customers === 0
              ? t('offers.previewNoCustomers')
              : t('offers.previewCustomers', { count: preview.customers })}
          </p>
          <Button busy={busy} onClick={() => run(true)}>
            {t('offers.publishAndSend')}
          </Button>
        </Card>
      ) : (
        <>
          {problem && <p className="text-sm text-muted">{problem}</p>}
          <Button busy={busy} disabled={problem !== null} onClick={() => run(false)}>
            {t('offers.seePreview')}
          </Button>
        </>
      )}
    </Page>
  )
}
