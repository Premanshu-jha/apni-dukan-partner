import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { offersApi, refreshOffers, useOffers, type OwnerOffer } from '../../api/offers'
import { useServices } from '../../api/salon'
import { useShop } from '../../api/shop'
import { messageOf } from '../../api/errors'
import { Banner, Button, Card, EmptyState, ErrorState, Loading, Page, Pill } from '../../components/ui'
import { can } from '../../lib/roles'
import { offerWhat, offerWhen } from './offerText'

const STATE: Record<OwnerOffer['state'], { text: string; tone: 'good' | 'brand' | 'muted' }> = {
  RUNNING: { text: 'Running', tone: 'good' },
  UPCOMING: { text: 'Coming up', tone: 'brand' },
  ENDED: { text: 'Ended', tone: 'muted' },
}

/**
 * Offers (owner and helpers see them; the owner makes and ends them): each offer with its state, how many customers
 * the message went to and the bookings it brought.
 */
export function Offers() {
  const offers = useOffers()
  const services = useServices()
  const owner = can(useShop().myRole).editSetup
  const published = (useLocation().state as { published?: number } | null)?.published
  const names = useMemo(() => new Map((services.data ?? []).map((s) => [s.id, s.name])), [services.data])
  return (
    <Page back="/more" title="Offers">
      <p className="text-sm text-muted">
        A discount for the days and hours you choose. When you publish it, your past customers get a message straight
        away. Bookings made inside it keep the offer price.
      </p>
      {published !== undefined && (
        <Banner tone="good">
          Published. {published === 1 ? '1 past customer was' : `${published} past customers were`} sent the offer.
        </Banner>
      )}
      {owner && (
        <Link to="/salon/offers/new" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-brand-ink">
          New offer
        </Link>
      )}
      {offers.isPending ? (
        <Loading />
      ) : offers.isError && !offers.data ? (
        <ErrorState message={messageOf(offers.error)} onRetry={() => offers.refetch()} />
      ) : offers.data.length === 0 ? (
        <EmptyState title="No offers yet" body={owner ? 'Make one when you have quiet days or hours to fill.' : undefined} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Offers">
          {offers.data.map((o) => (
            <OfferItem key={o.offer.id} o={o} names={names} owner={owner} />
          ))}
        </ul>
      )}
    </Page>
  )
}

function OfferItem({ o, names, owner }: { o: OwnerOffer; names: Map<string, string>; owner: boolean }) {
  const qc = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  // Each step's buttons replace the last ones: the focus moves to what replaced them, never to the page top
  const endButton = useRef<HTMLButtonElement>(null)
  const question = useRef<HTMLDivElement>(null)
  const done = useRef<HTMLParagraphElement>(null)
  const [focus, setFocus] = useState<'question' | 'end' | 'done' | null>(null)
  useEffect(() => {
    const el = focus === 'question' ? question.current : focus === 'end' ? endButton.current : focus === 'done' ? done.current : null
    el?.focus()
  }, [focus, asking, ended])
  const state = STATE[o.state]
  async function end() {
    setBusy(true)
    setError(null)
    try {
      await offersApi.end(o.offer.id)
      setAsking(false)
      setEnded(true)
      setFocus('done')
    } catch (e) {
      setError(messageOf(e))
      setFocus('question')   // the buttons were disabled while busy: back to them, with the reason below
    } finally {
      await refreshOffers(qc)   // ended meanwhile (409 OFFER_OVER) shows as ended too
      setBusy(false)
    }
  }
  return (
    <li>
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-semibold">{o.offer.percentOff}% off</p>
          <Pill tone={state.tone}>{o.endedAt ? 'Ended early' : state.text}</Pill>
        </div>
        <p className="text-sm">{offerWhat(o.offer, names)}</p>
        <p className="text-sm text-muted">{offerWhen(o.offer)}</p>
        <p className="text-sm text-muted">
          Sent to {o.notified} customer{o.notified === 1 ? '' : 's'} · {o.bookings} booking{o.bookings === 1 ? '' : 's'}
        </p>
        {owner && o.state !== 'ENDED' && !asking && (
          <Button
            ref={endButton}
            variant="secondary"
            onClick={() => {
              setAsking(true)
              setFocus('question')
            }}
          >
            End offer now
          </Button>
        )}
        {ended && (
          <p ref={done} tabIndex={-1} role="status" className="text-sm outline-none">
            Offer ended. New bookings are at the normal price.
          </p>
        )}
        {asking && (
          <div ref={question} tabIndex={-1} className="flex flex-col gap-2 outline-none" role="group" aria-label="End this offer?">
            <p className="text-sm">New bookings will be at the normal price. Bookings already made keep the offer price.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" busy={busy} onClick={end}>
                Yes, end it
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setAsking(false)
                  setFocus('end')
                }}
              >
                Keep it
              </Button>
            </div>
          </div>
        )}
        {error && <Banner tone="bad">{error}</Banner>}
      </Card>
    </li>
  )
}
