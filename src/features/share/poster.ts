/**
 * The counter poster: drawn on a canvas on this phone, the same picture shown on screen, downloaded as a PNG and
 * printed. Black on white only (a cheap ink-jet or a photocopy keeps it readable, and no ink goes on big coloured
 * areas), at 1748 × 2480 pixels: A5 at 300 dpi, A4 at about 210 dpi, both the same shape (1 : √2), so it fills either
 * sheet without cropping.
 */

export const POSTER_WIDTH = 1748
export const POSTER_HEIGHT = 2480

/** The poster's words, in the language chosen in the app. */
export interface PosterTexts {
  salon: string
  scan: string
  steps: [string, string, string]
  pay: string
  /** The link written out under everything, for someone whose camera can't read the code */
  link: string
}

/** How wide a text is at a font size (the canvas's measureText in the app; a fake in tests). */
export type Measure = (text: string, size: number) => number

/** The characters as a reader sees them: an Indian script's letter with its vowel sign is never cut in two. */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)
  }
  return Array.from(text)
}

/** Greedy word wrap; a single word wider than the line is broken between characters. */
function wrap(text: string, size: number, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/)) {
    const tried = line ? `${line} ${word}` : word
    if (measure(tried, size) <= maxWidth) {
      line = tried
      continue
    }
    if (line) lines.push(line)
    line = ''
    if (measure(word, size) <= maxWidth) {
      line = word
      continue
    }
    for (const ch of graphemes(word)) {
      if (line && measure(line + ch, size) > maxWidth) {
        lines.push(line)
        line = ch
      } else line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * The biggest of {@code sizes} (largest first) at which the text fits in {@code maxLines} lines of {@code maxWidth};
 * at the smallest it still doesn't, the last line ends in "…" (a very long name stays on the poster, shortened).
 */
export function fitLines(text: string, maxWidth: number, sizes: number[], maxLines: number, measure: Measure): { size: number; lines: string[] } {
  for (const size of sizes) {
    const lines = wrap(text, size, maxWidth, measure)
    if (lines.length <= maxLines) return { size, lines }
  }
  const size = sizes[sizes.length - 1]
  const lines = wrap(text, size, maxWidth, measure).slice(0, maxLines)
  let last = lines[maxLines - 1]
  while (last && measure(`${last}…`, size) > maxWidth) last = graphemes(last).slice(0, -1).join('')
  lines[maxLines - 1] = `${last.trimEnd()}…`
  return { size, lines }
}

const FONT = "Poppins, system-ui, 'Noto Sans', sans-serif"
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`
const INK = '#000000'
const PAPER = '#ffffff'

/** The quiet zone around the code, in modules: the 4 the QR standard asks for, so any phone camera finds it. */
export const QUIET_MODULES = 4

/** Where the link line's baseline sits: near the bottom frame, the same on every poster. */
export const LINK_BASELINE = POSTER_HEIGHT - 110
/** The room kept between "Pay at the salon" and the link line under it. */
const GAP_ABOVE_LINK = 40

/** One block of centred lines: its font size, its lines and each line's baseline. */
export interface PosterLines {
  size: number
  lines: string[]
  baselines: number[]
}

/** Where everything goes on the poster, worked out before anything is drawn (layoutPoster). */
export interface PosterLayout {
  name: PosterLines
  scan: PosterLines
  qr: { x: number; y: number; cell: number; side: number }
  steps: { size: number; x: number; width: number; centres: number[] }
  pay: PosterLines
  link: PosterLines
  /** The lowest point "Pay at the salon" can reach, and the highest the link line can (Indian scripts' marks too) */
  bottomOfPay: number
  topOfLink: number
}

/**
 * From roomy to tight: the first that ends above the link line is used. A long salon name (two lines) or a long scan
 * line (Tamil, Telugu, Kannada) takes height; the code and the steps' spacing give it back, never below a code a
 * phone reads easily from a counter (660 px: 56 mm on A5, 78 mm on A4).
 */
const LEVELS = [
  { name: [150, 135, 120, 105, 90, 80], scan: [96, 84, 72, 64], qr: 900, step: 100 },
  { name: [150, 135, 120, 105, 90, 80], scan: [96, 84, 72, 64], qr: 820, step: 96 },
  { name: [120, 105, 90, 80], scan: [84, 72, 64], qr: 780, step: 92 },
  { name: [105, 90, 80], scan: [72, 64], qr: 720, step: 88 },
  { name: [90, 80], scan: [64], qr: 660, step: 84 },
] as const

/** A letter's reach above its baseline and below it, as a share of the font size (generous for Indian scripts). */
const ASCENT = 1.0
const DESCENT = 0.4

/**
 * Lays the poster out for this text and a code of {@code modules} × {@code modules}: the salon's name (up to two
 * lines), "Scan to book your time" (up to two), the code, the three steps, "Pay at the salon", and the link written
 * out at the bottom. The heights are added up first, so "Pay at the salon" always ends above the link line however
 * long the name or the language's words are.
 */
export function layoutPoster(texts: PosterTexts, modules: number, measure: Measure): PosterLayout {
  const W = POSTER_WIDTH
  const inner = W - 2 * 150
  const linkFit = fitLines(texts.link, inner, [40, 34, 30, 26], 1, measure)
  const link: PosterLines = { ...linkFit, baselines: [LINK_BASELINE] }
  const topOfLink = LINK_BASELINE - Math.round(link.size * ASCENT)
  const pay0 = fitLines(texts.pay, inner, [64, 56, 48], 1, measure)
  const stepSizes = [64, 58, 52, 46, 40]
  const stepSize = stepSizes.find((size) => texts.steps.every((s) => measure(s, size) <= inner - 130)) ?? stepSizes[stepSizes.length - 1]

  let layout: PosterLayout | null = null
  for (const level of LEVELS) {
    const nameFit = fitLines(texts.salon, inner, [...level.name], 2, measure)
    const name: PosterLines = { ...nameFit, baselines: [] }
    let y = 300 + name.size
    for (let i = 0; i < name.lines.length; i++) {
      name.baselines.push(y)
      y += Math.round(name.size * 1.2)
    }
    const scanFit = fitLines(texts.scan, inner, [...level.scan], 2, measure)
    const scan: PosterLines = { ...scanFit, baselines: [] }
    y = Math.max(y + 10, 700)
    for (let i = 0; i < scan.lines.length; i++) {
      scan.baselines.push(y)
      y += Math.round(scan.size * 1.2)
    }
    // The code: whole pixels per module, the quiet zone inside the white box
    const cell = Math.floor(level.qr / (modules + 2 * QUIET_MODULES))
    const side = cell * (modules + 2 * QUIET_MODULES)
    const qr = { x: Math.round((W - side) / 2), y: Math.round(y - scan.size * 0.2 + 20), cell, side }
    y = qr.y + side + 40
    const centres = texts.steps.map((_, i) => y + 50 + i * level.step)
    y += texts.steps.length * level.step
    const width = Math.min(inner - 130, Math.max(...texts.steps.map((s) => measure(s, stepSize))))
    const steps = { size: stepSize, x: Math.round((W - (width + 130)) / 2), width, centres }
    const pay: PosterLines = { ...pay0, baselines: [y + 80] }
    const bottomOfPay = y + 80 + Math.ceil(pay.size * DESCENT)
    layout = { name, scan, qr, steps, pay, link, bottomOfPay, topOfLink }
    if (bottomOfPay + GAP_ABOVE_LINK <= topOfLink) break
  }
  return layout!
}

/**
 * Draws the poster onto the canvas (resized to the poster's size). The QR is the link with error correction Q (a
 * quarter of it can be dirty, folded or taped over and it still scans), drawn in whole pixels per module (sharp edges
 * at any print size), with a 4-module white margin. Where each part goes: layoutPoster.
 */
export async function drawPoster(canvas: HTMLCanvasElement, link: string, texts: PosterTexts): Promise<void> {
  const qrcode = await import('qrcode')
  const qr = qrcode.create(link, { errorCorrectionLevel: 'Q' })
  // Latin names in the app's own Poppins; the font must be in before drawing (a canvas doesn't wait for it)
  try {
    await Promise.all([document.fonts?.load(font(700, 100)), document.fonts?.load(font(600, 100))])
  } catch {
    // The phone's own font then: still readable
  }
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const g = canvas.getContext('2d')
  if (!g) throw new Error('No canvas')
  const W = POSTER_WIDTH
  // Bold for the lines, semi-bold for the steps (as drawn)
  const measure: Measure = (text, size) => {
    g.font = font(700, size)
    return g.measureText(text).width
  }
  const n = qr.modules.size
  const at = layoutPoster(texts, n, measure)
  const inner = W - 2 * 150

  g.fillStyle = PAPER
  g.fillRect(0, 0, W, POSTER_HEIGHT)
  // A thin frame: the cutting line, and what makes it look like a sign
  g.strokeStyle = INK
  g.lineWidth = 8
  g.strokeRect(60, 60, W - 120, POSTER_HEIGHT - 120)
  g.fillStyle = INK
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'

  // The brand, small, so the customer knows which app this is
  g.font = font(700, 72)
  g.fillText('Clozest', W / 2, 220)

  // The salon's name, then "Scan to book your time"
  for (const block of [at.name, at.scan]) {
    g.font = font(700, block.size)
    block.lines.forEach((line, i) => g.fillText(line, W / 2, block.baselines[i]))
  }

  // The code
  g.fillStyle = PAPER
  g.fillRect(at.qr.x, at.qr.y, at.qr.side, at.qr.side)
  g.fillStyle = INK
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) g.fillRect(at.qr.x + (c + QUIET_MODULES) * at.qr.cell, at.qr.y + (r + QUIET_MODULES) * at.qr.cell, at.qr.cell, at.qr.cell)
    }
  }

  // The three steps, each in a numbered circle, left-aligned as one block in the middle
  const blockX = at.steps.x
  for (const [i, step] of texts.steps.entries()) {
    const cy = at.steps.centres[i]
    g.lineWidth = 6
    g.beginPath()
    g.arc(blockX + 45, cy, 42, 0, Math.PI * 2)
    g.stroke()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = font(700, 54)
    g.fillText(String(i + 1), blockX + 45, cy + 3)
    g.textAlign = 'left'
    g.font = font(600, at.steps.size)
    g.fillText(step, blockX + 130, cy + 3, inner - 130)
  }
  g.textBaseline = 'alphabetic'
  g.textAlign = 'center'

  // "Pay at the salon": no money online
  g.font = font(700, at.pay.size)
  g.fillText(at.pay.lines[0], W / 2, at.pay.baselines[0])

  // The link in words, last: small, for typing it in
  g.font = font(600, at.link.size)
  g.fillText(at.link.lines[0], W / 2, at.link.baselines[0])
}

/** The drawn poster as a PNG file. */
export function posterBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No picture'))), 'image/png'))
}
