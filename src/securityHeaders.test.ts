import { describe, expect, it } from 'vitest'
import { securityHeaders } from '../security-headers'

const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? ''

describe('the security headers and R2', () => {
  it('without PHOTO_ORIGIN, any R2 address may be used for photos, the video upload and playback', () => {
    const csp = securityHeaders({ VITE_API_URL: 'https://api.example.com' })['Content-Security-Policy']
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://api.example.com https://*.r2.cloudflarestorage.com")
    expect(directive(csp, 'media-src')).toBe("media-src 'self' blob: https://*.r2.cloudflarestorage.com")
  })

  it('a set PHOTO_ORIGIN (production: the account’s exact R2 address) replaces the wildcard everywhere', () => {
    const exact = 'https://abc123.r2.cloudflarestorage.com'
    const csp = securityHeaders({ VITE_API_URL: 'https://api.example.com', PHOTO_ORIGIN: exact })['Content-Security-Policy']
    expect(csp).not.toContain('*.r2.cloudflarestorage.com')
    expect(directive(csp, 'connect-src')).toBe(`connect-src 'self' https://api.example.com ${exact}`)
    expect(directive(csp, 'media-src')).toBe(`media-src 'self' blob: ${exact}`)
    expect(directive(csp, 'img-src')).toContain(exact)
  })
})
