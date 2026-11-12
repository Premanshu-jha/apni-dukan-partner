import { addDays, istInstant, MockApi, todayIst } from './mockApi'
import { atSalon, expect, JPEG, signedIn, test } from './helpers'

test('the owner edits the salon details later; the verified address is locked, a new GSTIN asks first and stays live', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup')
  await page.getByRole('link', { name: /Salon details/ }).click()
  await expect(page.getByRole('heading', { name: 'Salon details' })).toBeVisible()

  // The name: saved at once, the salon stays live
  await page.getByLabel('Salon name').fill('Shine Salon & Spa')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.shop!.name).toBe('Shine Salon & Spa')
  expect(api.shop!.status).toBe('APPROVED')

  // The address and pin: read-only, with whom to ask; no GPS or address search
  await expect(page.getByLabel('Shop number, building, street')).toHaveAttribute('readonly', '')
  await expect(page.getByLabel('Pincode')).toHaveAttribute('readonly', '')
  await expect(page.getByText('only they can change them', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use my location' })).toHaveCount(0)
  await expect(page.getByLabel("Map: your salon's pin, where customers find you")).toBeVisible()

  // A GSTIN with a typo is caught on the phone; a right one asks first, then the salon waits for the check, live
  await page.getByLabel('GSTIN').fill('27AAPFU0939F1ZW')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('This GSTIN has a typo')).toBeVisible()
  await page.getByLabel('GSTIN').fill('27aapfu0939f1zv')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('A new GSTIN or Udyam number goes to our field team for a check', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Save and send for a check' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  expect(api.shop!.gstin).toBe('27AAPFU0939F1ZV')
  expect(api.shop!.status).toBe('APPROVED')
  await expect(page.getByText('Our field team is checking your changes', { exact: false })).toBeVisible()
  // Saved: nothing unsaved, Back leaves without asking
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/setup$/)

  // A fix asked for shows with the reason, on Today too
  api.askToFix('The GSTIN doesn’t match the certificate.')
  await page.goto('/salon/day')
  await expect(page.getByText('Our field team asked you to fix something')).toBeVisible()
  await expect(page.getByText('The GSTIN doesn’t match the certificate.', { exact: false })).toBeVisible()
})

test('a barber keeps working while the owner’s changes are re-checked (the salon stays APPROVED)', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  api.shop = { ...api.shop!, recheckSince: null, status: 'APPROVED' }
  await page.goto('/')
  await expect(page).toHaveURL(/\/salon\/day/)
  await expect(page.getByText("Your salon isn't live yet")).toHaveCount(0)
})

test('leaving the salon details with unsaved changes asks first', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/details')
  await expect(page.getByText('Your own sign-in name is changed in More', { exact: false })).toBeVisible()
  await page.getByLabel('Salon name').fill('Shine Salon Sector 63')
  page.once('dialog', (d) => void d.dismiss())
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/setup\/details$/)
  await expect(page.getByLabel('Salon name')).toHaveValue('Shine Salon Sector 63')
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/setup$/)
})

