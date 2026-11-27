import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PhotoGuide, type GuideKind } from './Guides'

const KINDS: GuideKind[] = ['list', 'pack', 'loose', 'face', 'shopFront', 'video', 'fssai', 'shopLicence']

describe('"Like this / Not like this" before a photo or paper (F-08)', () => {
  it.each(KINDS)('%s: two drawings, each named for a screen reader, with its words and a tip', (kind) => {
    render(<PhotoGuide kind={kind} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(2)
    for (const img of imgs) expect(img.getAttribute('aria-label')).not.toMatch(/^kiranaSetup\./)
    expect(screen.getByText('✓ Like this')).toBeInTheDocument()
    expect(screen.getByText('✗ Not like this')).toBeInTheDocument()
    expect(screen.getByText('Before you take it')).toBeInTheDocument()
  })

  it('every guide has its words in all six languages', () => {
    for (const lang of ['en', 'hi', 'te', 'mr', 'ta', 'kn']) {
      const texts = JSON.parse(readFileSync(join(process.cwd(), `src/i18n/${lang}/kiranaSetup.json`), 'utf8')) as Record<string, string>
      for (const kind of KINDS) for (const part of ['good', 'bad', 'tip']) expect(texts[`guide_${kind}_${part}`], `${lang} ${kind} ${part}`).toBeTruthy()
    }
  })
})
