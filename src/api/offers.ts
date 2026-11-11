import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from './client'

/** A salon offer as the backend sends it (SalonOfferResponses.OfferView). Dates are India yyyy-MM-dd. */
export type OfferView = {
  id: string
  percentOff: number
  allServices: boolean
  /** The services it covers; empty when allServices */
  serviceIds: string[]
  startsOn: string
  endsOn: string
  /** Each day from ("HH:mm"); null: all day */
  from: string | null
  until: string | null
}

export type OfferState = 'RUNNING' | 'UPCOMING' | 'ENDED'

/** An offer in the owner's list (SalonOfferResponses.OwnerOffer). */
export type OwnerOffer = {
  offer: OfferView
  state: OfferState
  createdAt: string
  /** Set when the owner ended it early */
  endedAt: string | null
  /** How many customers the message went to */
  notified: number
  /** Bookings made with it (not cancelled) */
  bookings: number
}

/** What the owner sends to preview or publish (SalonOfferRequests.NewOffer). Empty serviceIds: all services. */
export type NewOffer = {
  percentOff: number
  serviceIds: string[]
  startsOn: string
  endsOn: string
  from?: string
  until?: string
}

export type PricedService = { serviceId: string; name: string; pricePaise: number; offerPricePaise: number; priceIsFrom: boolean }

/** What publishing would do (SalonOfferResponses.OfferPreview). */
export type OfferPreview = { services: PricedService[]; customers: number }

const O = '/api/v1/salon/offers'

export const offersApi = {
  list: () => api<OwnerOffer[]>('GET', O),
  preview: (o: NewOffer) => api<OfferPreview>('POST', `${O}/preview`, { body: o }),
  publish: (o: NewOffer) => api<OwnerOffer>('POST', O, { body: o }),
  end: (id: string) => api<OwnerOffer>('POST', `${O}/${id}/end`),
}

export const offerKeys = { list: ['salon', 'offers'] as const }

export const useOffers = () => useQuery({ queryKey: offerKeys.list, queryFn: offersApi.list })

/** After publishing or ending: the list is read again (the new state, the bookings). */
export function refreshOffers(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: offerKeys.list })
}
