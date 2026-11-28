import { MockApi } from './mockApi'
import { atSalon, expect, languageKept, signedIn, test } from './helpers'

/**
 * The app guiding a new salon by itself: the "Get your salon ready" card on Today, the first-time tips, and the one-line
 * hints at the top of the main screens. Each is shown once per account on this phone.
 */

const tips = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Tips for using the app' })
const card = (page: import('@playwright/test').Page) => page.getByRole('heading', { name: 'Get your salon ready' })
const next = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Next step' })

// A language chosen before (the offer at the top is answered): the guide's own order. The offer coming first is
// tested on its own below.
test.beforeEach(async ({ context }, info) => {
  if (!info.title.includes('language offer')) await languageKept(context)
})

test('a brand-new owner: the card leads step by step to the exact barber still missing his hours', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.services = []
  api.staff = []
  api.hours = []
  await page.goto('/salon/day')
  await expect(card(page)).toBeVisible()
  await expect(page.getByText(/^0 of \d done$/)).toBeVisible()
  // One guide card at a time: the tips wait until customers can book
  await expect(tips(page)).toHaveCount(0)
  await expect(next(page)).toContainText('Add your services and prices')
  await next(page).getByRole('link', { name: 'Add services' }).click()
  await expect(page).toHaveURL(/\/setup\/services$/)
  await page.getByRole('button', { name: '+ Add a service' }).click()
  await page.getByLabel('Name').fill('Haircut')
  await page.getByLabel('Minutes').fill('30')
  await page.getByLabel('Price (₹)').fill('150')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('30 min · ₹150')).toBeVisible()

  await page.goto('/salon/day')
  await expect(next(page)).toContainText('Add your barbers')
  await next(page).getByRole('button', { name: 'Add me as a barber' }).click()
  // He is a barber now, without services or hours: the card opens his own page
  const open = next(page).getByRole('link', { name: /^Open / })
  await expect(open).toBeVisible()
  await expect(open).toHaveAttribute('href', /\/setup\/staff\/st\d+$/)
  await open.click()
  await expect(page).toHaveURL(/\/setup\/staff\/st\d+$/)
})

test('needed steps done: the tips first, then the good-to-do steps; skips and tips are remembered', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await expect(tips(page)).toBeVisible()
  await expect(tips(page)).toContainText('Tip 1 of 6')
  await expect(card(page)).toHaveCount(0)
  await tips(page).getByRole('button', { name: 'Next' }).click()
  await expect(tips(page)).toContainText('Tip 2 of 6')
  await expect(tips(page)).toContainText('this phone rings')
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  await expect(tips(page)).toHaveCount(0)

  await expect(card(page)).toBeVisible()
  // The sample salon's barber Imran signs in already: the team step is done
  await expect(page.getByText('Give your barbers and helper their own sign-in')).toBeVisible()
  const step = await next(page).textContent()
  await next(page).getByRole('button', { name: 'Skip' }).click()
  await expect(next(page)).not.toHaveText(step!)
  const before = await page.getByText(/^\d of \d done$/).textContent()

  await page.reload()
  await expect(card(page)).toBeVisible()
  await expect(tips(page)).toHaveCount(0)
  await expect(page.getByText(/^\d of \d done$/)).toHaveText(before!)
})

