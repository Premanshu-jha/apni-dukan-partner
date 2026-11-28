import { atSalon, expect, JPEG, signedIn, test, languageKept } from './helpers'
import { MockApi, minutesFromNow } from './mockApi'

/** The usability round "never stuck": Call us / WhatsApp us everywhere, messages that open their screen, no dead ends. */

test('Need help: Call us and WhatsApp us first, with the screen and the shop code typed in', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/salon/walk-in')
  await page.getByRole('link', { name: /^Help/ }).click()
  await expect(page.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919381251613')
  const chat = new URL((await page.getByRole('link', { name: 'WhatsApp us' }).getAttribute('href'))!)
  expect(chat.searchParams.get('text')).toBe('Hello Clozest, I need help. Screen: Walk-in. Shop code: 10234')
  await expect(page.getByText('Tell us your shop code: 10234')).toBeVisible()
  // Above Write to us, seen without scrolling on a phone
  await expect(page.getByRole('link', { name: 'Call us' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Write to us' })).toBeVisible()
})

test('signed out: Help opens Need help with Call us, and writing asks to sign in first', async ({ page, context }) => {
  await languageKept(context)
  await page.goto('/signin')
  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page.getByRole('heading', { name: 'Need help' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toBeVisible()
  await expect(page.getByText('Writing to us needs a sign-in')).toBeVisible()
  // The answers need no sign-in
  await expect(page.getByText('What should the salon video show?')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/signin$/)
})

test('the email step: no email? Call us there; Help opens Need help without bouncing back; Add my email comes back to the form', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.user = { ...MockApi.completeUser(), emailVerified: false }
  await page.goto('/welcome/email')
  await expect(page.getByRole('heading', { name: 'Your email' })).toBeVisible()
  await expect(page.getByText("No email, or the code doesn't come? Call us or WhatsApp us.")).toBeVisible()
  await expect(page.getByRole('button', { name: /Sign out and start again/ })).toBeVisible()
  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page.getByRole('heading', { name: 'Need help' })).toBeVisible()
  await expect(page).toHaveURL(/\/help\?from=%2Fwelcome%2Femail$/)
  await expect(page.getByText('Writing to us needs your email')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toBeVisible()
  await page.getByRole('button', { name: 'Add my email' }).click()
  await expect(page).toHaveURL(/\/welcome\/email$/)
  await page.getByLabel('Email').fill('owner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await expect(page.getByLabel('Your message')).toBeVisible()
})

test('Wrong number on the email step: sign out and start again', async ({ page, context, api }) => {
  await languageKept(context)
  await signedIn(context, api)
  api.user = { ...MockApi.completeUser(), emailVerified: false }
  await page.goto('/welcome/email')
  await page.getByRole('button', { name: /Sign out and start again/ }).click()
  await expect(page).toHaveURL(/\/signin$/)
})

test('the code step says what to do when no SMS comes, with Call us', async ({ page, api, context }) => {
  await languageKept(context)
  void api   // the fake backend answers the code request
  await page.goto('/signin')
  await page.getByLabel('Mobile number').fill('98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('Code')).toBeVisible()
  await expect(page.getByText(/No SMS\? Check the number above/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toBeVisible()
})

test('Messages: "Pay your subscription" opens the pay screen; shop news opens More; an unknown one says what it was about', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  const now = new Date().toISOString()
  api.inbox = [
    { id: 'n1', type: 'SUBSCRIPTION_ENDING', title: 'Your free trial ends soon', body: 'Set up AutoPay.', url: '/subscription', sentAt: now, read: false },
    { id: 'n2', type: 'SHOP_INVITE_ACCEPTED', title: 'Invitation accepted', body: 'Asha joined.', url: '/shops/me', sentAt: now, read: false },
    { id: 'n3', type: 'SOMETHING_NEW', title: 'A new kind of message', body: 'From a newer version.', url: '/somewhere-new', sentAt: now, read: false },
  ]
  await page.goto('/notifications')
  await page.getByRole('button', { name: /Your free trial ends soon/ }).click()
  await expect(page).toHaveURL(/\/subscription$/)
  await page.goBack()
  await page.getByRole('button', { name: /Invitation accepted/ }).click()
  await expect(page).toHaveURL(/\/more$/)
  await page.goto('/notifications')
  await page.getByRole('button', { name: /A new kind of message/ }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('That message is about: A new kind of message')).toBeVisible()
  // Said once: not again after a reload
  await page.reload()
  await expect(page.getByText('That message is about: A new kind of message')).toHaveCount(0)
})

test('More → Messages → back comes back to More', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More', exact: true }).click()
  await page.getByRole('link', { name: 'Messages' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/more$/)
})

test('a barber opening an owner-only screen is told why on Today, and who to ask', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  await page.goto('/team')
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('Only the owner can open that screen. Ask Ravi Kumar.')).toBeVisible()
  await page.goto('/setup/services')
  await expect(page.getByText('Only the owner or a helper can open that screen. Ask Ravi Kumar.')).toBeVisible()
})

test('a suspended salon: Write to us right in the banner, with the salon and its code', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('OWNER', { status: 'SUSPENDED', statusReason: 'The licence expired' })
  await page.goto('/salon/day')
  await expect(page.getByText(/is off the app: The licence expired/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toBeVisible()
  await page.getByRole('link', { name: 'Write to us', exact: true }).click()
  await expect(page.getByLabel("What's it about? (optional)")).toHaveValue('My salon is off the app')
  await expect(page.getByLabel('Your message')).toHaveValue(/Shine Unisex Salon is off the app\. Shop code: 10234\./)
})

test('walk-in with no services: the owner gets "Add your services", and comes back to walk-in', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.services = []
  await page.goto('/salon/walk-in')
  await expect(page.getByText('Add your services first, then you can add a walk-in.')).toBeVisible()
  await page.getByRole('link', { name: 'Add your services' }).click()
  await expect(page).toHaveURL(/\/setup\/services$/)
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/salon\/walk-in$/)
})

test('inviting a helper: which app to install and Send on WhatsApp; helpers are on the Salon tab too', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'Salon', exact: true }).click()
  await page.getByRole('link', { name: /Team \(helpers\)/ }).click()
  await expect(page).toHaveURL(/\/team$/)
  await page.getByLabel("Helper's mobile number").fill('9876500011')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText("Invitation sent. They'll see it in the Clozest Partner app when they sign in with this number.")).toBeVisible()
  await expect(page.getByText(/Now tell them: install the Clozest Partner app \(or open partner\.clozest\.in\) and sign in with \+91 98765 00011/)).toBeVisible()
  const chat = new URL((await page.getByRole('link', { name: 'Send on WhatsApp' }).getAttribute('href'))!)
  expect(chat.pathname).toBe('/919876500011')
  expect(chat.searchParams.get('text')).toMatch(/^Shine Unisex Salon invited you on Clozest Partner\./)
  await page.getByRole('link', { name: 'Adding a barber? Invite him on his page' }).click()
  await expect(page).toHaveURL(/\/setup\/staff$/)
})

