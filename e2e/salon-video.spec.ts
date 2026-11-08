import { MockApi } from './mockApi'
import path from 'node:path'
import { expect, fakeMp4, signedIn, stubVideoLength, test } from './helpers'

/** A salon still registering: both photos in, no video yet. */
function registering(api: MockApi, over: Record<string, unknown> = {}) {
  api.shop = MockApi.shopOf({ status: 'DRAFT', shopVideoFileId: null, ...over })
}

const videoCalls = (api: MockApi) => api.calls.filter((c) => c.path.includes('video-uploads') || c.path.includes('/__r2/') || c.path === '/api/v1/shops/me/video')

test('the owner records the salon video: it goes straight to storage, is saved on the salon, and then registration can go on', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  await page.goto('/register/photos')
  await expect(page.getByText('Hold the phone sideways. If your camera is set to 4K, switch it to 1080p (HD) first.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await expect(page.getByText('Both photos and the salon video are needed.')).toBeVisible()

  await page.getByLabel('Record video').setInputFiles({ name: 'salon.mp4', mimeType: 'video/mp4', buffer: fakeMp4(4096) })
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  await expect(page.locator('video[aria-label="Your salon video"]')).toHaveAttribute('src', /video\.mp4/)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()

  // The link, the PUT straight to storage with the type it was signed for, "complete", then set on the salon
  const calls = videoCalls(api)
  expect(calls.map((c) => `${c.method} ${c.path.split('?')[0]}`)).toEqual([
    'POST /api/v1/files/video-uploads',
    expect.stringMatching(/^PUT \/__r2\/.+\.mp4$/),
    expect.stringMatching(/^POST \/api\/v1\/files\/video-uploads\/vu\d+\/complete$/),
    'PUT /api/v1/shops/me/video',
  ])
  expect(calls[0].body).toEqual({ sizeBytes: 4096, contentType: 'video/mp4', durationSeconds: 30 })
  expect(calls[1].contentType).toBe('video/mp4')
  expect(calls[1].auth).toBeNull()   // storage gets no sign-in token
  expect(calls[3].body).toMatchObject({ version: 3, fileId: expect.stringMatching(/^fv/) })

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Salon video: added')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for the visit' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
})

test('a video too short or too long is refused on the phone, before anything is sent', async ({ page, context, api }) => {
  await stubVideoLength(context, 10)
  await signedIn(context, api)
  registering(api)
  await page.goto('/register/photos')
  await page.getByLabel('Choose video from gallery').setInputFiles({ name: 'short.mp4', mimeType: 'video/mp4', buffer: fakeMp4() })
  await expect(page.getByRole('alert')).toContainText('Record at least 15 seconds')
  await page.evaluate(() => ((window as unknown as { __videoSeconds: number }).__videoSeconds = 60))
  await page.getByLabel('Choose video from gallery').setInputFiles({ name: 'long.mp4', mimeType: 'video/mp4', buffer: fakeMp4() })
  await expect(page.getByRole('alert')).toHaveText('This video is 60 seconds. Keep it under 45 seconds — about 30 is ideal.')
  await page.getByLabel('Choose video from gallery').setInputFiles({ name: 'clip.mkv', mimeType: 'video/x-matroska', buffer: fakeMp4() })
  await expect(page.getByRole('alert')).toHaveText('Pick a video (MP4, MOV or WebM).')
  expect(videoCalls(api)).toEqual([])
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

test('the backend refusing the video (too big) says so in plain words and nothing is retried', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.failOnce.set('/files/video-uploads', { status: 413, code: 'FILE_TOO_LARGE', message: 'A video can be at most 100 MB' })
  await page.goto('/register/photos')
  await page.getByLabel('Record video').setInputFiles({ name: 'salon.mp4', mimeType: 'video/mp4', buffer: fakeMp4() })
  await expect(page.getByRole('alert')).toHaveText('This video is too big. Set the camera to 1080p (HD) and record about 30 seconds.')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeHidden()
  expect(videoCalls(api)).toHaveLength(1)
})

test('the network dropping mid-upload keeps the video: Try again sends it again on the same link', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.r2DropNext = 1
  await page.goto('/register/photos')
  await page.getByLabel('Record video').setInputFiles({ name: 'salon.mp4', mimeType: 'video/mp4', buffer: fakeMp4() })
  await expect(page.getByRole('alert')).toContainText('Tap Try again')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  const calls = videoCalls(api)
  expect(calls.filter((c) => c.path === '/api/v1/files/video-uploads')).toHaveLength(1)   // the link is reused
  expect(calls.filter((c) => c.path.includes('/__r2/'))).toHaveLength(2)
  expect(api.shop!.shopVideoFileId).toMatch(/^fv/)
})

test('an upload can be cancelled and sent again', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.r2Delay = 4000
  await page.goto('/register/photos')
  await page.getByLabel('Record video').setInputFiles({ name: 'salon.mp4', mimeType: 'video/mp4', buffer: fakeMp4() })
  await expect(page.getByRole('progressbar', { name: 'Uploading the video' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('alert')).toContainText('Upload cancelled')
  api.r2Delay = 0
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  expect(api.shop!.shopVideoFileId).toMatch(/^fv/)
})

test('a saved video can be replaced with a new one', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })   // already has a video
  await page.goto('/register/photos')
  await expect(page.locator('video[aria-label="Your salon video"]')).toBeVisible()
  await expect(page.getByLabel('Record video')).toHaveCount(0)
  await page.getByRole('button', { name: 'Replace video' }).click()
  await page.getByLabel('Record video').setInputFiles({ name: 'new.mov', mimeType: 'video/quicktime', buffer: fakeMp4() })
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  const set = api.calls.filter((c) => c.path === '/api/v1/shops/me/video')
  expect(set).toHaveLength(1)
  expect(set[0].body).toMatchObject({ fileId: expect.stringMatching(/^fv\d+$/) })
  expect(api.shop!.shopVideoFileId).not.toBe('fv-video')
  expect(videoCalls(api)[0].body).toMatchObject({ contentType: 'video/quicktime' })
})

