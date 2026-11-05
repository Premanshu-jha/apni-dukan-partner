import { addDays, istInstant, minutesFromNow, todayIst } from './mockApi'
import { atSalon, expect, signedIn, test } from './helpers'

test('a walk-in put on the wrong barber is moved, a mistaken one cancelled, and a quick one finished early', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Haircut/).check()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByLabel("Customer's name (optional)").fill('Sunil')
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await expect(page).toHaveURL(/\/salon\/day$/)

  // Meant for Imran: give it to him (the rest of the visit, from now)
  await page.getByText('Sunil').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Give to another barber' }).click()
  await expect(sheet.getByText('The rest of the visit moves to him from now.', { exact: false })).toBeVisible()
  await sheet.getByRole('button', { name: 'Imran' }).click()
  await sheet.getByRole('button', { name: 'Give to Imran' }).click()
  await expect(sheet.getByText('Given to another barber.')).toBeVisible()
  await expect(sheet.getByText('· Imran')).toBeVisible()

  // Added by mistake: cancelled (no customer to tell)
  await sheet.getByRole('button', { name: 'Cancel walk-in' }).click()
  await sheet.getByLabel('Reason').fill('Added twice')
  await sheet.getByRole('button', { name: 'Cancel walk-in' }).click()
  await expect(sheet.getByText('Cancelled.', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()

  // A beard trim done in 5 minutes: Done early frees the rest
  api.addBooking({ kind: 'WALK_IN', startsAt: minutesFromNow(-5), status: 'IN_SERVICE', serviceIds: ['v1'], customerName: null, guestName: 'Quick', bookingNo: null })
  await page.reload()
  await page.getByText('Quick').click()
  await page.getByRole('button', { name: 'Done early' }).click()
  await expect(page.getByText("This can't be undone.", { exact: false })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Done early' }).click()
  await expect(page.getByText('Done. The rest of the time is free.')).toBeVisible()
  expect(api.calls.some((c) => c.path.endsWith('/finish'))).toBe(true)
})

test('a walk-in in the chair for over 15 minutes can only be finished, not cancelled', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ kind: 'WALK_IN', startsAt: minutesFromNow(-20), status: 'IN_SERVICE', customerName: null, guestName: 'Long', bookingNo: null })
  await page.goto('/salon/day')
  await page.getByText('Long').click()
  await expect(page.getByText('In the chair for over 15 minutes: use Done early instead of cancelling.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel walk-in' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Give to another barber' })).toBeVisible()
})

test('a barber with walk-in access sees everyone but works only his own column, and fixes walk-ins he added', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  api.walkIns = true
  api.addBooking({ startsAt: minutesFromNow(5), staffId: 'st1', customerName: 'Not Mine' })
  api.addBooking({ startsAt: minutesFromNow(5), staffId: 'st2', customerName: 'Mine' })
  await page.goto('/salon/day')
  await expect(page.getByRole('button', { name: 'Everyone' })).toBeVisible()

  await page.getByText('Not Mine').click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Start' })).toBeHidden()
  await expect(page.getByRole('dialog').getByRole('button', { name: /No-show/ })).toBeHidden()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByText('Mine', { exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Start' })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  // "Add break" is for his own column even with everyone on screen
  await page.getByRole('button', { name: 'Add break' }).click()
  await expect(page).toHaveURL(/staff=st2/)
  await page.goBack()

  // A walk-in he put on Ravi by mistake: he may cancel it (he is busy himself, so moving it to him is refused)
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Beard trim/).check()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByLabel("Customer's name (optional)").fill('Wrong Chair')
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await page.getByText('Wrong Chair').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('button', { name: 'Give to another barber' }).click()
  await sheet.getByRole('button', { name: 'Imran' }).click()
  await sheet.getByRole('button', { name: 'Give to Imran' }).click()
  await expect(sheet.getByText('Imran is busy at that time.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Back' }).click()
  await sheet.getByRole('button', { name: 'Cancel walk-in' }).click()
  await sheet.getByLabel('Reason').fill('Wrong barber')
  await sheet.getByRole('button', { name: 'Cancel walk-in' }).click()
  await expect(sheet.getByText('Cancelled.', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()

  // Another one on Ravi that went quickly: he may finish it too
  await page.getByRole('button', { name: '+ Walk-in' }).click()
  await page.getByLabel(/Beard trim/).check()
  await page.getByRole('button', { name: /Ravi.*Free now/ }).click()
  await page.getByLabel("Customer's name (optional)").fill('Quick Trim')
  await page.getByRole('button', { name: 'Start now with Ravi' }).click()
  await page.getByText('Quick Trim').click()
  await sheet.getByRole('button', { name: 'Done early' }).click()
  await sheet.getByRole('button', { name: 'Done early' }).click()
  await expect(sheet.getByText('Done. The rest of the time is free.')).toBeVisible()
})

test('a walk-in moved to another barber keeps its 15 minutes from when it was put in a chair', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  // In a chair 20 minutes ago, moved to Imran 5 minutes ago (its slot starts then; its chair time doesn't)
  api.addBooking({ kind: 'WALK_IN', staffId: 'st2', startsAt: minutesFromNow(-5), startedAt: minutesFromNow(-20), status: 'IN_SERVICE', customerName: null, guestName: 'Moved', bookingNo: null })
  await page.goto('/salon/day')
  await page.getByText('Moved').click()
  await expect(page.getByText('In the chair for over 15 minutes: use Done early instead of cancelling.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel walk-in' })).toBeHidden()
})

