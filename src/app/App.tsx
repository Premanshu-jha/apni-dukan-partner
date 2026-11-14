import { Link, Navigate, Route, Routes } from 'react-router'
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
import { NeedHelp } from '../features/help/NeedHelp'
import { MyRequests, RequestDetail } from '../features/help/MyRequests'
import { EmptyState, Page } from '../components/ui'
import { FinishingProfile, PastRegistration, RoleOnly, SignedIn, SignedOutOnly } from './guards'
import { Bare, Shell } from './Shell'

export function App() {
  return (
    <Routes>
      <Route element={<Bare />}>
        <Route element={<SignedOutOnly />}>
          <Route path="/signin" element={<PhoneStep />} />
          <Route path="/signin/code" element={<CodeStep />} />
          <Route path="/signin/recover" element={<RecoverStep />} />
        </Route>
        <Route element={<FinishingProfile />}>
          <Route path="/welcome/email" element={<EmailStep />} />
          <Route path="/welcome/name" element={<NameStep />} />
        </Route>
      </Route>

      <Route element={<SignedIn />}>
        <Route element={<Bare />}>
          <Route path="/start" element={<Start />} />
          {/* With or without a shop: hand-over requests to this person (the message points here), deleting the account */}
          <Route path="/handover" element={<HandoverPage />} />
          <Route path="/invites" element={<InvitesPage />} />
          <Route path="/profile/delete" element={<DeleteAccount />} />
          <Route path="/help" element={<NeedHelp />} />
          <Route path="/help/requests" element={<MyRequests />} />
          <Route path="/help/requests/:id" element={<RequestDetail />} />
          <Route element={<RegisterLayout needShop={false} />}>
            <Route path="/register" element={<RegisterDetails />} />
          </Route>
          <Route element={<RegisterLayout needShop />}>
            <Route path="/register/photos" element={<RegisterPhotos />} />
            <Route path="/register/services" element={<RegisterServices />} />
            <Route path="/register/hours" element={<RegisterHours />} />
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
              <Route path="/salon/day" element={<Today />} />
              <Route path="/salon/bookings" element={<Bookings />} />
              <Route path="/more" element={<Profile />} />
              <Route element={<RoleOnly roles={['OWNER', 'HELPER']} />}>
                <Route path="/setup" element={<SetupHub />} />
              </Route>
            </Route>
            <Route element={<Bare approvalBar />}>
              <Route path="/salon/walk-in" element={<WalkIn />} />
              <Route path="/salon/time-off" element={<TimeOff />} />
              <Route path="/notifications" element={<Inbox />} />
              <Route path="/profile/email" element={<ChangeEmail />} />
              <Route path="/profile/phone" element={<ChangePhone />} />
              {/* Anyone in the salon: hours, services, offers (a barber's only view of them) */}
              <Route path="/salon/info" element={<SalonInfo />} />
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
                <Route path="/setup/details" element={<EditGate><RegisterDetails edit /></EditGate>} />
                <Route path="/setup/photos" element={<EditGate><RegisterPhotos edit /></EditGate>} />
                <Route path="/setup/document" element={<EditGate><SalonDocumentPage /></EditGate>} />
                <Route path="/team" element={<Team />} />
                <Route path="/salon/closures" element={<Closures />} />
                <Route path="/salon/offers/new" element={<NewOffer />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Route>

      <Route element={<Bare />}>
        <Route
          path="*"
          element={
            <Page back="/">
              <EmptyState
                title="Page not found"
                action={
                  <Link to="/" className="text-link underline">
                    Go to today
                  </Link>
                }
              />
            </Page>
          }
        />
      </Route>
    </Routes>
  )
}