test('without the video the salon can’t be submitted', async ({ page, context, api }) => {
  await signedIn(context, api)
  registering(api)
  await page.goto('/register/review')
  await expect(page.getByText('Salon video: missing')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit for the visit' })).toBeDisabled()
})

const record = (page: import('@playwright/test').Page, buffer = fakeMp4()) =>
  page.getByLabel('Record video').setInputFiles({ name: 'salon.mp4', mimeType: 'video/mp4', buffer })

test('a real MP4 has its length read by the browser itself (nothing stubbed) and goes through', async ({ page, context, api }) => {
  await signedIn(context, api)
  registering(api)
  await page.goto('/register/photos')
  await page.getByLabel('Record video').setInputFiles(path.resolve('e2e/fixtures/salon-20s.mp4'))
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  expect(videoCalls(api)[0].body).toMatchObject({ contentType: 'video/mp4', durationSeconds: 20 })
})

test('a length the phone can’t read is not a dead end: Upload anyway sends it without one', async ({ page, context, api }) => {
  await stubVideoLength(context, NaN)
  await signedIn(context, api)
  registering(api)
  await page.goto('/register/photos')
  await record(page)
  await expect(page.getByText("We couldn't read this video's length. Make sure it's 15–45 seconds.")).toBeVisible()
  expect(videoCalls(api)).toEqual([])
  await page.getByRole('button', { name: 'Upload anyway' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  expect(videoCalls(api)[0].body).toMatchObject({ durationSeconds: null })
})

test('Try again after the video arrived goes on from the step that failed, never sending the file twice', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.failOnce.set('/complete', { status: 503, code: 'SERVICE_BUSY', message: "We're having a short problem. Try again in a few seconds." })
  await page.goto('/register/photos')
  await record(page)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  const kinds = videoCalls(api).map((c) => (c.path.includes('/__r2/') ? 'PUT' : c.path.split('?')[0].split('/').pop()))
  expect(kinds).toEqual(['video-uploads', 'PUT', 'complete', 'complete', 'video'])

  // Saving it on the salon failed: only the save is tried again
  api.shop = { ...api.shop!, shopVideoFileId: null }
  await page.reload()
  const before = videoCalls(api).length
  api.failOnce.set('/shops/me/video', { status: 503, code: 'SERVICE_BUSY', message: "We're having a short problem. Try again in a few seconds." })
  await record(page)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  const again = videoCalls(api).slice(before).map((c) => (c.path.includes('/__r2/') ? 'PUT' : c.path.split('?')[0].split('/').pop()))
  expect(again).toEqual(['video-uploads', 'PUT', 'complete', 'video', 'video'])
})

test('someone saved the salon meanwhile: the save is tried once more by itself; twice, it says to reload', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.shopChangedOnVideo = 1
  await page.goto('/register/photos')
  await record(page)
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  expect(api.calls.filter((c) => c.path === '/api/v1/shops/me/video')).toHaveLength(2)

  api.shop = { ...api.shop!, shopVideoFileId: null }
  await page.reload()
  api.shopChangedOnVideo = 2
  await record(page)
  await expect(page.getByText('Your salon was changed on another phone. Reload the page, then add the video again.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test('R2’s own trouble keeps the link; an upload the backend no longer knows starts afresh', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.r2Fail = { status: 503, times: 1 }
  await page.goto('/register/photos')
  await record(page)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  expect(videoCalls(api).filter((c) => c.path === '/api/v1/files/video-uploads')).toHaveLength(1)
  expect(videoCalls(api).filter((c) => c.path.includes('/__r2/'))).toHaveLength(2)

  api.shop = { ...api.shop!, shopVideoFileId: null }
  await page.reload()
  const before = videoCalls(api).length
  api.failOnce.set('/complete', { status: 404, code: 'UPLOAD_NOT_FOUND', message: 'No such upload' })
  await record(page)
  await expect(page.getByRole('alert')).toContainText('Tap Try again')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  expect(videoCalls(api).slice(before).filter((c) => c.path === '/api/v1/files/video-uploads')).toHaveLength(2)
})

test('Keep the current video clears a failed replacement', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  api.r2DropNext = 1
  await page.goto('/register/photos')
  await page.getByRole('button', { name: 'Replace video' }).click()
  await record(page)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep the current video' }).click()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('video[aria-label="Your salon video"]')).toBeVisible()
  expect(api.shop!.shopVideoFileId).toBe('fv-video')
})

test('while the video uploads the owner is kept from leaving by mistake', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.r2Delay = 3000
  await page.goto('/register/photos')
  await page.getByRole('heading', { name: 'Photos and video' }).click()   // a tap: the page may ask before closing
  await record(page)
  await expect(page.getByRole('progressbar', { name: 'Uploading the video' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  const dialogs: string[] = []
  page.on('dialog', (d) => {
    dialogs.push(`${d.type()}: ${d.message()}`)
    void d.dismiss()
  })
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/register\/photos$/)
  expect(dialogs[0]).toMatch(/^confirm: The salon video is still uploading/)
  await page.close({ runBeforeUnload: true })
  await expect.poll(() => dialogs.some((d) => d.startsWith('beforeunload'))).toBe(true)
})

test('the video buttons work from the keyboard and progress is told to screen readers', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.r2Delay = 1500
  api.slow.set('/complete', 1500)
  await page.goto('/register/photos')
  const button = page.getByRole('button', { name: 'Record video' })
  await button.focus()
  await expect(button).toBeFocused()
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await chooser).setFiles({ name: 'salon.mp4', mimeType: 'video/mp4', buffer: fakeMp4() })
  const live = page.locator('p[role="status"][aria-live="polite"]')
  await expect(live).toHaveText(/Uploading the video, \d+%/)
  await expect(live).toHaveText('Saving the video…')
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
})

test('the saved video plays; its link is read again every 4 minutes but the loaded player keeps its own', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  await page.clock.install()
  await page.goto('/register/photos')
  const player = page.locator('video[aria-label="Your salon video"]')
  await expect(player).toHaveAttribute('src', /video\.mp4/)
  await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  const links = () => api.calls.filter((c) => c.path === '/api/v1/files/fv-video/link').length
  const first = links()
  const src = await player.getAttribute('src')
  await page.clock.fastForward('04:05')
  await expect.poll(links).toBeGreaterThan(first)
  expect(await player.getAttribute('src')).toBe(src)
})

