import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ app: false }))
vi.mock('../../lib/platform', () => ({ isApp: () => platform.app }))

const { AskOwner } = await import('./common')
const { forgetKiranaHere } = await import('./forget')

afterEach(() => {
  platform.app = false
  sessionStorage.clear()
})

describe('Ask the owner on WhatsApp (EF#12/13)', () => {
  it('opens a new tab on the website', () => {
    render(<AskOwner message="Please change bill 12 in the Clozest Partner app." />)
    const link = screen.getByRole('link', { name: 'Ask the owner on WhatsApp' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('href')).toContain('Clozest%20Partner%20app')
  })
  it('is a plain link in the Play Store app (a new tab does nothing in its WebView)', () => {
    platform.app = true
    render(<AskOwner message="x" />)
    expect(screen.getByRole('link', { name: 'Ask the owner on WhatsApp' })).not.toHaveAttribute('target')
  })
})

describe('signing out (AB#8)', () => {
  it("forgets the setup's typing, its sends waiting for an answer and a khata bill waiting; nothing else", () => {
    sessionStorage.setItem('adp.kiranaLine.l1', '{"count":"12"}')
    sessionStorage.setItem('adp.kiranaRef.count.p1.12000', 'ref')
    sessionStorage.setItem('adp.kiranaKhataReturn', '{"customerId":"c1"}')
    sessionStorage.setItem('other.key', 'kept')
    forgetKiranaHere()
    expect(sessionStorage.getItem('adp.kiranaLine.l1')).toBeNull()
    expect(sessionStorage.getItem('adp.kiranaRef.count.p1.12000')).toBeNull()
    expect(sessionStorage.getItem('adp.kiranaKhataReturn')).toBeNull()
    expect(sessionStorage.getItem('other.key')).toBe('kept')
  })
})
