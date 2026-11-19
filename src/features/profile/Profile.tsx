import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { useSubscription } from '../../api/subscription'
import { summary as subscriptionSummary } from '../subscription/text'
import { Link, useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { shopApi, useAddressRequest, useShop } from '../../api/shop'
import { can } from '../../lib/roles'
import { fieldError, messageOf } from '../../api/errors'
import { Banner, Button, Card, Field, Loading, Page, Sheet } from '../../components/ui'
import { CopyCode } from '../../components/CopyCode'
import { MapBoundary } from '../../components/MapBoundary'
import { formatPhone } from '../../lib/phone'
import { takePhoneChanged } from '../../lib/phoneMoved'
import { SUPPORT_EMAIL } from '../../lib/config'
import { LegalLinks } from '../legal/LegalPage'
import { useSession } from '../../store/session'
import { NotificationsRow } from './Notifications'
import { licenceSummary } from '../shop/RegistrationDoc'
import { signOutHere } from './signOut'
import { useT } from '../../i18n'
import { LanguagePicker } from '../../i18n/LanguagePicker'

/** The map library is big: loaded only when the owner opens the pin. */
const PinMap = lazy(() => import('../../components/PinMap').then((m) => ({ default: m.PinMap })))

/** More: the person's profile, the salon's other screens, help and signing out. */
export function Profile() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [phoneChanged] = useState(takePhoneChanged)
  const user = useSession((s) => s.user)!
  const shop = useShop()
  const rights = can(shop.myRole)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const setUser = useSession((s) => s.setUser)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const owner = shop.myRole === 'OWNER'
  const addressAsked = useAddressRequest(owner && Boolean(shop.addressLocked))

  async function saveName() {
    setBusy(true)
    setError(null)
    try {
      setUser(await authApi.rename(name.trim()))
      setEditing(false)
    } catch (e) {
      setError(fieldError(e, 'name') ?? messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const [outError, setOutError] = useState<string | null>(null)

  async function out(everywhere: boolean) {
    setBusy(true)
    setOutError(null)
    try {
      await signOutHere(qc, { everywhere })
      navigate('/signin', { replace: true })
    } catch (e) {
      // Not signed out anywhere: say so, so nobody believes a lost phone is signed out
      setOutError(t('profile.signOutAllFailed', { message: messageOf(e) }))
      setBusy(false)
    }
  }

  async function leave() {
    setBusy(true)
    setLeaveError(null)
    try {
      await shopApi.leave()
      // Out of the shop: this session's token still names it, so start again with a fresh sign-in.
      await signOutHere(qc)
      navigate('/signin', { replace: true })
    } catch (e) {
      setLeaveError(messageOf(e))
      setBusy(false)
    }
  }

  const links = [
    rights.team && { to: '/team', text: t('profile.linkTeam') },
    rights.closures && { to: '/salon/closures', text: t('profile.linkClosures') },
    rights.seeSetup && { to: '/salon/offers', text: t('profile.linkOffers') },
    rights.seeSetup && { to: '/salon/ratings', text: t('profile.linkRatings') },
    !rights.seeSetup && { to: '/salon/info', text: t('profile.linkSalonInfo') },
    { to: '/notifications', text: t('profile.linkMessages') },
  ].filter(Boolean) as Array<{ to: string; text: string }>

  return (
    <Page title={t('profile.title')}>
      {phoneChanged && (
        <Banner tone="good">
          {t('profile.phoneChanged', { phone: formatPhone(phoneChanged) })}
        </Banner>
      )}
      {/* The salon as registered, in full: what the owner can check and, if wrong, change in one tap */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-semibold break-words">{shop.name}</p>
          {owner && (
            <Link to="/setup/details" state={{ from: '/more', edit: true }} className="shrink-0 text-sm text-link" aria-label={t('profile.editSalonAria')}>
              {t('common.edit')}
            </Link>
          )}
        </div>
        <p className="text-sm text-muted break-words">
          {shop.addressLine}, {shop.area}, {shop.city} {shop.pincode}
        </p>
        {owner && shop.addressLocked && shop.status !== 'SUSPENDED' && shop.status !== 'CLOSED' && (
          <p className="text-sm break-words">
            {addressAsked.data?.status === 'PENDING' && (
              <span className="text-muted">
                {t('profile.addressWaiting', { addressLine: addressAsked.data.addressLine, area: addressAsked.data.area })}{' '}
              </span>
            )}
            <Link to="/setup/address" state={{ from: '/more' }} className="text-link underline">
              {addressAsked.data?.status === 'PENDING' ? t('profile.seeAddressRequest') : t('profile.requestAddressChange')}
            </Link>
          </p>
        )}
        <p className="text-sm text-muted break-words">{t('profile.owner', { name: shop.ownerName })}</p>
        {owner && (
          <p className="text-sm break-words">
            <Link to="/setup/document" state={{ from: '/more' }} className="text-link underline">
              {t('profile.tradeLicence', { summary: licenceSummary(shop) })}
            </Link>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>{t('profile.shopCode', { code: String(shop.shopCode) })}</span>
          <CopyCode code={String(shop.shopCode)} />
          <span>{owner ? t('profile.youAreOwner') : shop.myRole === 'HELPER' ? t('profile.youAreHelper') : t('profile.youAreBarber')}</span>
        </div>
        {shop.recheckSince && (
          <p className="text-sm text-muted">{t('profile.recheck')}</p>
        )}
        {owner && (
          <p className="flex flex-wrap gap-x-4 text-sm">
            <Link to="/setup/photos" state={{ from: '/more' }} className="text-link underline">
              {t('profile.photosAndVideo')}
            </Link>
          </p>
        )}
        <button type="button" className="self-start text-sm text-link underline" aria-expanded={showPin} onClick={() => setShowPin((v) => !v)}>
          {showPin ? t('profile.hideMap') : t('profile.seePin')}
        </button>
        {showPin && (
          <MapBoundary>
            <Suspense fallback={<Loading label={t('profile.loadingMap')} />}>
              <PinMap lat={shop.latitude} lng={shop.longitude} />
            </Suspense>
          </MapBoundary>
        )}
      </Card>

      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4 hover:bg-raised">
              {l.text}
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Card className="flex flex-col gap-4">
        {editing ? (
          <div className="flex flex-col gap-3">
            <Field id="profile-name" label={t('profile.yourName')} hint={t('profile.yourNameHint')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            {error && <Banner tone="bad">{error}</Banner>}
            <div className="flex gap-2">
              <Button busy={busy} disabled={name.trim().length < 2} onClick={saveName} className="flex-1">
                {t('common.save')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setName(user.name ?? '')
                  setError(null)
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Row label={t('profile.yourName')} value={user.name ?? ''} action={<button type="button" className="text-link" aria-label={t('profile.editNameAria')} onClick={() => setEditing(true)}>{t('common.edit')}</button>} />
        )}
        <Row
          label={t('profile.mobile')}
          value={`+91 ${formatPhone(user.phone)}`}
          action={
            <Link to="/profile/phone" className="text-link" aria-label={t('profile.changeMobileAria')}>
              {t('common.change')}
            </Link>
          }
        />
        <Row
          label={t('profile.email')}
          value={user.email ?? ''}
          action={
            <Link to="/profile/email" className="text-link">
              {t('common.change')}
            </Link>
          }
        />
      </Card>

      <Card>
        <NotificationsRow />
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="font-medium">{t('language.title')}</p>
        <LanguagePicker />
        <p className="text-xs text-muted">{t('language.profileHint')}</p>
      </Card>

      <SubscriptionRow />

      <Card className="flex flex-col gap-1">
        <p className="font-medium">{t('profile.needHelp')}</p>
        <p className="text-sm text-muted">
          {t('profile.needHelpBody')}
        </p>
        <Link to="/help" className="text-sm text-link underline">
          {t('profile.writeToSupport')}
        </Link>
        <Link to="/help/requests" state={{ from: true }} className="text-sm text-link underline">
          {t('profile.myRequests')}
        </Link>
        <p className="text-sm text-muted">
          {t('profile.orEmailBefore')}{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link underline [overflow-wrap:anywhere]">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" busy={busy} onClick={() => out(false)}>
          {t('profile.signOut')}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmAll(true)}>
          {t('profile.signOutAll')}
        </Button>
        {rights.leaveShop && (
          <Button variant="ghost" className="text-bad" onClick={() => setLeaving(true)}>
            {t('profile.leaveShop', { name: shop.name })}
          </Button>
        )}
        {shop.myRole === 'OWNER' && (
          <>
            <Link to="/shop/handover" className="py-3 text-center text-sm text-link underline">
              {t('profile.handOverShop', { name: shop.name })}
            </Link>
            <Link to="/shop/close" className="py-3 text-center text-sm text-bad underline">
              {t('profile.closeShop', { name: shop.name })}
            </Link>
          </>
        )}
        {rights.deleteAccount ? (
          <Link to="/profile/delete" className="py-3 text-center text-sm text-bad underline">
            {t('profile.deleteMyAccount')}
          </Link>
        ) : (
          <p className="py-3 text-center text-sm text-muted">
            {t('profile.deleteFirstBefore')} <Link to="/shop/close" className="underline">{t('profile.deleteFirstCloseLink')}</Link> {t('profile.deleteFirstOr')}{' '}
            <Link to="/shop/handover" className="underline">{t('profile.deleteFirstHandOverLink')}</Link> {t('profile.deleteFirstAfter')}
          </p>
        )}
      </div>

      <LegalLinks />

      <Sheet open={confirmAll} title={t('profile.signOutEverywhereTitle')} onClose={() => setConfirmAll(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('profile.signOutEverywhereBody')}</p>
          {outError && <Banner tone="bad">{outError}</Banner>}
          <Button busy={busy} onClick={() => out(true)}>
            {t('profile.signOutEverywhere')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmAll(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
      <Sheet open={leaving} title={t('profile.leaveShopTitle', { name: shop.name })} onClose={() => setLeaving(false)}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t('profile.leaveShopBody')}</p>
          {leaveError && <Banner tone="bad">{leaveError}</Banner>}
          <Button variant="danger" busy={busy} onClick={leave}>
            {t('profile.leave')}
          </Button>
          <Button variant="secondary" onClick={() => setLeaving(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="break-all">{value}</p>
      </div>
      {action}
    </div>
  )
}

/** The salon's subscription in one line, the whole card opening its page (not for a suspended salon). */
function SubscriptionRow() {
  const t = useT()
  const shop = useShop()
  const sub = useSubscription()
  if (!sub.data || shop.status === 'SUSPENDED') return null
  return (
    <Link to="/subscription" aria-label={t('profile.subscription')} className="block">
      <Card className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{t('profile.subscription')}</p>
          <p className="text-sm text-muted">{subscriptionSummary(sub.data)}</p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-link">
          {t('profile.open')}
        </span>
      </Card>
    </Link>
  )
}