test('a video that can’t play gets a fresh link once, then says to reload', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  api.videoBroken = true
  await page.goto('/register/photos')
  await expect(page.getByText("Couldn't play the video. Reload the page.")).toBeVisible()
  expect(api.calls.filter((c) => c.path === '/api/v1/files/fv-video/link')).toHaveLength(2)
})

test('a video that expired before it was saved on the salon asks to upload it again, and Try again starts afresh', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.failOnce.set('/shops/me/video', { status: 409, code: 'UPLOAD_GONE', message: 'This video expired. Upload it again.' })
  await page.goto('/register/photos')
  await record(page)
  await expect(page.getByRole('alert')).toHaveText('This video expired. Upload it again.')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  // A new link and the file sent again (not only the save)
  expect(videoCalls(api).filter((c) => c.path === '/api/v1/files/video-uploads')).toHaveLength(2)
  expect(videoCalls(api).filter((c) => c.path.includes('/__r2/'))).toHaveLength(2)
})

test('during the upload a link inside the app asks first too', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.r2Delay = 3000
  await page.goto('/register/photos')
  await record(page)
  await expect(page.getByRole('progressbar', { name: 'Uploading the video' })).toBeVisible()
  // Any in-app link (none on this step today; a message or a future one) is caught before it is followed
  await page.evaluate(() => {
    const a = document.createElement('a')
    a.href = '/start'
    a.textContent = 'Somewhere else'
    document.querySelector('main')!.append(a)
  })
  const dialogs: string[] = []
  page.once('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  await page.getByRole('link', { name: 'Somewhere else' }).click()
  expect(dialogs[0]).toMatch(/still uploading/)
  await expect(page).toHaveURL(/\/register\/photos$/)
  await expect(page.getByRole('progressbar', { name: 'Uploading the video' })).toBeVisible()
})

test('leaving while the video is being saved: nothing is set on the salon afterwards', async ({ page, context, api }) => {
  await stubVideoLength(context, 30)
  await signedIn(context, api)
  registering(api)
  api.slow.set('/complete', 1500)
  await page.goto('/register/photos')
  await record(page)
  await expect(page.locator('p[role="status"][aria-live="polite"]')).toHaveText('Saving the video…')
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/register$/)
  await expect.poll(() => api.calls.some((c) => c.path.endsWith('/complete'))).toBe(true)
  await page.waitForTimeout(2500)   // past the held "complete"
  expect(api.calls.filter((c) => c.path === '/api/v1/shops/me/video')).toHaveLength(0)
  expect(api.shop!.shopVideoFileId).toBeNull()
})
