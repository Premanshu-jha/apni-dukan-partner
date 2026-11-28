import { Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { CodeStep } from '../features/auth/CodeStep'
import { EmailStep } from '../features/auth/EmailStep'
import { NameStep } from '../features/auth/NameStep'
import { PhoneStep } from '../features/auth/PhoneStep'
import { RecoverStep } from '../features/auth/RecoverStep'
import { Bookings } from '../features/day/Bookings'
import { Closures } from '../features/day/Closures'
import { TimeOff } from '../features/day/TimeOff'
import { Today } from '../features/day/Today'
import { WalkIn } from '../features/day/WalkIn'
import { Inbox } from '../features/notifications/Inbox'
import { About } from '../features/legal/About'
import { Contact } from '../features/legal/Contact'
import { Delivery } from '../features/legal/Delivery'
import { Privacy } from '../features/legal/Privacy'
import { Refunds } from '../features/legal/Refunds'
import { Terms } from '../features/legal/Terms'
import { ChangeEmail } from '../features/profile/ChangeEmail'
import { ChangePhone } from '../features/profile/ChangePhone'
import { DeleteAccount } from '../features/profile/DeleteAccount'
import { Profile } from '../features/profile/Profile'
import { Rules } from '../features/setup/Rules'
import { Services } from '../features/setup/Services'
import { SetupHub } from '../features/setup/SetupHub'
import { StaffList } from '../features/setup/Staff'
import { StaffDetail } from '../features/setup/StaffDetail'
import { Home } from '../features/shop/Home'
import { RegisterDetails, RegisterHours, RegisterLayout, RegisterPhotos, RegisterReview } from '../features/shop/Register'
import { SalonDocumentPage } from '../features/shop/SalonDocument'
import { AddressRequestPage } from '../features/shop/AddressRequest'
import { EditGate } from '../features/shop/EditGate'
import { SalonInfo } from '../features/setup/SalonInfo'
import { RegisterServices } from '../features/shop/RegisterServices'
import { RegisterReady } from '../features/shop/RegisterReady'
import { SalonHoursPage } from '../features/setup/SalonHours'
import { Ratings } from '../features/ratings/Ratings'
import { NewOffer } from '../features/offers/NewOffer'
import { Offers } from '../features/offers/Offers'
import { ShopGate } from '../features/shop/ShopGate'
import { CloseShop } from '../features/shop/CloseShop'
import { HandOver } from '../features/shop/HandOver'
import { HandoverPage } from '../features/shop/HandoverOffers'
import { InvitesPage } from '../features/shop/InviteOffers'
import { Start } from '../features/shop/Start'
import { Team } from '../features/team/Team'
import { SubscriptionPage } from '../features/subscription/SubscriptionPage'
import { NeedHelp } from '../features/help/NeedHelp'
import { SharePage } from '../features/share/SharePage'
import { MyRequests, RequestDetail } from '../features/help/MyRequests'
import { helpHref } from '../features/help/links'
import { EmptyState, Page } from '../components/ui'
import { useT } from '../i18n'
import { LanguageFirst, LanguageFirstGate } from '../i18n/LanguageFirst'
import { kiranaOn } from '../lib/config'
import { FinishingProfile, KindOnly, PastRegistration, RoleOnly, SignedIn, SignedOutOnly } from './guards'
import { kiranaKindRoute, kiranaRegisterRoutes, kiranaScreenRoutes, kiranaTabRoutes } from './kiranaRoutes'
import { Bare, Shell } from './Shell'

/** A link to a screen that isn't here: home, or tell us which link it was (its address already in the message). */
function NotFound() {
  const t = useT()
  const location = useLocation()
  const path = location.pathname + location.search
  return (
    <Page back="/">
      <EmptyState
        title={t('app.notFoundTitle')}
        action={
          <div className="flex flex-col items-center gap-3">
            <Link to="/" className="inline-flex min-h-11 items-center text-link underline">
              {/* Off: the salon app's words ("Go to today"); on, "/" may be the counter */}
              {t(kiranaOn() ? 'app.notFoundStartLink' : 'app.notFoundLink')}
            </Link>
            <Link
              to={helpHref({ write: true, about: t('help.topicNotFound'), text: t('help.notFoundText', { path }) })}
              className="inline-flex min-h-11 items-center text-sm text-link underline"
            >
              {t('help.notFoundLink')}
            </Link>
          </div>
        }
      />
    </Page>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<Bare />}>
        <Route element={<SignedOutOnly />}>
          {/* The first screen on a phone where no language was chosen yet: the language, then sign-in in it */}
          <Route
            path="/signin"
            element={
              <LanguageFirstGate>
                <PhoneStep />
              </LanguageFirstGate>
            }
          />
          <Route path="/signin/code" element={<CodeStep />} />
          <Route
            path="/signin/recover"
            element={
              <LanguageFirstGate>
                <RecoverStep />
              </LanguageFirstGate>
            }
          />
        </Route>
        <Route element={<FinishingProfile />}>
          <Route path="/welcome/email" element={<EmailStep />} />
          <Route path="/welcome/name" element={<NameStep />} />
        </Route>
        {/* Choose the language: first on a new phone, and from "Change" on the sign-in screen */}
        <Route path="/language" element={<LanguageFirst />} />
        {/* Public pages: open to everyone, signed in or not (Razorpay's website check, and anyone opening a link) */}
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refunds" element={<Refunds />} />
        <Route path="/delivery" element={<Delivery />} />
        {/* Need help: for everyone, signed in or not (Call us and WhatsApp us; writing needs a verified email) */}
        <Route path="/help" element={<NeedHelp />} />
      </Route>

      <Route element={<SignedIn />}>
        <Route element={<Bare />}>
          <Route path="/start" element={<Start />} />
          {/* With or without a shop: hand-over requests to this person (the message points here), deleting the account */}
          <Route path="/handover" element={<HandoverPage />} />
          <Route path="/invites" element={<InvitesPage />} />
          <Route path="/profile/delete" element={<DeleteAccount />} />
          <Route path="/help/requests" element={<MyRequests />} />
          <Route path="/help/requests/:id" element={<RequestDetail />} />
          <Route element={<RegisterLayout needShop={false} />}>
            {/* "What do you run?" (kirana switch on only; off, every shop registered is a salon) */}
            {kiranaKindRoute()}
            {/* "Before you start": be at the shop, what to keep ready (worded for the kind picked) */}
            <Route path="/register/ready" element={<RegisterReady />} />
            <Route path="/register" element={<RegisterDetails />} />
          </Route>
          <Route element={<RegisterLayout needShop />}>
            <Route path="/register/photos" element={<RegisterPhotos />} />
            <Route element={<KindOnly kind="SALON" />}>
              <Route path="/register/services" element={<RegisterServices />} />
              <Route path="/register/hours" element={<RegisterHours />} />
            </Route>
            {kiranaRegisterRoutes()}
            <Route path="/register/review" element={<RegisterReview />} />
          </Route>
        </Route>

        <Route element={<ShopGate />}>
          <Route element={<Bare />}>
            <Route index element={<Home />} />
            {/* Shop news in the inbox points here */}
            <Route path="/shops/me" element={<Navigate to="/" replace />} />
            {/* The owner, at any status (a draft too): closing or handing over */}
            <Route element={<RoleOnly roles={['OWNER']} />}>
              {/* A verified shop closes or is handed over only after the phone code, as its details are changed */}
              <Route path="/shop/close" element={<EditGate ending><CloseShop /></EditGate>} />
              <Route path="/shop/handover" element={<EditGate ending><HandOver /></EditGate>} />
              {/* Also from a draft that was verified before (sent back): its address is the field team's too */}
              <Route path="/setup/address" element={<EditGate><AddressRequestPage /></EditGate>} />
            </Route>
          </Route>
          <Route element={<PastRegistration />}>
            <Route element={<Shell />}>
              <Route path="/more" element={<Profile />} />
              <Route element={<KindOnly kind="SALON" />}>
                <Route path="/salon/day" element={<Today />} />
                <Route path="/salon/bookings" element={<Bookings />} />
                <Route element={<RoleOnly roles={['OWNER', 'HELPER']} />}>
                  <Route path="/setup" element={<SetupHub />} />
                </Route>
              </Route>
              {/* A kirana's owner and helpers: the counter and its book (kirana switch on only) */}
              {kiranaTabRoutes()}
            </Route>
            <Route element={<Bare approvalBar />}>
              {/* A kirana's pages (kirana switch on only) */}
              {kiranaScreenRoutes()}
              <Route path="/notifications" element={<Inbox />} />
              <Route path="/profile/email" element={<ChangeEmail />} />
              <Route path="/profile/phone" element={<ChangePhone />} />
              <Route element={<RoleOnly roles={['OWNER']} />}>
                {/* What the owner gave at registration, editable any time (once verified: after a phone code) */}
                <Route path="/setup/details" element={<EditGate><RegisterDetails edit /></EditGate>} />
                <Route path="/setup/photos" element={<EditGate><RegisterPhotos edit /></EditGate>} />
              </Route>
            </Route>
            <Route element={<Bare approvalBar />}>
              <Route element={<KindOnly kind="SALON" />}>
              <Route path="/salon/walk-in" element={<WalkIn />} />
              <Route path="/salon/time-off" element={<TimeOff />} />
              {/* Anyone in the salon: hours, services, offers (a barber's only view of them) */}
              <Route path="/salon/info" element={<SalonInfo />} />
              {/* Anyone in the salon sees the subscription; only the owner pays */}
              <Route path="/subscription" element={<SubscriptionPage />} />
              {/* Anyone in the salon: its link and counter poster for customers (a barber shares with his regulars too) */}
              <Route path="/salon/share" element={<SharePage />} />
              <Route element={<RoleOnly roles={['OWNER', 'HELPER']} />}>
                <Route path="/setup/services" element={<Services />} />
                <Route path="/setup/staff" element={<StaffList />} />
                <Route path="/setup/staff/:id" element={<StaffDetail />} />
                <Route path="/setup/rules" element={<Rules />} />
                <Route path="/setup/hours" element={<SalonHoursPage />} />
                <Route path="/salon/ratings" element={<Ratings />} />
                <Route path="/salon/offers" element={<Offers />} />
              </Route>
              <Route element={<RoleOnly roles={['OWNER']} />}>
                {/* What the owner gave at registration, editable any time (once verified: after a phone code) */}
                <Route path="/setup/document" element={<EditGate><SalonDocumentPage /></EditGate>} />
                <Route path="/team" element={<Team />} />
                <Route path="/salon/closures" element={<Closures />} />
                <Route path="/salon/offers/new" element={<NewOffer />} />
              </Route>
              </Route>
            </Route>
          </Route>
        </Route>
      </Route>

      <Route element={<Bare />}>
        <Route
          path="*"
          element={<NotFound />}
        />
      </Route>
    </Routes>
  )
}
