import type { Unit } from '../../api/kirana'

/** Add a product's typing, kept in this tab until it is saved (leaving the screen loses nothing). */
export interface ProductDraft {
  name: string
  unit: Unit
  price: string
  barcode: string
  pack: string
  stock: string
  alertAt: string
}

const PRODUCT_DRAFT = 'adp.kiranaNewProduct'

export function readProductDraft(): ProductDraft | null {
  try {
    const raw = sessionStorage.getItem(PRODUCT_DRAFT)
    return raw ? (JSON.parse(raw) as ProductDraft) : null
  } catch {
    return null
  }
}

export function writeProductDraft(d: ProductDraft | null) {
  try {
    if (d) sessionStorage.setItem(PRODUCT_DRAFT, JSON.stringify(d))
    else sessionStorage.removeItem(PRODUCT_DRAFT)
  } catch {
    /* storage blocked: the typing stays on this screen only */
  }
}

/** Signing out: the next person on this phone never gets it. */
export function forgetProductDraft() {
  writeProductDraft(null)
}
