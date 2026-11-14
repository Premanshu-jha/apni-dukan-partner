import type { ServiceItem, WalkInPrice } from '../api/types'

/** A service as the walk-in screen shows it: what it costs now, and its own price when an offer applies now. */
export interface PricedService {
  pricePaise: number
  /** Its own price when the salon's offer applies now; null otherwise. */
  listPricePaise: number | null
  /** When that offer's hours end today ("14:00"); null when none applies or it runs all day. */
  offerUntil: string | null
}

/**
 * The price now: from GET /salon/walk-ins/prices (the backend applies the salon's offer as it will when adding the
 * walk-in); while those aren't read (or couldn't be), the service's own price.
 */
export function priceNow(s: ServiceItem, prices: WalkInPrice[] | undefined): PricedService {
  const p = prices?.find((x) => x.serviceId === s.id)
  return p
    ? { pricePaise: p.pricePaise, listPricePaise: p.listPricePaise, offerUntil: p.listPricePaise != null ? (p.offerUntil ?? null) : null }
    : { pricePaise: s.pricePaise, listPricePaise: null, offerUntil: null }
}

/** The total of the services picked, as the screen shows it at the bottom while they are ticked and unticked. */
export interface WalkInTotal {
  count: number
  minutes: number
  /** What the customer pays now. */
  pricePaise: number
  /** What it would be without the offer, when an offer lowers the total now; null otherwise. */
  listPricePaise: number | null
  /** One of them can cost more at the salon ("from ₹…"). */
  priceIsFrom: boolean
  /** The earliest time today an offer on one of them ends ("14:00"); null when none ends today. */
  offerUntil: string | null
}

export function walkInTotal(chosen: ServiceItem[], prices: WalkInPrice[] | undefined): WalkInTotal {
  let pricePaise = 0
  let listPaise = 0
  let offerUntil: string | null = null
  for (const s of chosen) {
    const p = priceNow(s, prices)
    pricePaise += p.pricePaise
    listPaise += p.listPricePaise ?? p.pricePaise
    if (p.offerUntil && (offerUntil == null || p.offerUntil < offerUntil)) offerUntil = p.offerUntil
  }
  return {
    count: chosen.length,
    minutes: chosen.reduce((t, s) => t + s.durationMinutes, 0),
    pricePaise,
    listPricePaise: listPaise > pricePaise ? listPaise : null,
    priceIsFrom: chosen.some((s) => s.priceIsFrom),
    offerUntil,
  }
}
