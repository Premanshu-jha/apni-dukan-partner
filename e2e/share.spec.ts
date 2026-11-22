import { readFileSync } from 'node:fs'
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library'
import sharp from 'sharp'
import { atSalon, expect, signedIn, test } from './helpers'

const LINK = 'https://clozest.in/salons/shop1'
const MESSAGE = `Book your time at Shine Unisex Salon on Clozest, no waiting at the salon: ${LINK}`
const hi = JSON.parse(readFileSync(new URL('../src/i18n/hi/share.json', import.meta.url), 'utf8')) as Record<string, string>

/** Reads the QR out of a PNG as a phone camera would (the whole poster, shrunk to half: a far-off, small photo). */
async function readQr(png: Buffer): Promise<string> {
  const { data, info } = await sharp(png).resize({ width: 874 }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const source = new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height)
  const reader = new MultiFormatReader()
  reader.setHints(new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]))
  return reader.decode(new BinaryBitmap(new HybridBinarizer(source))).getText()
}

test('the owner finds "Share your salon" in Setup, sends the link on WhatsApp, copies it, and downloads a poster whose QR opens the salon', async ({ page, context, api }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await atSalon(page, context, api, 'OWNER')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Salon' }).click()
  await page.getByRole('link', { name: /Share your salon.*Send your link on WhatsApp, or print a poster/ }).click()
  await expect(page).toHaveURL(/\/salon\/share$/)
  await expect(page.getByRole('heading', { name: 'Share your salon' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: "Your salon's link" })).toHaveValue(LINK)

  const wa = page.getByRole('link', { name: 'Share on WhatsApp' })
  await expect(wa).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(MESSAGE)}`)
  await expect(wa).toHaveAttribute('target', '_blank')

  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(LINK)
  // Back to its name by itself
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 5000 })

  // The poster, drawn on the phone: shown, then downloaded as a print-sized PNG
  await expect(page.getByRole('img', { name: 'Poster for Shine Unisex Salon: scan to book your time' })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download poster' }).click()])
  expect(download.suggestedFilename()).toBe('shine-unisex-salon-clozest-poster.png')
  const png = readFileSync((await download.path())!)
  const meta = await sharp(png).metadata()
  expect([meta.width, meta.height]).toEqual([1748, 2480])
  expect(await readQr(png)).toBe(LINK)
  // Nothing was asked of the backend for it
  expect(api.calls.filter((c) => c.path.includes('share') || c.path.includes('poster'))).toEqual([])
})

test('printing gives only the poster, on white', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'OWNER')
  await page.goto('/salon/share')
  await expect(page.getByRole('img', { name: /Poster for Shine Unisex Salon/ })).toBeVisible()
  await page.evaluate(() => {
    ;(window as unknown as { printed: number }).printed = 0
    window.print = () => {
      ;(window as unknown as { printed: number }).printed++
    }
  })
  await page.getByRole('button', { name: 'Print' }).click()
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1)

  await page.emulateMedia({ media: 'print' })
  const printed = page.getByTestId('print-poster').locator('img')
  await expect(printed).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Share your salon' })).toBeHidden()
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toBeHidden()
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)')
  await page.emulateMedia({ media: 'screen' })
  await expect(page.getByTestId('print-poster')).toBeHidden()
})

test('a barber finds it under More and can share his salon with his own customers', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Share your salon' }).click()
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download poster' })).toBeVisible()
  // Back goes to More
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/more$/)
})

test('a helper finds it first in Setup', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.goto('/setup')
  await expect(page.getByRole('listitem').first()).toContainText('Share your salon')
})

test('waiting for the field team’s visit: not live yet, nothing to send or print', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER', { status: 'PENDING_VISIT' })
  api.subscription = null
  await page.goto('/salon/share')
  await expect(page.getByText("Your salon isn't live yet")).toBeVisible()
  await expect(page.getByText(/only see "No such salon"/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Print' })).toHaveCount(0)
})

test('suspended: what customers see, and where to look', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER', { status: 'SUSPENDED', statusReason: 'Photos did not match the shop.' })
  await page.goto('/salon/share')
  await expect(page.getByText('Your salon is off the app for now')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toHaveCount(0)
  await page.getByRole('link', { name: 'See why on Home' }).click()
  await expect(page.getByText('Photos did not match the shop.')).toBeVisible()
})

test('unpaid and hidden: the subscription banner, what the link shows, and sharing still there', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  api.subscription!.trialEndsAt = new Date(Date.now() - 5 * 86_400_000).toISOString()
  await page.goto('/salon/share')
  await expect(page.getByText("Right now customers can't find your salon in the app. Anyone opening your link sees your salon but can't book.")).toBeVisible()
  await page.getByRole('link', { name: 'Pay now' }).click()
  await expect(page.getByRole('heading', { name: 'Subscription' })).toBeVisible()
})

test('paused: said, and one tap back to Today to start bookings again', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  api.pausedUntil = new Date(Date.now() + 3_600_000).toISOString()
  await page.goto('/salon/share')
  await expect(page.getByText(/Online bookings are paused until .* can't pick a time\./)).toBeVisible()
  await page.getByRole('link', { name: 'Start them again on Today' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('in Hindi: the page, the WhatsApp message and the poster are all in Hindi', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.user.language = 'hi'
  // A real salon's id (a UUID): a longer link, a bigger code, still read
  const id = '7c9e6679-7425-40de-944b-e07fc1f2b0a4'
  const LINK = `https://clozest.in/salons/${id}`
  api.approvedSalon('OWNER', { id })
  await page.goto('/salon/share')
  await expect(page.getByRole('heading', { name: hi.title })).toBeVisible()
  const message = hi.message.replace('{salon}', 'Shine Unisex Salon').replace('{link}', LINK)
  await expect(page.getByRole('link', { name: hi.whatsapp })).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent(message)}`)
  await expect(page.getByRole('img', { name: hi.posterAlt.replace('{salon}', 'Shine Unisex Salon') })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: hi.download }).click()])
  expect(await readQr(readFileSync((await download.path())!))).toBe(LINK)
})

test('where the phone can share files, "Share poster" sends the PNG itself (WhatsApp status, a group)', async ({ page, context, api }) => {
  await context.addInitScript(() => {
    const w = window as unknown as { shared: Array<{ name: string; type: string; size: number; text?: string }> }
    w.shared = []
    Object.assign(navigator, {
      canShare: (d: ShareData) => Boolean(d.files?.length && d.files.every((f) => f.type === 'image/png')),
      share: async (d: ShareData) => {
        for (const f of d.files ?? []) w.shared.push({ name: f.name, type: f.type, size: f.size, text: d.text })
      },
    })
  })
  await atSalon(page, context, api, 'OWNER')
  await page.goto('/salon/share')
  await page.getByRole('button', { name: 'Share poster' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared.length)).toBe(1)
  const [sent] = await page.evaluate(() => (window as unknown as { shared: Array<{ name: string; type: string; size: number; text?: string }> }).shared)
  expect(sent).toMatchObject({ name: 'shine-unisex-salon-clozest-poster.png', type: 'image/png', text: MESSAGE })
  expect(sent.size).toBeGreaterThan(10_000)
})

test('no file sharing on this phone: no "Share poster", the download is there', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'OWNER')
  await page.goto('/salon/share')
  await expect(page.getByRole('link', { name: 'Download poster' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share poster' })).toHaveCount(0)
})

test('live but no barber with hours: customers can’t book yet, one tap to the barbers, sharing still there', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER')
  for (const s of api.staff) s.hours = []
  await page.goto('/salon/share')
  await expect(page.getByText("Customers will see your salon but can't book yet: give a barber his services and weekly hours.")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toBeVisible()
  await page.getByRole('link', { name: 'Set up barbers' }).click()
  await expect(page).toHaveURL(/\/setup\/staff$/)
})

test('a bookable salon says nothing about setup', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'OWNER')
  await page.goto('/salon/share')
  await expect(page.getByRole('link', { name: 'Share on WhatsApp' })).toBeVisible()
  await expect(page.getByText(/can't book yet/)).toHaveCount(0)
})
