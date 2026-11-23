import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * Paying the subscription in the Play Store app (user choice billing, India): Google's own choice screen, where the
 * owner picks Razorpay (then the app opens Razorpay's checkout, as on the website) or Google Play (Google charges).
 * The native side is android/app/src/main/java/com/clozest/partner/PlayBillingPlugin.java. Never used on the
 * website (the screens ask isApp() first).
 */

/** A Google Play purchase on this phone. */
export interface PlayPurchase {
  purchaseToken: string
  acknowledged?: boolean
  /** Google is still waiting for the money (a slow UPI payment): not paid yet */
  pending?: boolean
}

/** What the owner picked on Google's choice screen. */
export type InAppChoice =
  | { choice: 'RAZORPAY'; externalTransactionToken: string }
  | ({ choice: 'GOOGLE_PLAY' } & PlayPurchase)
  | { choice: 'CANCELLED' }

interface PlayBillingPlugin {
  subscribe(options: { productId: string; accountId: string }): Promise<InAppChoice>
  purchases(options: { productId: string }): Promise<{ purchases: PlayPurchase[] }>
  addListener(event: 'purchase', listener: (p: PlayPurchase) => void): Promise<PluginListenerHandle>
}

const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling')

/**
 * Opens Google's choice screen for the salon's subscription ({@code productId}, bought for {@code shopId}, so Google
 * and the backend know whose it is). Google Play charges at once (no free trial: the app offers paying only once the
 * salon's free or paid time is over). Rejects with an Error whose `code` is the native code (BILLING_UNAVAILABLE,
 * NO_PRODUCT, UNAVAILABLE, BUSY, ALREADY_OWNED, ...).
 */
export function chooseInApp(productId: string, shopId: string): Promise<InAppChoice> {
  return PlayBilling.subscribe({ productId, accountId: shopId })
}

/**
 * This phone's Google Play purchases of the product that the backend may not have yet (not acknowledged): one paid
 * while the network dropped, or the app closed, or a slow payment finished later. Empty when Google Play can't say.
 */
export async function unconfirmedPurchases(productId: string): Promise<PlayPurchase[]> {
  try {
    const { purchases } = await PlayBilling.purchases({ productId })
    return purchases.filter((p) => !p.acknowledged && !p.pending)
  } catch {
    return []
  }
}

/** A Google Play payment that finished while no choice screen was waiting for it (pending, then paid). */
export function onLatePurchase(listener: (p: PlayPurchase) => void): () => void {
  const handle = PlayBilling.addListener('purchase', listener)
  return () => {
    void handle.then((h) => h.remove())
  }
}

/** The Play Store's page for this subscription, where the owner changes the payment method or cancels. */
export function playSubscriptionsUrl(productId: string): string {
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=com.clozest.partner`
}

/** The native error's code, if it has one. */
export function inAppErrorCode(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}
