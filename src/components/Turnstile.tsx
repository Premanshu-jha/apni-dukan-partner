import { useEffect, useRef } from 'react'

import { turnstileLanguage, useLanguage, useT } from '../i18n'
import { TURNSTILE_SITE_KEY } from '../lib/config'

/** The Cloudflare "not a robot" check. With no site key set (local backend without a secret) it does nothing. */

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** Calls onToken with a fresh token, or null when it expires. Change `resetKey` to get a new token. */
export function Turnstile({ onToken, resetKey = 0 }: { onToken: (t: string | null) => void; resetKey?: number }) {
  const t = useT()
  const lang = useLanguage()
  const words = turnstileLanguage(lang)
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const callback = useRef(onToken)
  useEffect(() => {
    callback.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    const state = { cancelled: false }
    loadScript()
      .then(() => {
        if (state.cancelled || !box.current || !window.turnstile) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          language: words,
          callback: (t: string) => callback.current(t),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        })
      })
      .catch(() => callback.current(null))
    return () => {
      state.cancelled = true
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [words]) // drawn again in the new language (a token it already gave still works)

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current)
      callback.current(null)
    }
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return (
    <div>
      <div ref={box} className="min-h-16" />
      {/* Cloudflare has no words in this language: say so in it, so the English box isn't a surprise */}
      {lang !== 'en' && words === 'en' && <p className="mt-1 text-xs text-muted">{t('auth.turnstileEnglish')}</p>}
    </div>
  )
}
