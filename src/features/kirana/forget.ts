import { forgetCart } from './cart'
import { forgetProductDraft } from './drafts'

/** Keys of this tab's kirana typing and sends: a setup line's typing, sends waiting for their answer, a khata bill waiting. */
const TAB_KEYS = /^adp\.kirana(Line|Ref)\.|^adp\.kiranaKhataReturn$/

/**
 * Signing out (or the session ending): the counter's bill being made, a new product's typing, and the setup's typing
 * and pending sends are forgotten here, so the next person on a shared phone never gets them (AB#8).
 */
export function forgetKiranaHere() {
  forgetCart()
  forgetProductDraft()
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && TAB_KEYS.test(k)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* storage blocked: nothing was kept */
  }
}
