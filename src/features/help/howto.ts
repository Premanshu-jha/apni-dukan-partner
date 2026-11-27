import type { Shop, ShopRole } from '../../api/types'
import { kiranaOn } from '../../lib/config'
import { isApp } from '../../lib/platform'

/**
 * The how-to answers on the help page: what salon people ask most, each answered in 1–3 plain sentences with the
 * screen's own button words, and a "Take me there" to that screen. Texts are in howto.json as `<id>Q` and `<id>A`.
 *
 * `roles` are the roles that can open `to` (the routes' RoleOnly guards in App.tsx, the same as can() in roles.ts):
 * nobody is shown an answer for a screen they can't open. `ownerChanges`: a helper can open it but only the owner
 * changes it there (can().editSetup), so a helper reads a note saying so.
 */
export type HowToGroup = 'setup' | 'day' | 'customers' | 'account' | 'registering' | 'joining' | 'kiranaSetup' | 'kiranaDay'

export interface HowTo {
  id: string
  group: HowToGroup
  roles: readonly ShopRole[]
  /** The screen it is done on, for this role */
  to: string | ((role: ShopRole) => string)
  ownerChanges?: boolean
  /**
   * The answer's button and tab names, taken from the screens' own texts (blank → its key), so the answer always says
   * exactly what the button says, in every language, even after a button is renamed. {name} in them is the salon's.
   */
  words?: Record<string, string>
}

const ALL = ['OWNER', 'HELPER', 'BARBER'] as const
const OWNER_HELPER = ['OWNER', 'HELPER'] as const
const OWNER = ['OWNER'] as const

const TAB_TODAY = 'app.tabToday'
const TAB_BOOKINGS = 'app.tabBookings'
const TAB_SALON = 'app.tabSalon'
const TAB_MORE = 'app.tabMore'

export const GROUPS: readonly HowToGroup[] = ['setup', 'day', 'customers', 'account', 'registering', 'joining', 'kiranaSetup', 'kiranaDay']

