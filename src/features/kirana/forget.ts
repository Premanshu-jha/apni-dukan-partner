import { forgetCart } from './cart'
import { forgetProductDraft } from './drafts'

/** Signing out (or the session ending): the counter's bill being made and a new product's typing are forgotten here. */
export function forgetKiranaHere() {
  forgetCart()
  forgetProductDraft()
}
