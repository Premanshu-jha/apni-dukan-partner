import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { SubscriptionCheckout, SubscriptionView } from './types'

const S = '/api/v1/shops/me/subscription'

export const subscriptionKeys = {
  mine: ['shop', 'subscription'] as const,
}

/**
 * The salon's subscription: anyone in it sees it (checked again when the app comes back to the front). With
 * {@code watch}: read every 5 seconds meanwhile (just after a checkout, while Razorpay's word may still be coming).
 */
export function useSubscription(watch = false) {
  return useQuery({
    queryKey: subscriptionKeys.mine,
    queryFn: () => api<SubscriptionView>('GET', S),
    staleTime: 60_000,
    refetchInterval: watch ? 5_000 : false,
  })
}

/** Owner: the Razorpay subscription to open the checkout with (the same one again on a second tap). */
export function startCheckout(): Promise<SubscriptionCheckout> {
  return api<SubscriptionCheckout>('POST', `${S}/checkout`)
}

/** The checkout's signed answer, as the backend takes it. */
export interface PaymentAnswer {
  razorpayPaymentId: string
  razorpaySubscriptionId: string
  razorpaySignature: string
}

/** Owner: the checkout's signed answer; AutoPay shows as on at once. */
export function confirmPayment(answer: PaymentAnswer): Promise<SubscriptionView> {
  return api<SubscriptionView>('POST', `${S}/confirm`, { body: answer })
}
