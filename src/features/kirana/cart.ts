import { create } from 'zustand'
import type { BillResult } from '../../api/kirana'
import { newCart, type Cart } from '../../lib/kirana'
import { storage } from '../../lib/storage'

/**
 * The bill being made at the counter, kept on this phone (a reload, a call coming in or the app going to the back
 * never loses a half-made bill), one per person and shop (`adp.kiranaCart.<user>:<shop>`): on a shared phone the next
 * person never gets it and never overwrites it (an unsure one waiting for its safe retry stays), and signing out
 * forgets it.
 */
const PREFIX = 'adp.kiranaCart.'
const keyOf = (owner: string) => PREFIX + owner

interface Saved {
  owner: string
  cart: Cart
}

interface CartState {
  owner: string | null
  cart: Cart
  /** Loads this person's cart in this shop (a new one if none, or someone else's was there). */
  open: (owner: string) => void
  set: (change: (c: Cart) => Cart) => void
  /** After a bill is saved: an empty cart with a new clientRef. */
  clear: () => void
  /**
   * The last bill saved here, until its receipt is closed: kept outside the screen, so leaving the counter while Save
   * was on its way still shows the receipt (and its UPI QR) on coming back. Never kept on the phone.
   */
  receipt: BillResult | null
  setReceipt: (r: BillResult | null) => void
}

function read(owner: string): Cart {
  const saved = storage.getJson<Saved>(keyOf(owner))
  if (!saved || saved.owner !== owner || !saved.cart || !Array.isArray(saved.cart.lines) || !saved.cart.clientRef) return newCart()
  return { ...newCart(), ...saved.cart }
}

export const useCart = create<CartState>((set, get) => ({
  owner: null,
  cart: newCart(),
  receipt: null,
  setReceipt: (receipt) => set({ receipt }),
  open: (owner) => {
    if (get().owner === owner) return
    set({ owner, cart: read(owner), receipt: null })
  },
  set: (change) => {
    const { owner, cart } = get()
    const next = change(cart)
    if (owner) storage.setJson(keyOf(owner), { owner, cart: next } satisfies Saved)
    set({ cart: next })
  },
  clear: () => {
    const { owner } = get()
    const next = newCart()
    if (owner) storage.setJson(keyOf(owner), { owner, cart: next } satisfies Saved)
    set({ cart: next })
  },
}))

/** Whose cart: the person and the shop (a helper moving to another shop starts fresh). */
export function cartOwner(userId: string, shopId: string): string {
  return `${userId}:${shopId}`
}

/**
 * Signing out (or the session ending) forgets the bill being made, unless its Save may have gone through (unsure): that
 * one stays, tagged with its person and shop, so signing in again offers the same safe retry instead of billing twice.
 * Nobody else ever gets it (another person or shop starts a new cart).
 */
export function forgetCart() {
  storage.remove('adp.kiranaCart')   // 0.28.0 before one cart per person: never read again
  for (const key of cartKeys()) {
    if (!storage.getJson<Saved>(key)?.cart?.unsure) storage.remove(key)
  }
  useCart.setState({ owner: null, cart: newCart(), receipt: null })
}

function cartKeys(): string[] {
  try {
    return Object.keys(window.localStorage).filter((k) => k.startsWith(PREFIX))
  } catch {
    return []
  }
}
