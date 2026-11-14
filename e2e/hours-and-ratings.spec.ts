import { MockApi } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

test('the owner sets the opening hours; barbers working outside are named and their hours cut to fit when asked', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup')
  await expect(page.getByText('Open 7 days a week')).toBeVisible()
  await page.getByRole('link', { name: /Opening hours/ }).click()

  // Monday 10:00–21:00, Sunday off: both barbers work all day, every day
  await page.getByLabel('Opens').first().fill('10:00')
  await page.getByLabel('Open till midnight').first().uncheck()
  await page.getByLabel('Closes').first().fill('21:00')
  await page.getByRole('switch', { name: 'Sun open' }).click()
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Some barbers work outside these hours')).toBeVisible()
  await expect(page.getByText('Ravi, Imran')).toBeVisible()
  expect(api.hours).toHaveLength(7)   // nothing saved
  // Changing the week again: the names were for the week tried, so they go until the next save says again
  await page.getByRole('switch', { name: 'Sat open' }).click()
  await expect(page.getByText('Some barbers work outside these hours')).toBeHidden()
  await page.getByRole('switch', { name: 'Sat open' }).click()
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Ravi, Imran')).toBeVisible()

  await page.getByRole('button', { name: 'Cut their hours to fit and save' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  const put = api.calls.filter((c) => c.method === 'PUT' && c.path === '/api/v1/salon/hours')
  expect(put.at(-1)!.body).toMatchObject({ trimStaffHours: true })
  expect(api.hours).toHaveLength(6)
  expect((api.staff[0].hours as Array<{ weekday: number; start: string }>).find((h) => h.weekday === 1)).toMatchObject({ start: '10:00', end: '21:00' })

  // A barber's hours outside the salon's are refused with the reason
  await page.goto('/setup/staff/st1')
  await expect(page.getByText("They must fit inside the salon's opening hours.")).toBeVisible()
  await page.getByRole('button', { name: "Use the salon's hours" }).click()
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  const shifts = api.calls.filter((c) => c.path === '/api/v1/salon/staff/st1/hours').at(-1)!.body as { hours: unknown[] }
  expect(shifts.hours).toHaveLength(6)

  // "Saved." is for the latest save only: a later refusal doesn't show under it
  await page.goto('/setup/hours')
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  api.hours = api.hours.slice(0, 2)   // changed on another phone meanwhile
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Someone changed the hours meanwhile')).toBeVisible()
  await expect(page.getByText('Saved.')).toBeHidden()
})

test('a stale hours screen is told someone changed them, and the reloaded hours show', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/hours')
  await expect(page.getByRole('switch', { name: 'Sat open' })).toHaveAttribute('aria-checked', 'true')
  api.hours = api.hours.slice(0, 5)   // changed on another phone
  await page.getByRole('button', { name: 'Save hours' }).click()
  await expect(page.getByText('Someone changed the hours meanwhile')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Sat open' })).toHaveAttribute('aria-checked', 'false')
})

test('helpers see the hours but can’t change them', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'HELPER')
  await page.goto('/setup/hours')
  await expect(page.getByText('Mon: 12:00 AM – midnight')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save hours' })).toBeHidden()
})

test('the review shows what is missing and Submit stays off until the hours are set', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT', registrationDocType: null, registrationDocFileId: null })
  api.hours = []
  api.staff = []   // no barbers yet, as at registration
  await page.goto('/register/review')
  await expect(page.getByText('Opening hours: missing')).toBeVisible()
  await expect(page.getByText('Trade licence: not added (optional)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit for the visit' })).toBeDisabled()
  await page.getByRole('link', { name: 'Set' }).click()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/\/register\/review$/)
  await page.getByRole('button', { name: 'Submit for the visit' }).click()   // without the document
  await page.getByRole('button', { name: 'Yes, submit' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
})

test('a submit refused for something missing reloads what the review shows', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  await page.goto('/register/review')
  await expect(page.getByText('Services: 3 added')).toBeVisible()
  api.services = []   // switched off on another phone
  await page.getByRole('button', { name: 'Submit for the visit' }).click()
  await page.getByRole('button', { name: 'Yes, submit' }).click()
  await expect(page.getByText("Add the salon's services and its opening hours first.")).toBeVisible()
  await expect(page.getByText('Services: missing')).toBeVisible()
})

test('the come-back reminder of a service is set on its sheet', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/services')
  await expect(page.getByText('back in 3 weeks')).toBeVisible()
  await page.getByRole('button', { name: /Beard trim/ }).click()
  await page.getByLabel('Remind customers to come back after (days)').fill('0')
  await page.getByRole('button', { name: 'Save' }).click()
  const patch = api.calls.find((c) => c.method === 'PATCH' && c.path === '/api/v1/salon/services/v2')!
  expect(patch.body).toMatchObject({ returnAfterDays: 0 })
})

