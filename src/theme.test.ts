/// <reference types="node" />
import { readFileSync } from 'node:fs'

// Read from disk: Vitest hands CSS imports (even ?raw) to tests as empty strings.
const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf8')
const offline = readFileSync(`${process.cwd()}/public/offline.css`, 'utf8')

/** The theme's colours (src/index.css) must keep text and buttons readable: WCAG AA, 4.5:1 for text, 3:1 for borders. */
const vars = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `fg` at `alpha` over `bg`, as Tailwind's `bg-brand/15` paints it. */
function tint(fg: string, bg: string, alpha: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  return `#${[1, 3, 5].map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`
}

const SURFACES = ['bg', 'surface', 'raised'] as const

test('the theme defines every role colour', () => {
  for (const name of ['bg', 'surface', 'raised', 'line', 'ink', 'muted', 'brand', 'brand-ink', 'link', 'accent', 'good', 'warn', 'bad', 'scrim'])
    expect(vars[name], name).toMatch(/^#[0-9a-f]{6}$/i)
})

test.each(['ink', 'muted', 'link', 'accent', 'good', 'warn', 'bad'])('%s text is AA (4.5:1) on every surface and on its own 15% pill', (text) => {
  for (const s of SURFACES) {
    expect(contrast(vars[text], vars[s]), `${text} on ${s}`).toBeGreaterThanOrEqual(4.5)
    const pill = tint(text === 'link' ? vars.brand : vars[text], vars[s], 0.15)
    expect(contrast(vars[text], pill), `${text} on its pill over ${s}`).toBeGreaterThanOrEqual(4.5)
  }
})

test('buttons: brand-ink on brand is AA, and the brand blue (focus ring, borders) shows 3:1 on every surface', () => {
  expect(contrast(vars['brand-ink'], vars.brand)).toBeGreaterThanOrEqual(4.5)
  for (const s of SURFACES) expect(contrast(vars.brand, vars[s]), `brand on ${s}`).toBeGreaterThanOrEqual(3)
})

test('banners with navy text on a status colour are AA', () => {
  for (const c of ['good', 'warn', 'bad']) expect(contrast(vars.bg, vars[c]), c).toBeGreaterThanOrEqual(4.5)
})

test('the offline page uses the same colours', () => {
  for (const name of ['bg', 'ink', 'muted', 'brand']) expect(offline.toLowerCase()).toContain(vars[name].toLowerCase())
})
