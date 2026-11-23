import { isApp } from './platform'
import type { SubscriptionCheckout } from '../api/types'
import { language, t } from '../i18n'

/** Razorpay's checkout script (Standard Checkout). Allowed by the CSP (security-headers.ts). */
export const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

/** What Razorpay's checkout gives the app when the owner approved the payment or AutoPay. */
export interface CheckoutAnswer {
  razorpay_payment_id: string
  razorpay_subscription_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', handler: (e: { error?: { description?: string } }) => void): void
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

/** Why the checkout didn't finish. */
export class CheckoutStopped extends Error {
  /** CLOSED: the owner closed it; FAILED: Razorpay said the payment failed (its words in message); LOAD: no script */
  readonly reason: 'CLOSED' | 'FAILED' | 'LOAD'

  constructor(reason: 'CLOSED' | 'FAILED' | 'LOAD', message: string) {
    super(message)
    this.reason = reason
  }
}

let loading: Promise<RazorpayConstructor> | null = null
/** A script request that neither loads nor fails (a stalled network) gives up after this long. */
export const LOAD_TIMEOUT_MS = 20_000

/** Loads the checkout script once (the end-to-end tests provide window.Razorpay themselves). */
export function loadCheckout(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (!loading) {
    loading = new Promise<RazorpayConstructor>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = CHECKOUT_SCRIPT
      script.async = true
      script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('no Razorpay')))
      script.onerror = () => reject(new Error('Razorpay script failed'))
      setTimeout(() => reject(new Error('Razorpay script took too long')), LOAD_TIMEOUT_MS)
      document.head.appendChild(script)
    }).catch((e: unknown) => {
      loading = null   // a later tap tries again (back online)
      throw new CheckoutStopped('LOAD', e instanceof Error ? e.message : String(e))
    })
  }
  return loading
}

/**
 * Opens Razorpay's checkout for the salon's subscription, in the app's name, logo and colour. Resolves with the
 * signed answer when the owner approves it; rejects with CheckoutStopped when it is closed or fails.
 */
export async function payWithRazorpay(c: SubscriptionCheckout, stillWanted: () => boolean = () => true): Promise<CheckoutAnswer> {
  const Razorpay = await loadCheckout()
  // The first load can take a while: if the owner has left the screen meanwhile, the sheet doesn't open over another
  if (!stillWanted()) throw new CheckoutStopped('CLOSED', 'Left the page')
  return new Promise<CheckoutAnswer>((resolve, reject) => {
    let failure: string | null = null
    const checkout = new Razorpay({
      key: c.keyId,
      subscription_id: c.subscriptionId,
      name: c.name,
      description: c.description,
      image: c.image,
      prefill: c.prefill,
      theme: { color: c.themeColor },
      // Inside the Play Store app: UPI apps (GPay, PhonePe...) open by intent for the AutoPay PIN (Razorpay's "UPI
      // intent in WebView"; the app's UpiIntentsPlugin starts them)
      ...(isApp() ? { webview_intent: true } : {}),
      handler: (answer: CheckoutAnswer) => resolve(answer),
      modal: {
        // Closed by the owner, or after a failure (Razorpay leaves its own error on screen until then)
        ondismiss: () => reject(new CheckoutStopped(failure ? 'FAILED' : 'CLOSED', failure ?? 'Closed')),
      },
    })
    checkout.on('payment.failed', (e) => {
      // Razorpay's own reason is in English: in another language, our words instead
      failure = (language() === 'en' && e.error?.description) || t('subscription.paymentFailed')
    })
    checkout.open()
  })
}
