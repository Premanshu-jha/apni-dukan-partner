// Makes the Play Store app's icons and start screens from public/icon.svg (as scripts/icons.mjs does the website's):
// the launcher icon in every density (square, round, and the adaptive icon's foreground on the dark background colour
// in res/values/ic_launcher_background.xml), and the start screen (splash) for older phones. Run
// `npm run android-icons` after changing the SVG, and commit the PNGs.
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const pub = new URL('../public/', import.meta.url)
const res = new URL('../android/app/src/main/res/', import.meta.url)
const svg = await readFile(new URL('icon.svg', pub), 'utf8')
// The app's background colour (the manifest's background_color)
const BG = '#0b0f26'
// The drawing alone, without its dark rounded square: the adaptive icon and the splash put it on their own background
const art = Buffer.from(svg.replace(/<rect width="512" height="512" rx="112" fill="#0b0f26"\/>/, ''))
if (art.length === Buffer.byteLength(svg)) throw new Error('icon.svg: its background square was not found')

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const draw = (input, size) => sharp(input, { density: 288 }).resize(size, size).png().toBuffer()
const out = (dir, name) => new URL(`${dir}/${name}`, res).pathname

/** The drawing at `scale` of a `size` square, centred on `background` (transparent if null). */
async function centred(size, scale, background, file, round = false) {
  const inner = await draw(art, Math.round(size * scale))
  let img = sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner, gravity: 'centre' }])
  if (round) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`)
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }])
  }
  await img.png().toFile(file)
}

for (const [d, x] of Object.entries(DENSITIES)) {
  const dir = `mipmap-${d}`
  // Launchers before Android 8: the icon as drawn (its own rounded square), and a round one
  await sharp(await draw(Buffer.from(svg), 48 * x)).toFile(out(dir, 'ic_launcher.png'))
  await centred(48 * x, 0.72, BG, out(dir, 'ic_launcher_round.png'), true)
  // Android 8+: the foreground on a 108 dp square, the drawing inside the middle 66% that every launcher shape keeps
  await centred(108 * x, 0.6, null, out(dir, 'ic_launcher_foreground.png'))
  console.log(dir)
}

// The start screen on phones before Android 12 (Android 12+ draws the icon on windowSplashScreenBackground itself):
// the same sizes Capacitor's template has
const SPLASH = {
  drawable: [480, 320],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
}
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  const logo = await draw(art, Math.round(Math.min(w, h) * 0.4))
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: 'centre' }])
    .flatten({ background: BG })
    .png()
    .toFile(out(dir, 'splash.png'))
}
console.log('splash')