export const HOWTOS: readonly HowTo[] = [
  { id: 'services', group: 'setup', roles: OWNER_HELPER, to: '/setup/services', ownerChanges: true,
    words: { salon: TAB_SALON, services: 'setup.servicesTitle', add: 'setup.addService', save: 'common.save' } },
  { id: 'hours', group: 'setup', roles: OWNER_HELPER, to: '/setup/hours', ownerChanges: true,
    words: { salon: TAB_SALON, hours: 'setup.hoursTitle', save: 'setup.saveSalonHours' } },
  { id: 'closedDays', group: 'setup', roles: OWNER, to: '/salon/closures',
    words: { more: TAB_MORE, salon: TAB_SALON, closed: 'profile.linkClosures', closeOn: 'day.closeSalonOn', openAgain: 'day.openAgain' } },
  { id: 'addBarbers', group: 'setup', roles: OWNER_HELPER, to: '/setup/staff', ownerChanges: true,
    words: { salon: TAB_SALON, barbers: 'setup.barbersTitle', add: 'setup.addBarber', addMe: 'setup.addMe' } },
  { id: 'barberHours', group: 'setup', roles: OWNER_HELPER, to: '/setup/staff', ownerChanges: true,
    words: {
      salon: TAB_SALON, barbers: 'setup.barbersTitle', weekly: 'setup.weeklyHours', useSalon: 'setup.useSalonHours',
      saveHours: 'setup.saveBarberHours', services: 'setup.servicesHeDoes', saveServices: 'setup.saveServices',
    } },
  { id: 'inviteBarber', group: 'setup', roles: OWNER, to: '/setup/staff',
    words: { salon: TAB_SALON, barbers: 'setup.barbersTitle', signIn: 'setup.hisSignIn', invite: 'setup.inviteHim' } },
  { id: 'inviteHelper', group: 'setup', roles: OWNER, to: '/team',
    words: { more: TAB_MORE, team: 'profile.linkTeam', invite: 'team.inviteHelper', send: 'team.sendInvitation' } },
  { id: 'rules', group: 'setup', roles: OWNER_HELPER, to: '/setup/rules', ownerChanges: true,
    words: { salon: TAB_SALON, rules: 'setup.rulesTitle', notice: 'setup.noticeLabel', ahead: 'setup.aheadLabel', save: 'common.save' } },

  { id: 'newBooking', group: 'day', roles: ALL, to: '/salon/bookings',
    words: { today: TAB_TODAY, bookings: TAB_BOOKINGS, comingUp: 'day.comingUp' } },
  { id: 'notifications', group: 'day', roles: ALL, to: '/more',
    words: { more: TAB_MORE, today: TAB_TODAY, row: 'profile.bookingNotifications', turnOn: 'profile.turnOn' } },
  { id: 'startCode', group: 'day', roles: ALL, to: '/salon/day', words: { today: TAB_TODAY, start: 'day.start' } },
  { id: 'walkIn', group: 'day', roles: ALL, to: '/salon/walk-in',
    words: { today: TAB_TODAY, add: 'day.addWalkIn', more: TAB_MORE, team: 'profile.linkTeam' } },
  { id: 'doneEarly', group: 'day', roles: ALL, to: '/salon/day',
    words: { today: TAB_TODAY, doneEarly: 'day.doneEarly', noShow: 'day.markNoShow' } },
  { id: 'reassign', group: 'day', roles: OWNER_HELPER, to: '/salon/day',
    words: { today: TAB_TODAY, give: 'day.giveToAnother', cancel: 'day.cancelBooking' } },
  { id: 'pause', group: 'day', roles: OWNER_HELPER, to: '/salon/day',
    words: { today: TAB_TODAY, pause: 'day.pauseLink', hour: 'day.pauseHour', rest: 'day.pauseToday', tomorrow: 'day.pauseTomorrow', resume: 'day.resume' } },
  // A barber's break is added from his own column on Today (the break screen needs to know it's his)
  { id: 'breaks', group: 'day', roles: ALL, to: (role) => (role === 'BARBER' ? '/salon/day' : '/salon/time-off'),
    words: { today: TAB_TODAY, add: 'day.addBreak', save: 'day.saveBreak' } },
  { id: 'leave', group: 'day', roles: OWNER, to: '/salon/time-off',
    words: { today: TAB_TODAY, add: 'day.addBreak', leave: 'day.leaveWholeDays', save: 'day.saveLeave' } },

  { id: 'offers', group: 'customers', roles: OWNER_HELPER, to: '/salon/offers', ownerChanges: true,
    words: { more: TAB_MORE, salon: TAB_SALON, offers: 'profile.linkOffers', add: 'offers.newOffer', preview: 'offers.seePreview', publish: 'offers.publishAndSend' } },
  { id: 'ratings', group: 'customers', roles: OWNER_HELPER, to: '/salon/ratings',
    words: { more: TAB_MORE, salon: TAB_SALON, ratings: 'profile.linkRatings' } },
  // Where it is (More, and the Salon tab for the owner and helpers) and its buttons, in the screens' own words
  { id: 'share', group: 'customers', roles: ALL, to: '/salon/share',
    words: { more: TAB_MORE, share: 'share.moreLink', whatsapp: 'share.whatsapp', poster: 'share.download' } },
  { id: 'customersSee', group: 'customers', roles: ALL, to: '/salon/info', words: { info: 'setup.infoTitle', salon: TAB_SALON } },

  { id: 'subscription', group: 'account', roles: ALL, to: '/subscription',
    words: { more: TAB_MORE, subscription: 'profile.subscription', autoPay: 'subscription.setUpAutoPay' } },
  { id: 'details', group: 'account', roles: OWNER, to: '/setup/details',
    words: { salon: TAB_SALON, details: 'setup.rowDetails', edit: 'common.edit', more: TAB_MORE } },
  { id: 'photos', group: 'account', roles: OWNER, to: '/setup/photos', words: { salon: TAB_SALON, photos: 'setup.rowPhotos' } },
  { id: 'licence', group: 'account', roles: OWNER, to: '/setup/document',
    words: { salon: TAB_SALON, licence: 'setup.rowLicence', pick: 'shop.licenceTakePhotoOrPdf' } },
  { id: 'address', group: 'account', roles: OWNER, to: '/setup/details',
    words: { salon: TAB_SALON, details: 'setup.rowDetails', request: 'profile.requestAddressChange' } },
  { id: 'phone', group: 'account', roles: ALL, to: '/profile/phone', words: { more: TAB_MORE, mobile: 'profile.mobile', change: 'common.change' } },
  { id: 'email', group: 'account', roles: ALL, to: '/profile/email', words: { more: TAB_MORE, email: 'profile.email', change: 'common.change' } },
  { id: 'language', group: 'account', roles: ALL, to: '/more', words: { more: TAB_MORE, language: 'language.title' } },
  { id: 'handover', group: 'account', roles: OWNER, to: '/shop/handover',
    words: { more: TAB_MORE, handOver: 'profile.handOverShop', send: 'shop.handoverSend' } },
  { id: 'close', group: 'account', roles: OWNER, to: '/shop/close', words: { more: TAB_MORE, close: 'profile.closeShop' } },
  { id: 'leaveSalon', group: 'account', roles: ['HELPER', 'BARBER'], to: '/more', words: { more: TAB_MORE, leave: 'profile.leaveShop' } },
]