test('a barber can’t remove his own break once it has started', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  api.appointments.push({ id: 'mb', kind: 'BLOCK', blockType: 'BREAK', staffId: 'st2', status: 'BLOCKED', startsAt: minutesFromNow(-10), endsAt: minutesFromNow(20), services: [], startedAt: null, startedWithCode: null, bookingNo: null, customerName: null, guestName: null, cancelReason: null, closureId: null, createdBy: 'u1' })
  api.appointments.push({ id: 'lb', kind: 'BLOCK', blockType: 'BREAK', staffId: 'st2', status: 'BLOCKED', startsAt: minutesFromNow(60), endsAt: minutesFromNow(75), services: [], startedAt: null, startedWithCode: null, bookingNo: null, customerName: null, guestName: null, cancelReason: null, closureId: null, createdBy: 'u1' })
  await page.goto('/salon/day')
  await page.getByRole('button', { name: /Break/ }).first().click()
  await expect(page.getByRole('button', { name: 'Remove break' })).toBeHidden()
  await page.getByRole('button', { name: 'Close' }).click()
  // Opened before it started: the backend refuses once it has, and the sheet says why
  const later = api.appointments.find((x) => x.id === 'lb')!
  await page.getByRole('button', { name: /Break/ }).nth(1).click()
  later.startsAt = minutesFromNow(-1)
  await page.getByRole('button', { name: 'Remove break' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove break' }).click()
  await expect(page.getByText('This break has started; it stays.', { exact: false })).toBeVisible()
})

test('the code screen stops Start once its window closes', async ({ page, context, api }) => {
  await page.clock.install()
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(-14), customerName: 'Last Minute' })
  await page.goto('/salon/day')
  await page.getByText('Last Minute').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
  await page.getByLabel("The customer's 4-digit code").fill('4821')
  await page.clock.fastForward('02:00')
  await expect(page.getByText('Start is closed now: the 15-minute hold is over.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /start anyway/ })).toBeDisabled()
})

test('a barber whose walk-in access was taken away no longer gets fix buttons on walk-ins he added', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  api.walkIns = false
  api.addBooking({ kind: 'WALK_IN', staffId: 'st2', startsAt: minutesFromNow(-3), startedAt: minutesFromNow(-3), status: 'IN_SERVICE', customerName: null, guestName: 'Mine Earlier', bookingNo: null, createdBy: 'u1' })
  await page.goto('/salon/day')
  await page.getByText('Mine Earlier').click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('button', { name: 'Done early' })).toBeVisible()   // his own chair
  await expect(sheet.getByRole('button', { name: 'Cancel walk-in' })).toBeHidden()
  await expect(sheet.getByRole('button', { name: 'Give to another barber' })).toBeHidden()
})

test('a booking taken from a barber says so instead of "no such appointment"', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  const b = api.addBooking({ startsAt: minutesFromNow(5), staffId: 'st2' })
  await page.goto('/salon/day')
  await page.getByText('Riya Sharma').click()
  // The owner gives it to Ravi meanwhile
  Object.assign(b, { staffId: 'st1', reassignedFrom: 'st2' })
  await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
  await page.getByLabel("The customer's 4-digit code").fill('4821')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('It was given to another barber. Reload.')).toBeVisible()
})

test('starting early while someone is still in the chair says why', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  // Someone in Ravi's chair until 5 minutes from now; the next booking is at 10 minutes from now
  api.addBooking({ kind: 'WALK_IN', startsAt: minutesFromNow(-25), status: 'IN_SERVICE', serviceIds: ['v1'], customerName: null, guestName: 'Before', bookingNo: null })
  api.addBooking({ startsAt: minutesFromNow(10), customerName: 'Early Bird' })
  await page.goto('/salon/day')
  await page.getByText('Early Bird').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /start anyway/ }).click()
  await expect(page.getByText(/busy \(another customer or a break\)/)).toBeVisible()
})

