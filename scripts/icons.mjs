// Makes the PNG icons from public/icon.svg: 192 and 512 for Android and the install prompt, a maskable 512 (the
// launcher cuts it to its own shape) and the iPhone home-screen icon. Run `npm run icons` after changing the SVG,
// and commit the PNGs.
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'

const pub = new URL('../public/', import.meta.url)
const svg = await readFile(new URL('icon.svg', pub))
// The app's background colour (the manifest's background_color)
const BG = '#0b0f26'

/** The SVG drawn at this size (rendered large first, so the edges stay sharp). */
const draw = (size) => sharp(svg, { density: 288 }).resize(size, size).png().toBuffer()

/** The icon as drawn, rounded corners and all, on a transparent background. */
async function plain(size, name) {
  await sharp(await draw(size)).toFile(new URL(name, pub).pathname)
  console.log(name)
}

/**
 * A square filled to the edges with the background colour, the drawing at `scale` in the middle. Maskable icons keep
 * everything inside the middle 80% (the safe zone a round or squircle launcher never cuts); iPhone wants no
 * transparency and rounds the corners itself.
 */
async function fullBleed(size, scale, name) {
  const art = await draw(Math.round(size * scale))
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: 'centre' }])
    .flatten({ background: BG })
    .png()
    .toFile(new URL(name, pub).pathname)
  console.log(name)
}

await plain(192, 'icon-192.png')
await plain(512, 'icon-512.png')
await fullBleed(512, 0.8, 'icon-maskable-512.png')
await fullBleed(180, 1, 'apple-touch-icon.png')
