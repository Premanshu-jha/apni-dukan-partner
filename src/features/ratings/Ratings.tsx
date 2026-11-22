import { useRatings } from '../../api/salon'
import { messageOf } from '../../api/errors'
import type { RatingSummary, RatingTag, SalonRating } from '../../api/types'
import { Banner, Button, Card, EmptyState, ErrorState, Loading, Page } from '../../components/ui'
import { useT } from '../../i18n'
import { dateTimeIst } from '../../lib/ist'
import { useLocation } from 'react-router'
import { cameFrom } from '../shop/Register'

/** Each tag's words, as a key (translated where shown, so they follow the language). */
export const TAG_LABELS: Record<RatingTag, string> = {
  ON_TIME: 'ratings.tagOnTime',
  CLEAN: 'ratings.tagClean',
  FRIENDLY: 'ratings.tagFriendly',
  SKILLED: 'ratings.tagSkilled',
  GOOD_VALUE: 'ratings.tagGoodValue',
}

/** "★★★★☆" for 4 stars, with the number spoken for screen readers. */
export function Stars({ stars }: { stars: number }) {
  const t = useT()
  return (
    <span role="img" aria-label={t('ratings.starsOutOf5', { stars })} className="text-accent">
      <span aria-hidden>{'★'.repeat(stars) + '☆'.repeat(5 - stars)}</span>
    </span>
  )
}

/**
 * Ratings (owner and helpers): what customers said after their online bookings, newest first, with the comments only
 * the salon sees. Customers see the average from 5 ratings on.
 */
export function Ratings() {
  const t = useT()
  const ratings = useRatings()
  const location = useLocation()
  const pages = ratings.data?.pages ?? []
  const summary = pages[0]?.summary ?? null
  const items = pages.flatMap((p) => p.items)
  return (
    // Back where it was opened from (the Salon tab, More), else More
    <Page back={cameFrom(location, '/more')} title={t('ratings.title')}>
      {ratings.isPending ? (
        <Loading />
      ) : ratings.isError && !ratings.data ? (
        <ErrorState message={messageOf(ratings.error)} onRetry={() => ratings.refetch()} />
      ) : (
        <>
          {summary && <Summary summary={summary} />}
          {items.length === 0 ? (
            <EmptyState
              title={t('ratings.noneTitle')}
              body={t('ratings.noneBody')}
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
              {t('ratings.showMore')}
            </Button>
          )}
        </>
      )}
    </Page>
  )
}

function Summary({ summary }: { summary: RatingSummary }) {
  const t = useT()
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-2xl font-semibold">
        {summary.average === null ? '–' : summary.average.toFixed(1)} <span className="text-base text-accent">★</span>
      </p>
      <p className="text-sm text-muted">
        {summary.count > 0 && summary.count < 5
          ? t('ratings.countNew', { count: summary.count })
          : t('ratings.count', { count: summary.count })}
      </p>
      {summary.tags.length > 0 && (
        <p className="text-sm">{summary.tags.map((tag) => `${TAG_LABELS[tag.tag] ? t(TAG_LABELS[tag.tag]) : tag.label} (${tag.count})`).join(' · ')}</p>
      )}
    </Card>
  )
}

function RatingItem({ r }: { r: SalonRating }) {
  const t = useT()
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <Stars stars={r.stars} />
        <span className="text-xs text-muted">{dateTimeIst(r.ratedAt)}</span>
      </div>
      <p className="text-sm">
        {r.customerName ?? t('ratings.customer')} · {r.services.join(', ')} · #{r.bookingNo}
      </p>
      {r.tags.length > 0 && <p className="text-sm text-muted">{r.tags.map((tag) => t(TAG_LABELS[tag])).join(' · ')}</p>}
      {r.comment && <p className="whitespace-pre-wrap break-words">“{r.comment}”</p>}
      <p className="text-xs text-muted">{t('ratings.visit', { when: dateTimeIst(r.visitAt) })}</p>
    </li>
  )
}