test('a barber’s own breaks: today or tomorrow, 4 hours a day, and he can’t remove the owner’s break', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  const tomorrow = addDays(todayIst(), 1)
  // The owner gave him a break tomorrow
  api.appointments.push({ id: 'ob', kind: 'BLOCK', blockType: 'BREAK', staffId: 'st2', status: 'BLOCKED', startsAt: `${tomorrow}T07:30:00.000Z`, endsAt: `${tomorrow}T08:30:00.000Z`, services: [], startedAt: null, startedWithCode: null, bookingNo: null, customerName: null, guestName: null, cancelReason: null, closureId: null, createdBy: 'u0' })
  await page.goto(`/salon/day?date=${tomorrow}`)
  await page.getByRole('button', { name: /Break/ }).click()
  await expect(page.getByRole('button', { name: 'Remove break' })).toBeHidden()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Add break' }).click()
  await expect(page.getByText('Your own breaks: today or tomorrow, up to 4 hours a day.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Day')).toHaveAttribute('max', tomorrow)
  await page.getByLabel('From').fill('10:00')
  await page.getByLabel('To').fill('15:00')
  await page.getByRole('button', { name: 'Save break' }).click()
  await expect(page.getByText('Your own breaks can be at most 4 hours a day.')).toBeVisible()
  expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/blocks'))).toBe(false)
})

test('new salon messages show with their own marks', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('HELPER')
  api.inbox = [
    { id: 'n1', type: 'SALON_BOOKING_REASSIGNED', title: 'Booking moved to Imran, 4:30 PM', body: 'Riya: now with Imran instead of Ravi.', url: '/salon/day', sentAt: new Date().toISOString(), read: false },
    { id: 'n2', type: 'SALON_CANCELLED_BY_SALON', title: 'Booking cancelled by the salon, 5:00 PM', body: 'Arjun: cancelled by the salon.', url: '/salon/day', sentAt: new Date().toISOString(), read: false },
  ]
  await page.goto('/notifications')
  await expect(page.getByText('Booking moved to Imran, 4:30 PM')).toBeVisible()
  await expect(page.getByText('⇄')).toBeVisible()
})

test('Start shows only in its window, and undo only within 24 hours', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  api.addBooking({ startsAt: minutesFromNow(40), customerName: 'Later' })
  const old = api.addBooking({ startsAt: new Date(Date.now() - 26 * 3600_000).toISOString(), customerName: 'Last Week', status: 'NO_SHOW' })
  await page.goto('/salon/day')
  await page.getByText('Later').click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Start' })).toBeHidden()
  await expect(page.getByText(/Start opens at .*, 15 minutes before\./)).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.goto(`/salon/day?date=${new Date(Date.parse(old.startsAt as string) + 5.5 * 3600_000).toISOString().slice(0, 10)}`)
  await page.getByText(/Done, cancelled and no-shows/).click()
  await page.getByText('Last Week').click()
  await expect(page.getByRole('button', { name: 'Undo no-show' })).toBeHidden()
})

test('offline: the board says so instead of spinning or showing old times silently', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  api.offline = true   // every request fails as it does with no network
  await page.getByRole('link', { name: 'Bookings' }).click()
  await expect(page.getByText(/offline/)).toBeVisible({ timeout: 20_000 })
})

test('a barber’s "Add break" only on today and tomorrow; owners pick the barber from "Everyone"', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon('BARBER')
  await page.goto(`/salon/day?date=${addDays(todayIst(), 3)}`)
  await expect(page.getByRole('heading', { name: /\w/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add break' })).toBeHidden()
})

test('the owner adds a break from "Everyone", choosing the barber', async ({ page, context, api }) => {
  await atSalon(page, context, api)
  await page.getByRole('button', { name: 'Add break' }).click()
  await expect(page).toHaveURL(/time-off\?date=/)
  await page.getByRole('group', { name: 'Barber' }).getByRole('button', { name: 'Imran' }).click()
  await page.getByLabel('Day').fill(addDays(todayIst(), 1))
  await page.getByRole('button', { name: 'Save break' }).click()
  await expect(page).toHaveURL(/\/salon\/day/)
})

test('leave over several days shows its days, and the give-to list has only barbers who can take it', async ({ page, context, api }) => {
  await signedIn(context, api)
  api.approvedSalon()
  const today = todayIst()
  api.appointments.push({ id: 'lv', kind: 'BLOCK', blockType: 'LEAVE', staffId: 'st2', status: 'BLOCKED', startsAt: istInstant(addDays(today, -1), '00:00'), endsAt: istInstant(addDays(today, 2), '00:00'), services: [], startedAt: null, startedWithCode: null, bookingNo: null, customerName: null, guestName: null, cancelReason: null, closureId: null, createdBy: 'u1' })
  api.addBooking({ startsAt: minutesFromNow(20), serviceIds: ['v3'], customerName: 'Kavya' })   // Imran doesn't do colour
  api.staff.push({ id: 'st3', name: 'Old Barber', active: false, serviceIds: ['v1', 'v2', 'v3'], hours: [], loginPhone: null, photoFileId: null, version: 0 })
  await page.goto('/salon/day')
  await expect(page.getByText('to Tomorrow')).toBeVisible()
  await page.getByText('Kavya').click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Give to another barber' })).toBeHidden()
})