test('the share step links to the share page and the offer step to a new offer', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  // Past the notifications step where the phone offers it
  const skipPush = next(page).filter({ hasText: 'Get a notification on this phone' }).getByRole('button', { name: 'Skip' })
  if (await skipPush.count()) await skipPush.click()
  await expect(next(page).getByRole('link', { name: 'Share your salon' })).toHaveAttribute('href', '/salon/share')
  await next(page).getByRole('button', { name: 'Skip' }).click()
  await expect(next(page).getByRole('link', { name: 'Make an offer' })).toHaveAttribute('href', '/salon/offers/new')
  await next(page).getByRole('button', { name: 'Skip' }).click()
  // All done or skipped: said once, then gone
  await expect(page.getByText('Your salon is ready. Customers can book now.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByText('Your salon is ready. Customers can book now.')).toHaveCount(0)
  await expect(card(page)).toHaveCount(0)

  // A skip is never a dead end: the Salon tab offers the skipped steps back, and Today shows them again
  await page.getByRole('link', { name: 'Salon' }).click()
  await page.getByRole('button', { name: /^Steps you skipped \(\d\)/ }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(card(page)).toBeVisible()
  await expect(page.getByText('Share your salon with your customers')).toBeVisible()
  await page.getByRole('link', { name: 'Salon', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Salon' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Steps you skipped/ })).toHaveCount(0)
})

test('skipped steps are counted on the card, and Show them brings them back', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  const skipped = next(page).textContent()
  await next(page).getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByText('1 step skipped')).toBeVisible()
  await page.reload()
  await expect(page.getByText('1 step skipped')).toBeVisible()
  await page.getByRole('button', { name: 'Show them' }).click()
  await expect(page.getByText(/steps? skipped/)).toHaveCount(0)
  await expect(next(page)).toHaveText((await skipped)!)
})

test('waiting for the visit: the owner prepares, no sharing or offer yet, and no tips', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.shop = { ...api.shop!, status: 'PENDING_VISIT' }
  api.staff[0].hours = []
  await page.goto('/salon/day')
  await expect(card(page)).toBeVisible()
  await expect(page.getByText(/once Shine Unisex Salon is approved, customers can book straight away/)).toBeVisible()
  await expect(next(page).getByRole('link', { name: 'Open Ravi' })).toHaveAttribute('href', '/setup/staff/st1')
  await expect(page.getByText('After approval: share your salon and make your first offer.')).toBeVisible()
  await expect(page.getByText('Share your salon with your customers')).toHaveCount(0)
  await expect(tips(page)).toHaveCount(0)
})

test('a helper: the tips, then what is left with "Only the owner can do this"', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('HELPER')
  // No barber customers can book yet (the needed step is the owner's)
  api.staff[0].hours = []
  api.staff[1].hours = []
  await page.goto('/salon/day')
  await expect(tips(page)).toContainText('Tip 1 of 6')
  // The start tip (the 4th), with the button only owners and helpers have
  for (let i = 0; i < 3; i++) await tips(page).getByRole('button', { name: 'Next' }).click()
  await expect(tips(page)).toContainText('“Customer can\'t show the code: start anyway”')
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  await expect(card(page)).toBeVisible()
  await expect(next(page)).toContainText('Give Ravi his services and weekly hours')
  await expect(next(page)).toContainText('Only the owner can do this.')
  await expect(next(page).getByRole('link')).toHaveCount(0)
})

test('a barber: no card, his own tips (own column, own breaks up to 4 hours)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  await page.goto('/salon/day')
  await expect(tips(page)).toContainText('your column')
  for (let i = 0; i < 5; i++) await tips(page).getByRole('button', { name: 'Next' }).click()
  await expect(tips(page)).toContainText('today or tomorrow, up to 4 hours a day')
  await tips(page).getByRole('button', { name: 'Done' }).click()
  await expect(tips(page)).toHaveCount(0)
  await expect(card(page)).toHaveCount(0)
})

test('Help’s link opens the tips again (?tips=1), and the address loses it', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  await page.goto('/salon/day?tips=1')
  await expect(tips(page)).toContainText('Tip 1 of 6')
  await expect(page).toHaveURL(/\/salon\/day$/)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(tips(page)).toHaveCount(0)
})

test('first-time hints: one line at the top of each screen, once per account, Got it in one tab hides it in the other', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const hint = page.getByTestId('first-time-hint')

  await page.getByRole('link', { name: 'Bookings' }).click()
  await expect(hint).toContainText('All bookings coming up, soonest first.')
  await hint.getByRole('button', { name: 'Got it' }).click()
  await expect(hint).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible()
  await expect(hint).toHaveCount(0)

  await page.getByRole('link', { name: 'Salon' }).click()
  await expect(hint).toContainText('Everything customers see about your salon.')

  const other = await context.newPage()
  await other.goto('/setup')
  await expect(other.getByTestId('first-time-hint')).toBeVisible()
  await other.getByTestId('first-time-hint').getByRole('button', { name: 'Got it' }).click()
  await expect(hint).toHaveCount(0)
  await other.close()

  for (const [path, text] of [
    ['/setup/staff', 'Your barbers. Tap “+ Add a barber”'],
    ['/setup/hours', 'The days and times your salon is open.'],
    ['/salon/offers', 'Discounts to fill quiet days. Tap “New offer”'],
    ['/salon/walk-in', 'Tick what they want, then pick a barber'],
  ] as const) {
    await page.goto(path)
    await expect(hint).toContainText(text)
    // In the page, never over its buttons
    await expect(hint).toBeInViewport()
  }
})

test('the services hint waits while the pictures note is up: one note at a time', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/setup/services')
  await expect(page.getByText(/The service pictures are new/)).toBeVisible()
  await expect(page.getByTestId('first-time-hint')).toHaveCount(0)
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByTestId('first-time-hint')).toContainText('Tap “+ Add a service”')
})

