import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from 'react-router'
import { useSalonHours, useServices } from '../../api/salon'
import { useKiranaSettings, useOnline } from '../../api/kirana'
import { licencesReady } from './KiranaLicences'
import { useShop } from '../../api/shop'
import { Button, Card, EmptyState, Loading, Page } from '../../components/ui'
import { CopyCode } from '../../components/CopyCode'
import { useT } from '../../i18n'
import { readyForVisit } from '../../lib/salonVideo'
import { signOutHere } from '../profile/signOut'
import { HandoverOffers } from './HandoverOffers'
import { InviteOffers } from './InviteOffers'
import { useRecheckShop } from './ShopGate'

/** Where "/" goes: registration for a draft owner, a wait screen for staff of a salon not live yet, else today. */
export function Home() {
  const shop = useShop()
  const kirana = shop.type === 'KIRANA'
  if (shop.myRole === 'OWNER' && shop.status === 'DRAFT') return kirana ? <ResumeKiranaRegistration /> : <ResumeRegistration />
  if (shop.myRole !== 'OWNER' && (shop.status === 'DRAFT' || (shop.status === 'PENDING_VISIT' && !kirana))) return <NotLiveYet />
  return <Navigate to={kirana ? '/kirana/counter' : '/salon/day'} replace />
}

/**
 * A kirana's owner back to his registration: the first step not done yet (photos and video, licences, UPI ID), else
 * the review.
 */
function ResumeKiranaRegistration() {
  const shop = useShop()
  const settings = useKiranaSettings()
  const online = useOnline()
  if (shop.statusReason) return <Navigate to="/register/review" replace />
  if (!readyForVisit(shop)) return <Navigate to="/register/photos" replace />
  if (settings.isError || online.isError) return <Navigate to="/register/review" replace />
  if (!settings.data || !online.data) return <Loading />
  if (!licencesReady(settings.data, online.data.fssai)) return <Navigate to="/register/licences" replace />
  if (!settings.data.upiId) return <Navigate to="/register/upi" replace />
  return <Navigate to="/register/review" replace />
}

/**
 * An owner coming back to a registration he started: straight to the first step not done yet (photos and video,
 * services, hours), or the review when all are (also after the field team sent it back: it shows their reason and
 * links to every step), instead of step 1 and tapping Continue through the rest.
 */
function ResumeRegistration() {
  const shop = useShop()
  const photosDone = readyForVisit(shop)
  const services = useServices()
  const hours = useSalonHours()
  // Sent back by the field team: the review shows their reason, with a link to each step
  if (shop.statusReason) return <Navigate to="/register/review" replace />
  if (!photosDone) return <Navigate to="/register/photos" replace />
  if (services.isError || hours.isError) return <Navigate to="/register/review" replace />
  if (!services.data || !hours.data) return <Loading />
  if (!services.data.some((s) => s.active)) return <Navigate to="/register/services" replace />
  if (hours.data.days.length === 0) return <Navigate to="/register/hours" replace />
  return <Navigate to="/register/review" replace />
}

/** A helper or barber of a salon the field team hasn't approved yet: nothing to do until then. */
function NotLiveYet() {
  const t = useT()
  const shop = useShop()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const recheck = useRecheckShop()
  return (
    <Page title={shop.name}>
      <HandoverOffers />
      <InviteOffers />
      <EmptyState
        title={
          shop.status === 'PENDING_VISIT'
            ? t('shop.notLiveWaitingTitle')
            : t(shop.type === 'KIRANA' ? 'shop.notLiveTitleKirana' : 'shop.notLiveTitle')
        }
        body={
          shop.status === 'PENDING_VISIT'
            ? t(shop.type === 'KIRANA' ? 'shop.notLiveRegisteredBodyKirana' : 'shop.notLiveRegisteredBody', { ownerName: shop.ownerName, name: shop.name })
            : t(shop.type === 'KIRANA' ? 'shop.notLiveRegisteringBodyKirana' : 'shop.notLiveRegisteringBody', { ownerName: shop.ownerName, name: shop.name })
        }
        action={<Button onClick={() => recheck()}>{t('shop.checkAgain')}</Button>}
      />
      <Button variant="ghost" onClick={() => signOutHere(qc).then(() => navigate('/signin', { replace: true }))}>
        {t('shop.signOut')}
      </Button>
      <Link to="/help" className="py-2 text-center text-sm text-link underline">
        {t('shop.needHelpWriteSupport')}
      </Link>
      <Link to="/profile/delete" className="py-2 text-center text-sm text-bad underline">
        {t('shop.deleteMyAccount')}
      </Link>
    </Page>
  )
}

/** On Today for an owner waiting for the visit: what happens next, and the shop code to quote. */
export function WaitingForVisit() {
  const t = useT()
  const shop = useShop()
  return (
    <Card className="flex flex-col gap-2 border-brand/40">
      <p className="text-lg font-semibold">{t('shop.visitNextTitle')}</p>
      <p className="text-sm text-muted">
        {t(shop.type === 'KIRANA' ? 'shop.visitNextBodyKirana' : 'shop.visitNextBody', { name: shop.name })}
      </p>
      <p className="text-sm">
        {t('shop.yourShopCode')} <span className="font-bold tracking-wide">{shop.shopCode}</span>{' '}
        <CopyCode code={String(shop.shopCode)} />
      </p>
      <p className="text-xs text-muted">{t('shop.quoteShopCode')}</p>
    </Card>
  )
}
