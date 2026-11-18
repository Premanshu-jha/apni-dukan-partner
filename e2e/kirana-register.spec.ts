import { expect, fakeMp4, JPEG, signedIn, stubVideoLength, test } from './helpers'

test('a kirana owner answers "What do you run?", registers in five steps and submits', async ({ page, context, api }) => {
  await signedIn(context, api, null)
  await stubVideoLength(context)
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  await page.getByRole('button', { name: 'Register my shop' }).click()
  await expect(page).toHaveURL(/\/register\/kind$/)
  await page.getByRole('button', { name: /Kirana \/ general store/ }).click()

  // Step 1: the shop's words, the kind line with Change, and the optional GSTIN
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByRole('heading', { name: 'Register your shop' })).toBeVisible()
  await expect(page.getByText('Registering a Kirana / general store')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Registration steps' }).getByText('UPI ID')).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('Enter the shop name')).toBeVisible()
  await page.getByLabel('Shop name').fill('Sharma Kirana Store')
  await page.getByLabel('Owner’s name').fill('Ramesh Sharma')
  await page.getByLabel('Shop number, building, street').fill('Shop 4, Lake View Apartments')
  await page.getByLabel('Area').fill('Kondapur')
  await page.getByLabel('City').fill('Hyderabad')
  await page.getByLabel('Pincode').fill('500084')
  await page.getByLabel('GSTIN (optional)').fill('27aapfu0939f1zv')
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByRole('application', { name: /drag the pin/ })).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()

  await expect(page).toHaveURL(/\/register\/photos$/)
  const create = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/shops')!
  expect(create.body).toMatchObject({ name: 'Sharma Kirana Store', type: 'KIRANA', gstin: '27AAPFU0939F1ZV' })

  // Step 2: two photos and the shop video, as a salon's (the papers come next)
  await expect(page.getByRole('heading', { name: 'Photos and video' })).toBeVisible()
  await expect(page.getByText(/trade licence/i)).toHaveCount(0)
  await page.getByLabel('Add your photo').setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await page.getByLabel('Add shop front').setInputFiles({ name: 'shop.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText('Both photos and the shop video are needed.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await page.getByLabel('Record video').setInputFiles({ name: 'shop.mp4', mimeType: 'video/mp4', buffer: fakeMp4(4096) })
  await expect(page.getByRole('button', { name: 'Replace video' })).toBeVisible()
  await expect(page.locator('video[aria-label="Your shop video"]')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3: the papers. Selling food asks for the FSSAI licence before going on
  await expect(page).toHaveURL(/\/register\/licences$/)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await expect(page.getByText('Say whether you sell any food items.')).toBeVisible()
  await page.getByRole('button', { name: 'Yes, some food' }).click()
  await expect(page.getByText('Your FSSAI licence is needed: you sell food.')).toBeVisible()
  expect(api.kirana.sellsFood).toBe(true)
  // The number first: the certificate can't be picked before it (a photo taken then would be thrown away)
  await expect(page.getByText('Type the 14-digit number above first, then add the certificate')).toBeVisible()
  await expect(page.getByLabel('Add the FSSAI certificate')).toBeDisabled()
  await page.getByLabel('FSSAI number').fill('1234 5678 9012 34')
  await page.getByLabel('Add the FSSAI certificate').setInputFiles({ name: 'fssai.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText(/Checking your FSSAI certificate/)).toBeVisible()
  expect(api.kirana.fssai).toMatchObject({ status: 'CHECKING', number: '12345678901234' })
  // The optional shop licence: a Shops and Establishments certificate, checked automatically
  await page.getByRole('button', { name: 'Shops & Establishments' }).click()
  await page.getByLabel('Add the shop licence').setInputFiles({ name: 'se.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText(/Checking your shops and establishments certificate/i)).toBeVisible()
  expect(api.shop!.registrationDocType).toBe('SHOPS_ESTABLISHMENT')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 4: the UPI ID, checked on the phone and cleaned as the backend keeps it
  await expect(page).toHaveURL(/\/register\/upi$/)
  await page.getByLabel("Your shop's UPI ID").fill('sharmastore')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('It looks like name@bank, e.g. sharmastore@okhdfcbank')).toBeVisible()
  await page.getByLabel("Your shop's UPI ID").fill(' SharmaStore@OKHDFCBank ')
  await expect(page.getByText('Saved as sharmastore@okhdfcbank')).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Step 5: everything in full, then Submit after a question
  await expect(page).toHaveURL(/\/register\/review$/)
  expect(api.kirana.upiId).toBe('sharmastore@okhdfcbank')
  await expect(page.getByText('UPI ID: sharmastore@okhdfcbank')).toBeVisible()
  await expect(page.getByText('Sells food: yes')).toBeVisible()
  await expect(page.getByText(/FSSAI: 12345678901234/)).toBeVisible()
  await expect(page.getByText('27AAPFU0939F1ZV')).toBeVisible()
  await page.getByRole('button', { name: 'Submit for the visit' }).click()
  await expect(page.getByText("You can't change the kind of shop after submitting.")).toBeVisible()
  await page.getByRole('button', { name: 'Yes, submit' }).click()
  await expect(page).toHaveURL(/\/kirana\/counter$/)
  expect(api.shop!.status).toBe('PENDING_VISIT')
  await expect(page.getByText('Waiting for approval')).toBeVisible()
  await expect(page.getByText('your counter works already', { exact: false })).toBeVisible()
  // Submitted: the kind can't be changed any more
  await page.goto('/register/kind')
  await expect(page).toHaveURL(/\/kirana\/counter$/)
})

test('picked salon by mistake: changed to kirana from any step, saying what goes, and back again', async ({ page, context, api }) => {
  await signedIn(context, api, 'SALON')
  api.shop = {
    ...(await import('./mockApi')).MockApi.shopOf({ status: 'DRAFT', ownerPhotoFileId: 'f-owner', shopPhotoFileId: 'f-shop', shopVideoFileId: 'fv-video', licenceCheck: 'PENDING' }),
  }
  api.role = 'OWNER'
  await page.goto('/register/photos')
  await expect(page.getByText('Registering a Salon / barber shop')).toBeVisible()
  await page.getByRole('link', { name: 'Change what you run' }).click()
  await expect(page).toHaveURL(/\/register\/kind$/)
  await expect(page.getByRole('button', { name: /Salon \/ barber shop/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Kirana \/ general store/ }).click()
  await expect(page.getByText("Your shop's name, address, location pin, photos and video stay.")).toBeVisible()
  await expect(page.getByText('Your trade licence stays and is checked again for a kirana.')).toBeVisible()
  await page.getByRole('button', { name: 'Keep it as it is' }).click()
  expect(api.calls.some((c) => c.path === '/api/v1/shops/me/type')).toBe(false)

  await page.getByRole('button', { name: /Kirana \/ general store/ }).click()
  await page.getByRole('button', { name: 'Yes, it is a kirana' }).click()
  // Photos and video are kept, so the next thing a kirana needs: its papers (the food question)
  await expect(page).toHaveURL(/\/register\/licences$/)
  expect(api.shop!.type).toBe('KIRANA')
  expect(api.shop!.shopVideoFileId).toBe('fv-video')
  expect(api.shop!.registrationDocType).toBe('TRADE_LICENCE')
  await expect(page.getByText('Registering a Kirana / general store')).toBeVisible()

  // A Shops and Establishments certificate added as a kirana: going back to a salon says it goes
  await page.getByRole('button', { name: 'No food at all' }).click()
  await page.getByRole('button', { name: 'Shops & Establishments' }).click()
  await page.getByLabel('Replace the shop licence').setInputFiles({ name: 'se.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText(/Added: Shops and Establishments certificate/)).toBeVisible()
  await page.getByRole('link', { name: 'Change what you run' }).click()
  await page.getByRole('button', { name: /Salon \/ barber shop/ }).click()
  await expect(page.getByText("We'll remove your Shops and Establishments certificate: only a kirana adds one.")).toBeVisible()
  await expect(page.getByText(/A UPI ID or food answer you gave stays saved/)).toBeVisible()
  await page.getByRole('button', { name: 'Yes, it is a salon' }).click()
  await expect.poll(() => api.shop!.registrationDocFileId).toBeNull()
  expect(api.shop!.shopVideoFileId).toBe('fv-video')
})

test('a shop approved once and sent back has no Change, and a refused change says why', async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER', { status: 'DRAFT', statusReason: 'Shop board not visible.', addressLocked: true })
  await page.goto('/register/photos')
  await expect(page.getByText('Registering a Kirana / general store')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Change what you run' })).toHaveCount(0)
  // Opened anyway (an old link): the backend refuses, and the screen says so
  await page.goto('/register/kind')
  await page.getByRole('button', { name: /Salon \/ barber shop/ }).click()
  await page.getByRole('button', { name: 'Yes, it is a salon' }).click()
  await expect(page.getByText("The kind of shop can only be changed while you're registering, before you submit it.")).toBeVisible()
  expect(api.shop!.type).toBe('KIRANA')
})

test('a kirana missing its UPI ID is sent to that step, and Submit refused for it says so', async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER', { status: 'DRAFT', shopVideoFileId: 'fv-video' })
  api.kirana.upiId = null
  api.kirana.sellsFood = false
  await page.goto('/')
  await expect(page).toHaveURL(/\/register\/upi$/)
  // The review with it missing: Submit can't be tapped, and the line says Add
  await page.goto('/register/review')
  await expect(page.getByText('UPI ID: missing')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit for the visit' })).toBeDisabled()
  await page.getByRole('link', { name: 'Add' }).last().click()
  await expect(page).toHaveURL(/\/register\/upi\?from=review$/)
  await page.getByLabel("Your shop's UPI ID").fill('ravi@ybl')
  await page.getByRole('button', { name: 'Save and go back to the review' }).click()
  await expect(page).toHaveURL(/\/register\/review$/)
  await expect(page.getByText('UPI ID: ravi@ybl')).toBeVisible()
})

test("a kirana selling food can't submit without its FSSAI licence, and one refused sends it back to the papers", async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER', { status: 'DRAFT', shopVideoFileId: 'fv-video' })
  api.kirana.sellsFood = null
  // Resuming: photos and video are in, so the papers come next
  await page.goto('/')
  await expect(page).toHaveURL(/\/register\/licences$/)
  await page.goto('/register/review')
  await expect(page.getByText('Sells food: not answered')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit for the visit' })).toBeDisabled()

  api.kirana.sellsFood = true
  api.files.push({ id: 'f-old', purpose: 'REG_DOC' })
  api.kirana.fssai = { ...api.kirana.fssai, status: 'REJECTED', number: '12345678901234', fileId: 'f-old', reason: 'This is a GST certificate, not an FSSAI one.' }
  await page.goto('/register/licences')
  await expect(page.getByText(/Not accepted\. This is a GST certificate/)).toBeVisible()
  await expect(page.getByText('Your FSSAI certificate wasn’t accepted: add the right one.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  // The review keeps Submit off while it is refused
  await page.goto('/register/review')
  await expect(page.getByText(/FSSAI: 12345678901234 · not accepted/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit for the visit' })).toBeDisabled()

  // The same certificate again: a person looks at it, and Continue works while it is checked
  await page.goto('/register/licences')
  await page.getByRole('button', { name: 'Ask a person to check it' }).click()
  await expect(page.getByText('Our team is checking it, usually within a day. You can go on meanwhile.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

test("a kirana selling no food goes on with no FSSAI; the answer can be changed until it's verified", async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER', { status: 'DRAFT', shopVideoFileId: 'fv-video' })
  api.kirana.sellsFood = null
  await page.goto('/register/licences')
  await page.getByRole('button', { name: 'No food at all' }).click()
  await expect(page.getByText('No FSSAI needed. Our field team checks the shop at the visit.')).toBeVisible()
  await expect(page.getByLabel('FSSAI number')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/register\/upi$/)
  expect(api.calls.filter((c) => c.path === '/api/v1/kirana/settings/sells-food').map((c) => c.body)).toEqual([{ sellsFood: false }])
})

test('a kirana that already billed stays a kirana when sent back', async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER', { status: 'DRAFT', statusReason: 'Shop board not visible.' })
  api.kirana.product({ name: 'Tata Salt 1 kg' })
  await page.goto('/register/kind')
  await page.getByRole('button', { name: /Salon \/ barber shop/ }).click()
  await page.getByRole('button', { name: 'Yes, it is a salon' }).click()
  await expect(page.getByText('so it stays a kirana. If it really is a salon, write to support.', { exact: false })).toBeVisible()
  expect(api.shop!.type).toBe('KIRANA')
})

test('an FSSAI licence whose last day passed counts as missing, as the backend counts it', async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER', { status: 'DRAFT', shopVideoFileId: 'fv-video' })
  api.kirana.sellsFood = true
  api.kirana.fssai = { ...api.kirana.fssai, status: 'VERIFIED', number: '12345678901234', fileId: 'f-old', validUntil: '2020-01-01' }
  await page.goto('/register/licences')
  await expect(page.getByText('It expired on', { exact: false })).toBeVisible()
  await expect(page.getByText('Your FSSAI licence has expired: add the renewed one.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

test('selling food with no FSSAI licence yet: where to get one, and that what was saved stays', async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER', { status: 'DRAFT', shopVideoFileId: 'fv-video' })
  api.kirana.sellsFood = true
  await page.goto('/register/licences')
  await page.getByText('Don’t have an FSSAI licence yet?').click()
  const site = page.getByRole('link', { name: 'foscos.fssai.gov.in' })
  await expect(site).toBeVisible()
  await expect(site).toHaveAttribute('href', 'https://foscos.fssai.gov.in')
  await expect(site).toHaveAttribute('target', '_blank')
  await expect(page.getByText('Basic Registration', { exact: true })).toBeVisible()
  await expect(page.getByText('What you’ve already saved (your answers, photos and video) stays.', { exact: false })).toBeVisible()
  // Left and back (More → Licences after registering shows the same card): the food answer is still there
  await page.reload()
  await expect(page.getByRole('button', { name: 'Yes, some food' })).toHaveAttribute('aria-pressed', 'true')
  // Once a certificate is added the note goes
  await page.getByLabel('FSSAI number').fill('12345678901234')
  await page.getByLabel('Add the FSSAI certificate').setInputFiles({ name: 'fssai.jpg', mimeType: 'image/jpeg', buffer: JPEG })
  await expect(page.getByText('Don’t have an FSSAI licence yet?')).toHaveCount(0)
})

test('an expired FSSAI licence says where to renew it', async ({ page, context, api }) => {
  await signedIn(context, api, 'KIRANA')
  api.kiranaShop('OWNER')
  api.kirana.sellsFood = true
  api.kirana.fssai = { ...api.kirana.fssai, status: 'VERIFIED', number: '12345678901234', fileId: 'f-old', validUntil: '2020-01-01' }
  await page.goto('/kirana/licences')
  await page.getByText('How do I renew my FSSAI licence?').click()
  await expect(page.getByRole('link', { name: 'foscos.fssai.gov.in' })).toBeVisible()
})
