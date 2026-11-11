import { useRatings } from '../../api/salon'
import { messageOf } from '../../api/errors'
import type { RatingSummary, RatingTag, SalonRating } from '../../api/types'
import { Banner, Button, Card, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { dateTimeIst } from '../../lib/ist'

export const TAG_LABELS: Record<RatingTag, string> = {
  ON_TIME: 'On time',
  CLEAN: 'Clean',
  FRIENDLY: 'Friendly',
  SKILLED: 'Skilled',
  GOOD_VALUE: 'Good value',
}

/** "★★★★☆" for 4 stars, with the number spoken for screen readers. */
export function Stars({ stars }: { stars: number }) {
  return (
    <span role="img" aria-label={`${stars} out of 5 stars`} className="text-accent">
      <span aria-hidden>{'★'.repeat(stars) + '☆'.repeat(5 - stars)}</span>
    </span>
  )
}

/**
 * Ratings (owner and helpers): what customers said after their online bookings, newest first, with the comments only
 * the salon sees. Customers see the average from 5 ratings on.
 */
export function Ratings() {
  const ratings = useRatings()
  const pages = ratings.data?.pages ?? []
  const summary = pages[0]?.summary ?? null
  const items = pages.flatMap((p) => p.items)
  return (
    <Page back="/more" title="Ratings">
      {ratings.isPending ? (
        <Loading />
      ) : ratings.isError && !ratings.data ? (
        <ErrorState message={messageOf(ratings.error)} onRetry={() => ratings.refetch()} />
      ) : (
        <>
          {summary && <Summary summary={summary} />}
          {items.length === 0 ? (
            <EmptyState
              title="No ratings yet"
              body="Customers can rate a visit after an online booking ends. They get a message asking them to."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((r) => (
                <RatingItem key={r.bookingId} r={r} />
              ))}
            </ul>
          )}
          {ratings.isFetchNextPageError && <Banner tone="bad">{messageOf(ratings.error)}</Banner>}
          {ratings.hasNextPage && (
            <Button variant="secondary" busy={ratings.isFetchingNextPage} onClick={() => ratings.fetchNextPage()}>
              Show more
            </Button>
          )}
        </>
      )}
    </Page>
  )
}

function Summary({ summary }: { summary: RatingSummary }) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-2xl font-semibold">
        {summary.average === null ? '–' : summary.average.toFixed(1)} <span className="text-base text-accent">★</span>
      </p>
      <p className="text-sm text-muted">
        {summary.count} rating{summary.count === 1 ? '' : 's'}
        {summary.count > 0 && summary.count < 5 && ' · customers see "New" until you have 5'}
      </p>
      {summary.tags.length > 0 && (
        <p className="text-sm">{summary.tags.map((t) => `${t.label} (${t.count})`).join(' · ')}</p>
      )}
    </Card>
  )
}

function RatingItem({ r }: { r: SalonRating }) {
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <Stars stars={r.stars} />
        <span className="text-xs text-muted">{dateTimeIst(r.ratedAt)}</span>
      </div>
      <p className="text-sm">
        {r.customerName ?? 'Customer'} · {r.services.join(', ')} · #{r.bookingNo}
      </p>
      {r.tags.length > 0 && <p className="text-sm text-muted">{r.tags.map((t) => TAG_LABELS[t]).join(' · ')}</p>}
      {r.comment && <p className="whitespace-pre-wrap break-words">“{r.comment}”</p>}
      <p className="text-xs text-muted">Visit: {dateTimeIst(r.visitAt)}</p>
    </li>
  )
}