/**
 * Before the salon is live: what owners ask while registering, and what helpers and barbers ask about joining (an
 * owner with a draft; a helper or barber waiting for approval; anyone with no shop yet, on the start screen). Their
 * screens are the registration steps and the start ("/" takes each person to theirs).
 */
export const EARLY_HOWTOS: readonly HowTo[] = [
  { id: 'regVideo', group: 'registering', roles: ALL, to: '/register/photos' },
  { id: 'regLicence', group: 'registering', roles: ALL, to: '/register/photos' },
  { id: 'regPin', group: 'registering', roles: ALL, to: '/register', words: { useLocation: 'register.useMyLocation' } },
  { id: 'regAfter', group: 'registering', roles: ALL, to: '/register/review' },
  { id: 'regSentBack', group: 'registering', roles: ALL, to: '/register/review', words: { review: 'register.reviewTitle' } },
  { id: 'joinWhere', group: 'joining', roles: ALL, to: '/', words: { accept: 'shop.accept' } },
  { id: 'joinWrong', group: 'joining', roles: ALL, to: '/', words: { leave: 'profile.leaveShop', more: TAB_MORE } },
  { id: 'joinOwnerNotOn', group: 'joining', roles: ALL, to: '/' },
]

/**
 * A kirana's answers (kirana switch on only: off, no kirana reaches the app), in the screens' own words: its tabs,
 * the setup card, the counter's, products', bills' and khata's buttons. Owner-only screens (team, licences: the
 * routes' RoleOnly in kiranaRoutes.tsx) only for the owner; the khata limit is the owner's to change.
 */