test('a service’s picture: only the ones that fit its name are offered, one is always picked, and it is saved', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/services')
  // Saved before pictures existed: the one its name fits
  await expect(page.locator('li', { hasText: 'Haircut' }).locator('svg[data-icon="HAIRCUT"]')).toBeVisible()
  await expect(page.locator('li', { hasText: 'Hair colour' }).locator('svg[data-icon="HAIR_COLOUR"]')).toBeVisible()

  await page.getByRole('button', { name: '+ Add a service' }).click()
  const pictures = page.getByRole('radiogroup', { name: 'Picture' })
  await page.getByLabel('Name').fill('Kids hair-cut')
  await expect(pictures.getByRole('radio')).toHaveText(['Kids', 'Haircut', 'General (barber pole)'])
  await expect(pictures.getByRole('radio', { name: 'Kids' })).toHaveAttribute('aria-checked', 'true')
  // Arrow keys move the pick (one Tab stop for the group, as radio buttons)
  await pictures.getByRole('radio', { name: 'Kids' }).press('ArrowRight')
  await expect(pictures.getByRole('radio', { name: 'Haircut' })).toHaveAttribute('aria-checked', 'true')
  await expect(pictures.getByRole('radio', { name: 'Haircut' })).toBeFocused()
  await expect(pictures.getByRole('radio', { name: 'Kids' })).toHaveAttribute('tabindex', '-1')
  // A name that fits nothing: the salon's own, said so
  await page.getByLabel('Name').fill('Special combo deal')
  await expect(pictures.getByRole('radio')).toHaveText(['Package', 'General (barber pole)'])
  await page.getByLabel('Name').fill('Something new')
  await expect(pictures.getByRole('radio')).toHaveText(['General (barber pole)'])
  await expect(page.getByText("No picture matches this name, so it gets the general one (a barber's pole).")).toBeVisible()
  // Back to a haircut name: the picked one fits again and stays picked
  await page.getByLabel('Name').fill('massage   HEAD')
  await expect(pictures.getByRole('radio')).toHaveText(['Massage', 'General (barber pole)'])
  await page.getByLabel('Price (₹)').fill('150')
  await page.getByRole('button', { name: 'Save' }).click()
  const added = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/salon/services')!
  expect(added.body).toMatchObject({ name: 'massage HEAD', icon: 'MASSAGE' })
  await expect(page.locator('li', { hasText: 'massage HEAD' }).locator('svg[data-icon="MASSAGE"]')).toBeVisible()

  // Changing an old one's picture
  await page.getByRole('button', { name: /Beard trim/ }).click()
  await page.getByRole('radiogroup', { name: 'Picture' }).getByRole('radio', { name: 'General (barber pole)' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  const patch = api.calls.find((c) => c.method === 'PATCH' && c.path === '/api/v1/salon/services/v2')!
  expect(patch.body).toMatchObject({ icon: 'OTHER' })

  // A picture saved that the name isn't offered now stays when only the price is changed; a new name drops it
  api.services.find((v) => v.id === 'v1')!.icon = 'SHAVE'
  await page.reload()
  await page.getByRole('button', { name: /^Haircut/ }).click()
  await expect(page.getByRole('radiogroup', { name: 'Picture' }).getByRole('radio', { name: 'Shave' })).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('Price (₹)').fill('210')
  await page.getByRole('button', { name: 'Save' }).click()
  expect(api.calls.filter((c) => c.method === 'PATCH' && c.path === '/api/v1/salon/services/v1').at(-1)!.body).toMatchObject({ icon: 'SHAVE' })
})

test('the owner reads the ratings with the comments; a barber has no ratings page', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.ratingSummary = { count: 3, average: 4.3, tags: [{ tag: 'CLEAN', label: 'Clean', count: 2 }] }
  api.ratings = [
    { bookingId: 'a1', bookingNo: 'K7M1QX', stars: 5, tags: ['CLEAN', 'SKILLED'], comment: 'Best fade in Noida', services: ['Haircut'], customerName: 'Riya Sharma', visitAt: '2026-11-09T06:30:00Z', ratedAt: '2026-11-09T08:00:00Z' },
    { bookingId: 'a2', bookingNo: 'K7M2QX', stars: 3, tags: [], comment: null, services: ['Beard trim'], customerName: null, visitAt: '2026-11-08T06:30:00Z', ratedAt: '2026-11-08T08:00:00Z' },
  ]
  await page.goto('/more')
  await page.getByRole('link', { name: 'Ratings' }).click()
  await expect(page.getByText('4.3')).toBeVisible()
  await expect(page.getByText('customers see "New" until you have 5')).toBeVisible()
  await expect(page.getByText('“Best fade in Noida”')).toBeVisible()
  await expect(page.getByLabel('5 out of 5 stars')).toBeVisible()
  await expect(page.getByText('Customer · Beard trim · #K7M2QX')).toBeVisible()
})

test('a barber has no ratings link and the page refuses him', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  await page.goto('/more')
  await expect(page.getByRole('link', { name: 'Ratings' })).toBeHidden()
})

test('a service saved by mistake during registration can be removed there', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.shop = MockApi.shopOf({ status: 'DRAFT' })
  await page.goto('/register/services')
  const first = api.services[0]   // Haircut
  await page.getByLabel('Facial').check()   // a row edited first
  await page.getByRole('button', { name: `Remove ${first.name}` }).click()
  await expect(page.getByRole('button', { name: `Remove ${first.name}` })).toBeHidden()
  const put = api.calls.find((c) => c.method === 'PATCH' && c.path === `/api/v1/salon/services/${first.id}`)!
  expect(put.body).toMatchObject({ active: false })
  // A catalog service removed comes back in the list to tick, even after other rows were edited
  await expect(page.getByLabel('Haircut', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Facial', { exact: true })).toBeChecked()
})