test('a helper waiting for approval can leave the salon, change the language and get help', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('HELPER', { status: 'PENDING_VISIT' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Leave Shine Unisex Salon' })).toBeVisible()
  await page.getByRole('button', { name: /^Language: English$/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'हिन्दी' }).click()
  await expect(page.getByRole('button', { name: /^भाषा: हिन्दी$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Shine Unisex Salon छोड़ें' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /छोड़ें/ }).last().click()
  await expect(page).toHaveURL(/\/signin$/)
})

test('registration: the language and Help at the top of every step; no help link under the form', async ({ page, context, api }) => {
  await signedIn(context, api)
  await page.goto('/register')
  await expect(page.getByRole('button', { name: /^Language: English$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Need help? Write to support' })).toHaveCount(0)
  await page.getByRole('link', { name: /^Help/ }).click()
  await expect(page.getByRole('heading', { name: 'Registering your salon' })).toBeVisible()
  await expect(page.getByText('Which paper counts as a trade licence?')).toBeVisible()
})

test('a booking: the sheet\'s Help is at its top in every step; a barber is told who can start without the code', async ({ page, context, api }) => {
  await atSalon(page, context, api, 'BARBER')
  api.addBooking({ startsAt: minutesFromNow(5), staffId: 'st2' })
  await page.reload()
  await page.getByText('Riya Sharma').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Start' }).click()
  await expect(sheet.getByText("Customer can't show the code? Ask the owner or the helper to start it.")).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Problem with this? Write to us' })).toBeVisible()
})

test('every confirmation sheet has Help (sign out everywhere on More)', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('link', { name: 'More', exact: true }).click()
  await page.getByRole('button', { name: /Sign out on all devices|Sign out everywhere/ }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Help' })).toBeVisible()
})

test('Page not found: tell us which link, its address already written', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/no-such-screen?x=1')
  await page.getByRole('link', { name: 'Tell us which link you opened' }).click()
  await expect(page.getByLabel('Your message')).toHaveValue('I opened this link and got “Page not found”: /no-such-screen?x=1')
})

test('a photo is enough: one tap writes the few words a new request needs', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/help?write=1')
  await page.locator('#help-files').setInputFiles([{ name: 'board.jpg', mimeType: 'image/jpeg', buffer: JPEG }])
  await page.getByRole('button', { name: 'Add: “Please look at the file I sent.”' }).click()
  await expect(page.getByLabel('Your message')).toHaveValue('Please look at the file I sent.')
  await page.getByRole('button', { name: 'Send to support' }).click()
  await expect(page.getByRole('heading', { name: /Sent: ticket/ })).toBeVisible()
  // The sent screen: urgent? a person to call
  await expect(page.getByRole('link', { name: 'Call us' })).toBeVisible()
})

test('offline page: a number to call', async ({ page }) => {
  await page.goto('/offline.html')
  await expect(page.getByRole('link', { name: 'Call us' })).toHaveAttribute('href', 'tel:+919381251613')
  await expect(page.getByText('Urgent? Call us or WhatsApp us: +91 93812 51613')).toBeVisible()
  await expect(page.getByText('Calls 10 AM–7 PM · WhatsApp anytime')).toBeVisible()
  await expect(page.getByText(/your shop's day/)).toBeVisible()
})

test('the Write to us form has Call us and WhatsApp us on top (a booking\'s "Problem with this?" with the error\'s words)', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.addBooking({ startsAt: minutesFromNow(5) })
  await page.reload()
  await page.getByText('Riya Sharma').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Start' }).click()
  await sheet.getByLabel("The customer's 4-digit code").fill('1111')
  await sheet.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(sheet.getByText("That code doesn't match. 4 tries left.")).toBeVisible()
  await sheet.getByRole('button', { name: 'Problem with this? Write to us' }).click()
  await expect(page.getByLabel('Your message')).toHaveValue(/The app said: “That code doesn't match\. 4 tries left\.”/)
  await expect(page.getByRole('link', { name: 'Call us' })).toBeInViewport()
  const chat = new URL((await page.getByRole('link', { name: 'WhatsApp us' }).getAttribute('href'))!)
  expect(chat.searchParams.get('text')).toMatch(/^Hello Clozest, I need help\. Screen: Booking .+\. Shop code: 10234$/)
})

test('a tapped push with no screen here opens Today saying what it was about (the start reads ?message=)', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.goto('/?message=A%20new%20kind%20of%20message')
  await expect(page).toHaveURL(/\/salon\/day$/)
  await expect(page.getByText('That message is about: A new kind of message')).toBeVisible()
})

test('walk-in: services no barber does together link to who does which service', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Hair colour/).check()
  await page.getByLabel(/Beard trim/).check()
  api.staff[0].serviceIds = ['v1', 'v3']
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('link', { name: 'Set who does which service' }).click()
  await expect(page).toHaveURL(/\/setup\/staff$/)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/\/salon\/walk-in$/)
})

test('signed out: Sign in from Need help comes back to the message form after sign-up', async ({ page, api, context }) => {
  await languageKept(context)
  void api
  await page.goto('/help?from=%2Fsignin')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByLabel('Mobile number').fill('98480 12345')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await page.getByLabel('Email').fill('ravi@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('654321')
  await page.getByLabel('Your name').fill('Ravi Kumar')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByLabel('Your message')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call us' })).toBeVisible()
})

test('Help in a sheet asks first when something was typed (a booking\'s cancel reason)', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.addBooking({ startsAt: minutesFromNow(60) })
  await page.reload()
  await page.getByText('Riya Sharma').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Cancel booking' }).click()
  await sheet.getByLabel(/reason/i).fill('Customer asked on the phone')
  page.once('dialog', (d) => void d.dismiss())
  await sheet.getByRole('button', { name: 'Problem with this? Write to us' }).click()
  await expect(sheet.getByLabel(/reason/i)).toHaveValue('Customer asked on the phone')
})
