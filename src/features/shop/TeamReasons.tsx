import { Link } from 'react-router'
import { hasText, t, useT } from '../../i18n'

/** The field team's fixed reasons (ReviewReason codes), as the backend sends them. */
export const REVIEW_REASONS = [
  'SHOP_FRONT_PHOTO',
  'BOARD_NOT_VISIBLE',
  'INSIDE_PHOTOS',
  'LICENCE_UNREADABLE',
  'LICENCE_NAME_MISMATCH',
  'LICENCE_EXPIRED',
  'LICENCE_WRONG_TYPE',
  'ADDRESS_WRONG',
  'PIN_WRONG_PLACE',
  'SERVICES_MISSING',
  'HOURS_MISSING',
  'VIDEO_UNCLEAR',
  'OWNER_NAME',
  'OTHER',
] as const

/** A reason in the reader's language; a code this app doesn't know yet (a newer backend's) reads as "Something else". */
export function reasonText(code: string): string {
  const key = `review.reason${code}`
  return t(hasText(key) ? key : 'review.reasonOTHER')
}

/** What the field team asked: their reason codes and note, or null when they asked nothing. */
export interface TeamAsk {
  codes: string[]
  note: string | null
}

export function teamAsk(codes: string[] | null | undefined, note: string | null | undefined): TeamAsk | null {
  const list = (codes ?? []).filter((c) => typeof c === 'string' && c.length > 0)
  const text = note?.trim() ? note : null
  return list.length || text ? { codes: list, note: text } : null
}

/** The shop's: why it was sent back (or a fix asked for on a re-check). */
export function shopAsk(shop: { statusReason: string | null; statusReasonCodes?: string[] }): TeamAsk | null {
  return teamAsk(shop.statusReasonCodes, shop.statusReason)
}

/** Where each reason is fixed (null: nowhere in particular, "Something else"). */
type FixPlace = 'details' | 'address' | 'photos' | 'document' | 'services' | 'hours'

const FIX_PLACES: Record<string, FixPlace> = {
  SHOP_FRONT_PHOTO: 'photos',
  BOARD_NOT_VISIBLE: 'photos',
  INSIDE_PHOTOS: 'photos',
  VIDEO_UNCLEAR: 'photos',
  LICENCE_UNREADABLE: 'document',
  LICENCE_NAME_MISMATCH: 'document',
  LICENCE_EXPIRED: 'document',
  LICENCE_WRONG_TYPE: 'document',
  ADDRESS_WRONG: 'address',
  PIN_WRONG_PLACE: 'address',
  OWNER_NAME: 'details',
  SERVICES_MISSING: 'services',
  HOURS_MISSING: 'hours',
}

/** The shop as far as where its fixes are made depends on it. */
export interface FixShop {
  status: string
  addressLocked?: boolean
}

/**
 * The page where a reason is fixed: in a draft (sent back) the registration step (1 details and address, 2 photos,
 * video and trade licence, 3 services, 4 hours); after registration the Salon tab's page. An address the field team
 * verified is theirs to change: asked for at /setup/address (also from a sent-back draft). Null: no one place.
 */
export function fixPath(code: string, shop: FixShop): string | null {
  const place = FIX_PLACES[code]
  if (!place) return null
  if (place === 'address' && shop.addressLocked) return '/setup/address'
  if (shop.status === 'DRAFT') {
    return { details: '/register', address: '/register', photos: '/register/photos', document: '/register/photos', services: '/register/services', hours: '/register/hours' }[place]
  }
  return { details: '/setup/details', address: '/setup/details', photos: '/setup/photos', document: '/setup/document', services: '/setup/services', hours: '/setup/hours' }[place]
}

/**
 * The field team's reasons as a list of what to fix, each in the reader's language, then their own words under "Note
 * from the team" (as they wrote them: never translated). With {@code fixes}: each reason has a "Fix ›" link to the page
 * where it is fixed, and those fixed on the page open now ({@code here}) come first, without a link.
 */
export function TeamReasons({ ask, fixes }: { ask: TeamAsk; fixes?: { shop: FixShop; here?: string } }) {
  const t = useT()
  const codes = [...new Set(ask.codes)]
  const pathOf = (code: string) => (fixes ? fixPath(code, fixes.shop) : null)
  const here = fixes?.here
  // Stable: the page's own reasons first, the rest in the team's order
  if (here) codes.sort((a, b) => Number(pathOf(b) === here) - Number(pathOf(a) === here))
  return (
    <div className="flex flex-col gap-1 text-sm">
      {codes.length > 0 && (
        <>
          <p className="font-semibold">{t('review.whatToFix')}</p>
          <ul className="list-disc pl-5" aria-label={t('review.whatToFix')}>
            {codes.map((code) => {
              const path = pathOf(code)
              return (
                <li key={code} data-code={code}>
                  {path && path !== here ? (
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">{reasonText(code)}</span>
                      <Link
                        to={path}
                        state={{ from: here ?? window.location.pathname }}
                        aria-label={t('review.fixAria', { reason: reasonText(code) })}
                        className="-my-2 inline-flex min-h-11 shrink-0 items-center px-1 font-semibold text-link underline"
                      >
                        {t('review.fixLink')}
                      </Link>
                    </span>
                  ) : (
                    reasonText(code)
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {ask.note && (
        <>
          <p className="mt-1 font-semibold">{t('review.noteFromTeam')}</p>
          <p className="break-words whitespace-pre-line">{ask.note}</p>
        </>
      )}
    </div>
  )
}
