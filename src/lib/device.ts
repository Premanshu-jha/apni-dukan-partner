import { storage } from './storage'

const KEY = 'adp.device'

/**
 * A name for this browser, sent with sign-in and refresh so the backend can list and sign out devices.
 * Made once and kept: "Chrome on Android · 4f2a".
 */
export function deviceName(): string {
  const saved = storage.get(KEY)
  if (saved) return saved
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iPhone'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'device'
  const tag = crypto.randomUUID().slice(0, 4)
  const name = `${browser} on ${os} · ${tag}`
  storage.set(KEY, name)
  return name
}

export type Platform = 'android' | 'ios' | 'desktop'

export function platform(): Platform {
  const ua = navigator.userAgent
  if (/Android/.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  return 'desktop'
}