test('photos and video can be changed later, with the re-check said first', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/photos')
  await expect(page.getByText('A new photo or video goes to our field team for a check')).toBeVisible()
  // Visible buttons to replace a photo on the spot: retake it or pick one from the gallery
  await expect(page.getByRole('button', { name: 'Retake shop front' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retake your photo' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Choose another/ })).toHaveCount(2)
  await page.getByLabel('Pick shop front from gallery').setInputFiles({ name: 'shop.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect.poll(() => api.calls.some((c) => c.path === '/api/v1/shops/me/photos')).toBe(true)
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  expect(api.shop!.status).toBe('APPROVED')   // stays live
  await expect(page.getByText('Our field team is checking your changes', { exact: false })).toBeVisible()
  // A photo format the phone can't redraw and the backend doesn't take is refused with what to do
  await page.getByLabel('Pick your photo from gallery').setInputFiles({ name: 'me.heic', mimeType: 'image/heic', buffer: Buffer.from('not really heic') })
  await expect(page.getByText("This photo's format can't be used", { exact: false })).toBeVisible()
})

test('the registration document: added on a live salon it waits for a check, and the owner can remove it', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.shop = { ...api.shop!, registrationDocType: null, registrationDocFileId: null, registrationDocCheckedAt: null }
  await page.goto('/setup')
  await expect(page.getByText('Not added (optional): customers see "Unregistered"')).toBeVisible()
  await page.getByRole('link', { name: /Registration document/ }).click()
  await page.getByLabel('Udyam certificate').check()
  await page.getByLabel('Add the registration document').setInputFiles({ name: 'udyam.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') })
  await expect(page.getByText('Waiting for our team to check it')).toBeVisible()
  expect(api.shop!.status).toBe('APPROVED')   // stays live

  await page.getByRole('button', { name: 'Remove the document' }).click()
  await page.getByRole('button', { name: 'Remove it' }).click()
  await expect(page.getByText('No document added: customers see "Unregistered" on your salon.')).toBeVisible()
  expect(api.shop!.registrationDocFileId).toBeNull()
})

test('helpers can’t open the owner’s salon details', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.goto('/setup')
  await expect(page.getByRole('link', { name: /Salon details/ })).toHaveCount(0)
  await page.goto('/setup/document')
  await expect(page).not.toHaveURL(/\/setup\/document$/)
})

test('a contract barber is removed for good; one with bookings coming up must have them moved first', async ({ page, context, api }) => {
  const day = addDays(todayIst(), 2)
  api.addBooking({ startsAt: istInstant(day, '12:00'), customerName: 'Waiting Guest' })
  await atSalon(page, context, api)
  const busy = api.staff[0]
  const free = api.staff[1]
  await page.goto(`/setup/staff/${busy.id as string}`)
  await page.getByRole('button', { name: 'Remove barber' }).click()
  await page.getByRole('button', { name: `Remove ${busy.name as string}` }).click()
  await expect(page.getByText('still has upcoming bookings')).toBeVisible()

  await page.goto(`/setup/staff/${free.id as string}`)
  await page.getByRole('button', { name: 'Remove barber' }).click()
  await page.getByRole('button', { name: `Remove ${free.name as string}` }).click()
  await expect(page).toHaveURL(/\/setup\/staff$/)
  await expect(page.getByText(free.name as string, { exact: true })).toHaveCount(0)
  expect(api.staff.some((s) => s.id === free.id)).toBe(false)
})

test('the ratings page shows more than 30 with Show more', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.ratingSummary = { count: 31, average: 4.1, tags: [] }
  api.ratings = Array.from({ length: 31 }, (_, i) => ({
    bookingId: `r${i}`, bookingNo: `K${String(i).padStart(5, '0')}`, stars: 4, tags: [], comment: `Visit ${i}`,
    services: ['Haircut'], customerName: 'Riya', visitAt: '2026-11-08T06:30:00Z', ratedAt: new Date(Date.UTC(2026, 10, 9, 8, 0) - i * 60_000).toISOString(),
  }))
  await page.goto('/salon/ratings')
  await expect(page.getByText('“Visit 29”')).toBeVisible()
  await expect(page.getByText('“Visit 30”')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show more' }).click()
  await expect(page.getByText('“Visit 30”')).toBeVisible()
})

test('salon hours that would strand a booking when cut list it, and nothing is saved', async ({ page, context, api }) => {
  const day = addDays(todayIst(), 2)
  api.addBooking({ startsAt: istInstant(day, '22:00'), customerName: 'Late Guest' })
  await atSalon(page, context, api)
  await page.goto('/setup/hours')
  // Every day 00:00–21:00: Monday's times, then the same on every open day
  await page.getByLabel('Open till midnight').first().uncheck()
  await page.getByLabel('Closes').first().fill('21:00')
  await page.getByRole('button', { name: 'Same times every open day' }).click()
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Some barbers work outside these hours')).toBeVisible()
  await page.getByRole('button', { name: 'Cut their hours to fit and save' }).click()
  await expect(page.getByText("Some of his upcoming bookings wouldn't fit any more.", { exact: false })).toBeVisible()
  expect(api.hours.every((h) => h.close === '24:00')).toBe(true)
})

test('a barber’s hours outside the salon’s are refused with the reason', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/staff/st1')
  await expect(page.getByRole('button', { name: 'Remove Mon shift' })).toBeVisible()
  api.hours = api.hours.filter((h) => h.weekday !== 7)   // Sundays closed now, set on another phone
  await page.getByRole('button', { name: 'Remove Mon shift' }).click()
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText(/closed that day|outside the salon/)).toBeVisible()
})

test('services saved meanwhile on another phone: the batch is refused, nothing doubled, and the list starts again', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  const saved = api.services[0]   // Haircut
  api.services = []
  await page.goto('/register/services')
  await page.getByLabel('Haircut', { exact: true }).check()
  await page.getByLabel('Haircut price (₹)').fill('150')
  api.services = [saved]   // saved on another phone meanwhile
  await page.getByRole('button', { name: 'Save 1 service and continue' }).click()
  await expect(page.getByText('There is already an active service with this name.')).toBeVisible()
  await expect(page.getByRole('button', { name: `Remove ${saved.name as string}` })).toBeVisible()
  await expect(page.getByLabel('Haircut', { exact: true })).toHaveCount(0)   // not offered twice
  expect(api.services).toHaveLength(1)
})

