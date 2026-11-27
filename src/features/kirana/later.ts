import { useSyncExternalStore } from 'react'
import { storage } from '../../lib/storage'

/**
 * Barcodes billed at the counter without a product ("Bill it now, add the product later", F-11), kept on this phone per
 * shop until a product gets them: Products lists them, each one tap from "Add a product" with the barcode filled in.
 * At most 50, newest first (an old one drops off).
 */
const MAX = 50
const key = (shopId: string) => `adp.kiranaLater.${shopId}`
const listeners = new Set<() => void>()
const cache = new Map<string, string[]>()

function read(shopId: string): string[] {
  if (!cache.has(shopId)) cache.set(shopId, storage.getJson<string[]>(key(shopId)) ?? [])
  return cache.get(shopId)!
}

function write(shopId: string, codes: string[]) {
  cache.set(shopId, codes)
  if (codes.length) storage.setJson(key(shopId), codes)
  else storage.remove(key(shopId))
  listeners.forEach((l) => l())
}

export function keepForLater(shopId: string, code: string) {
  write(shopId, [code, ...read(shopId).filter((c) => c !== code)].slice(0, MAX))
}

export function forgetLater(shopId: string, code: string) {
  if (read(shopId).includes(code)) write(shopId, read(shopId).filter((c) => c !== code))
}

export function useLaterBarcodes(shopId: string): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => read(shopId),
  )
}