const K_TAB_COUNTER = 'app.tabCounter'
const K_TAB_PRODUCTS = 'app.tabProducts'
const K_TAB_BILLS = 'app.tabBills'
export const KIRANA_HOWTOS: readonly HowTo[] = [
  { id: 'kSetup', group: 'kiranaSetup', roles: ALL, to: '/kirana/setup',
    words: { counter: K_TAB_COUNTER, setUp: 'kiranaSetup.stripStart', photograph: 'kiranaSetup.nextPhotographList', finish: 'kiranaSetup.finish' } },
  { id: 'kAddProduct', group: 'kiranaSetup', roles: ALL, to: '/kirana/products/new',
    words: { products: K_TAB_PRODUCTS, add: 'kiranaProducts.addProductLink' } },
  { id: 'kCount', group: 'kiranaSetup', roles: ALL, to: '/kirana/products',
    words: { products: K_TAB_PRODUCTS, count: 'kiranaProducts.count', came: 'kiranaProducts.cameIn' } },
  { id: 'kHelper', group: 'kiranaSetup', roles: OWNER, to: '/kirana/team',
    words: { more: TAB_MORE, team: 'profile.linkKiranaTeam', invite: 'kiranaProducts.teamInviteHelper' } },
  { id: 'kLicences', group: 'kiranaSetup', roles: OWNER, to: '/kirana/licences',
    words: { more: TAB_MORE, licences: 'profile.linkKiranaLicences' } },
  { id: 'kNoBarcode', group: 'kiranaDay', roles: ALL, to: '/kirana/counter',
    words: { counter: K_TAB_COUNTER, notInList: 'kiranaCounter.itemNotInList', addToBill: 'kiranaCounter.addToBill', scan: 'kiranaCounter.scan' } },
  { id: 'kUpi', group: 'kiranaDay', roles: ALL, to: '/kirana/bills',
    words: { cash: 'kiranaCounter.upiFailedCash', bills: K_TAB_BILLS, change: 'kiranaBills.changeHowPaid' } },
  { id: 'kReturn', group: 'kiranaDay', roles: ALL, to: '/kirana/bills',
    words: { bills: K_TAB_BILLS, back: 'kiranaBills.itemsBroughtBack', save: 'kiranaBills.saveReturn' } },
  { id: 'kKhata', group: 'kiranaDay', roles: ALL, to: '/kirana/khata', ownerChanges: true,
    words: { khata: 'app.tabKhata', edit: 'common.edit', limit: 'kiranaBills.limitRupees', noLimit: 'kiranaBills.noLimit' } },
]

export function targetOf(h: HowTo, role: ShopRole): string {
  return typeof h.to === 'string' ? h.to : h.to(role)
}

/**
 * Whether the how-to answers fit this person: a salon past registration (the guard PastRegistration in guards.tsx:
 * the owner once it is submitted, everyone else once it is approved). Before that, the early answers: registering for
 * the owner of a draft, joining for a helper or barber waiting, both for someone with no shop yet (null). A kirana's
 * people have their own screens.
 */
export function howToFor(shop: Shop | null | undefined): readonly HowTo[] {
  // No shop: nothing to leave yet
  if (shop === null) return EARLY_HOWTOS.filter((h) => h.id !== 'joinWrong')
  if (!shop || shop.status === 'CLOSED') return []
  // A kirana's people from the day its counter works (submitted: the owner and helpers bill from then)
  if (shop.type === 'KIRANA') {
    return kiranaOn() && shop.status !== 'DRAFT' ? KIRANA_HOWTOS.filter((h) => h.roles.includes(shop.myRole)) : []
  }
  if (shop.type !== 'SALON') return []
  const past = shop.myRole === 'OWNER' ? shop.status !== 'DRAFT' : shop.status === 'APPROVED' || shop.status === 'SUSPENDED'
  if (!past) return EARLY_HOWTOS.filter((h) => h.group === (shop.myRole === 'OWNER' ? 'registering' : 'joining'))
  return HOWTOS.filter((h) => h.roles.includes(shop.myRole)).map(inThisApp)
}

/** The answers as the Play Store app has them: the poster is shared there (it has no Download). */
function inThisApp(h: HowTo): HowTo {
  if (!isApp()) return h
  if (h.id === 'share') return { ...h, words: { ...h.words, poster: 'share.sharePoster' } }
  return h
}

/** Lower case, accents and joining marks kept (Indian scripts need them), spaces squeezed. */
function fold(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

/** Every typed word must be in the question or the answer, in any order ("barber hours" finds "a barber's hours"). */
export function matches(query: string, text: string): boolean {
  const words = fold(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const hay = fold(text)
  return words.every((w) => hay.includes(w))
}