test('a helper’s hints say only the owner changes things', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('HELPER')
  await page.goto('/setup/services')
  await expect(page.getByTestId('first-time-hint')).toContainText('Only the owner can change them.')
})

test('a barber the owner hasn’t allowed walk-ins gets no walk-in hint', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  await page.goto('/salon/walk-in')
  await expect(page.getByText('Walk-ins need the owner\'s OK')).toBeVisible()
  await expect(page.getByTestId('first-time-hint')).toHaveCount(0)
})

test('another account on the same phone is shown the tips once too', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  await expect(tips(page)).toHaveCount(0)
  // The same phone, someone else signed in (as the shared-phone tests do)
  api.user = { ...MockApi.completeUser(), id: 'u2', phone: '9000000005', name: 'Next Person' }
  await page.evaluate((s) => localStorage.setItem('adp.session', s), api.savedSession())
  await page.reload()
  await expect(tips(page)).toBeVisible()
})

test.describe('a first open on a 740 px phone', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('the language offer comes first: no tips or setup card until it is answered, and the board\'s buttons stay on screen', async ({ page, context, api }) => {
    await atSalon(page, context, api)
    const offer = page.getByRole('region', { name: 'Use the app in your language' })
    await expect(offer).toBeVisible()
    await expect(tips(page)).toHaveCount(0)
    await expect(card(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Walk-in' })).toBeInViewport()
    await offer.getByRole('button', { name: 'Keep English' }).click()
    // Answered: the guide's next card, one at a time
    await expect(tips(page)).toBeVisible()
    await expect(card(page)).toHaveCount(0)
  })
})

test('a helper\'s walk-in tip says "if the owner lets you" (helpers start without walk-ins)', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('HELPER')
  await page.goto('/salon/day')
  await tips(page).getByRole('button', { name: 'Next' }).click()
  await tips(page).getByRole('button', { name: 'Next' }).click()
  await expect(tips(page)).toContainText('If the owner lets you: tap “+ Walk-in”')
})

test('a brand-new owner has one next step: no second "Add barbers" on the empty board, no "Too busy?" yet', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.staff = []
  await page.goto('/salon/day')
  await expect(card(page)).toBeVisible()
  await expect(page.getByText('No barbers yet')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add barbers' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Too busy? Pause online bookings' })).toHaveCount(0)
})

test('bookable with one barber set up: a second barber without hours is good to do (skippable) and opens him; the tips come', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.staff[1].hours = []
  await page.goto('/salon/day')
  // Customers can book (Ravi): the tips first, and "Too busy?" is there
  await expect(tips(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Too busy? Pause online bookings' })).toBeVisible()
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  await expect(next(page)).toContainText('Give Imran his services and weekly hours')
  await expect(next(page).getByRole('link', { name: 'Open Imran' })).toHaveAttribute('href', '/setup/staff/st2')
  await next(page).getByRole('button', { name: 'Skip' }).click()
  await expect(next(page)).not.toContainText('Imran')
})

test('back where it came from: the setup card\'s screens come back to Today, the Salon tab\'s to the Salon tab', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const services = api.services
  api.services = []
  await page.goto('/salon/day')
  await next(page).getByRole('link', { name: 'Add services' }).click()
  await expect(page).toHaveURL(/\/setup\/services$/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)

  api.services = services
  api.staff[0].hours = []
  api.staff[1].hours = []
  await page.reload()
  await next(page).getByRole('link', { name: 'Open Ravi' }).click()
  await expect(page).toHaveURL(/\/setup\/staff\/st1$/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)

  // From the Salon tab: Share and Offers come back to it (not to More)
  for (const [row, heading] of [['Share your salon', 'Share your salon'], ['Offers', 'Offers']] as const) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Salon' }).click()
    await page.getByRole('main').getByRole('link', { name: new RegExp(`^${row}`) }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page).toHaveURL(/\/setup$/)
  }
  // From the You tab (a barber's): his salon's details come back to it
  await page.goto('/more')
  await expect(page.getByRole('main').getByRole('link', { name: 'Services and prices' })).toHaveCount(0)
})

test('a setup list that fails to load: the card says so with Try again, instead of silently not being there', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.failOnce.set('/salon/services', { status: 403, code: 'FORBIDDEN', message: 'Not now.' })
  await page.goto('/salon/day')
  await tips(page).getByRole('button', { name: 'Skip tips' }).click()
  await expect(page.getByText("Couldn't check your setup.")).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText("Couldn't check your setup.")).toHaveCount(0)
  await expect(card(page)).toBeVisible()
})