test('details changed on another phone: the save is refused and the form shows the newest, so nothing is undone', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/details')
  await page.getByLabel('Owner’s name').fill('Ravi K.')
  api.shop = { ...api.shop!, name: 'Shine Salon (new name)', version: (api.shop!.version as number) + 1 }   // another phone
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByLabel('Salon name')).toHaveValue('Shine Salon (new name)')
  expect(api.shop!.name).toBe('Shine Salon (new name)')
})

test('an owner who cuts hair adds himself as a barber from the Barbers list', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/staff')
  await page.getByRole('button', { name: 'Add me as a barber' }).click()
  await expect(page.getByRole('button', { name: 'Add me as a barber' })).toBeHidden()
  const me = api.staff.at(-1)!
  expect(me.loginPhone).toBe(api.user.phone)
  expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/salon/staff/me')).toBe(true)
})

test('added from another phone meanwhile: "Add me" shows no error, and his own profile keeps his sign-in', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/staff')
  await expect(page.getByRole('button', { name: 'Add me as a barber' })).toBeVisible()
  // Another phone adds him first: this tap gets 409 ALREADY_A_BARBER, which counts as done
  api.staff.push({ id: 'st-me', name: 'Ravi', active: true, serviceIds: [], hours: [], loginPhone: api.user.phone, invitedPhone: null, photoFileId: null, version: 0 })
  await page.getByRole('button', { name: 'Add me as a barber' }).click()
  await expect(page.getByRole('button', { name: 'Add me as a barber' })).toBeHidden()
  await expect(page.getByText('already one of the barbers')).toHaveCount(0)
  expect(api.staff.filter((s) => s.loginPhone === api.user.phone)).toHaveLength(1)

  // His own profile: no "Remove his sign-in" (he couldn't invite his own number back); switched off it stays his
  await page.goto('/setup/staff/st-me')
  await expect(page.getByText('This is you, signed in as the owner.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove his sign-in' })).toHaveCount(0)
  await page.getByRole('switch', { name: 'Working here' }).click()
  await expect(page.getByRole('switch', { name: 'Working here' })).not.toBeChecked()
  expect(api.staff.find((s) => s.id === 'st-me')!.loginPhone).toBe(api.user.phone)
  await page.goto('/setup/staff')
  await expect(page.getByRole('heading', { name: 'Barbers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add me as a barber' })).toHaveCount(0)
})

test('a barber added after a festival holiday is off that day too, and the day cannot be closed twice', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const day = addDays(todayIst(), 5)
  await page.goto('/salon/closures')
  await page.getByLabel('Close the salon on').fill(day)
  await page.getByRole('button', { name: /^Close / }).click()
  await expect(page.getByRole('button', { name: 'Open again' })).toBeVisible()
  const before = api.closures[0].barbers as number
  await page.getByLabel('Close the salon on').fill(day)
  await page.getByRole('button', { name: /^Close / }).click()
  await expect(page.getByText('The salon is already closed that day.')).toBeVisible()
  await page.goto('/setup/staff')
  await page.getByRole('button', { name: 'Add me as a barber' }).click()
  await expect(page.getByRole('button', { name: 'Add me as a barber' })).toBeHidden()
  expect(api.closures[0].barbers).toBe(before + 1)
  const me = api.staff.at(-1)!
  expect(api.appointments.some((a) => a.staffId === me.id && a.blockType === 'CLOSED' && a.status === 'BLOCKED')).toBe(true)
})

test('a helper sees no "Add me as a barber"', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.goto('/setup/staff')
  await expect(page.getByRole('heading', { name: 'Barbers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add me as a barber' })).toHaveCount(0)
})

test('a photo upload that fails is sent again with Try again, without taking it again', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/photos')
  api.failOnce.set('/files', { status: 503, code: 'SERVICE_BUSY', message: "We're having a short problem. Try again in a few seconds." })
  await page.getByLabel('Pick shop front from gallery').setInputFiles({ name: 'shop.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText("We're having a short problem.", { exact: false })).toBeVisible()
  const uploads = () => api.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/api/v1/files')).length
  const before = uploads()
  await page.getByRole('button', { name: 'Try sending shop front again' }).click()
  await expect.poll(() => api.calls.some((c) => c.path === '/api/v1/shops/me/photos')).toBe(true)
  expect(uploads()).toBe(before + 1)
  await expect(page.getByRole('button', { name: 'Try sending shop front again' })).toHaveCount(0)
})
