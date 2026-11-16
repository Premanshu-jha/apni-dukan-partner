import { describe, expect, it } from 'vitest'
import { caddyHeaders, securityHeaders } from '../security-headers'

const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''

describe('the security headers and R2', () => {
  it('without PHOTO_ORIGIN, any R2 address may be used for photos, the video upload and playback', () => {
    const csp = securityHeaders({ VITE_API_URL: 'https://api.example.com' })['Content-Security-Policy']
    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://api.example.com https://*.r2.cloudflarestorage.com https://api.razorpay.com https://lumberjack.razorpay.com",
    )
    expect(directive(csp, 'media-src')).toBe("media-src 'self' blob: https://*.r2.cloudflarestorage.com")
  })

  it('a set PHOTO_ORIGIN (production: the account’s exact R2 address) replaces the wildcard everywhere', () => {
    const exact = 'https://abc123.r2.cloudflarestorage.com'
    const csp = securityHeaders({ VITE_API_URL: 'https://api.example.com', PHOTO_ORIGIN: exact })['Content-Security-Policy']
    expect(csp).not.toContain('*.r2.cloudflarestorage.com')
    expect(directive(csp, 'connect-src')).toBe(
      `connect-src 'self' https://api.example.com ${exact} https://api.razorpay.com https://lumberjack.razorpay.com`,
    )
    expect(directive(csp, 'media-src')).toBe(`media-src 'self' blob: ${exact}`)
    expect(directive(csp, 'img-src')).toContain(exact)
  })

  it('Razorpay’s checkout (the salon subscription) may load its script, frames, calls and images, nothing more', () => {
    const headers = securityHeaders({ VITE_API_URL: 'https://api.example.com' })
    const csp = headers['Content-Security-Policy']
    expect(directive(csp, 'script-src')).toBe("script-src 'self' https://checkout.razorpay.com")
    expect(directive(csp, 'frame-src')).toBe('frame-src https://api.razorpay.com https://checkout.razorpay.com')
    expect(directive(csp, 'img-src')).toContain('https://cdn.razorpay.com')
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
    expect(headers['Permissions-Policy']).toContain('payment=(self "https://api.razorpay.com")')
    // On Railway (Caddy): that value in backticks, so its quotes don't split it; the others as before
    const caddy = caddyHeaders(headers)
    expect(caddy).toContain('\tPermissions-Policy `geolocation=(self), camera=(), microphone=(), payment=(self "https://api.razorpay.com")')
    expect(caddy).toContain('\tX-Content-Type-Options "nosniff"')
    // With Turnstile on, both
    const withTurnstile = securityHeaders({ VITE_API_URL: 'https://api.example.com', VITE_TURNSTILE_SITE_KEY: 'k' })['Content-Security-Policy']
    expect(directive(withTurnstile, 'frame-src')).toBe(
      'frame-src https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com',
    )
  })
})
