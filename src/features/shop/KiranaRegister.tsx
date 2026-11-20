import { useQueryClient } from '@tanstack/react-query'
import { Suspense, lazy, useContext, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { fieldError, isApiError, messageOf } from '../../api/errors'
import { kiranaApi, kiranaKeys, useKiranaSettings, useOnline, type FssaiStatus } from '../../api/kirana'
import { ShopContext, shopApi, shopKeys, useShop } from '../../api/shop'
import type { Shop, ShopType } from '../../api/types'
import { MapBoundary } from '../../components/MapBoundary'
import { Banner, Button, Card, ErrorState, Field, Loading, Page, Sheet } from '../../components/ui'
import { t, useT } from '../../i18n'
import { cleanUpiId, upiIdLooksRight } from '../../lib/kirana'
import { loadRegisterKind, saveRegisterKind } from '../../lib/registerDraft'
import { readyForVisit } from '../../lib/salonVideo'
import { useSession } from '../../store/session'
import { licencesGap, licencesReady } from './KiranaLicences'
import { DraftExits, Line, SentBack, Steps, Thumb } from './Register'
import { shopAsk } from './TeamReasons'

const PinMap = lazy(() => import('../../components/PinMap').then((m) => ({ default: m.PinMap })))

/** The kinds, with the language keys of their title and description. */
const KINDS: { kind: ShopType; title: string; body: string }[] = [
  { kind: 'KIRANA', title: 'kiranaRegister.kindKiranaTitle', body: 'kiranaRegister.kindKiranaBody' },
  { kind: 'SALON', title: 'kiranaRegister.kindSalonTitle', body: 'kiranaRegister.kindSalonBody' },
]

/**
 * "What do you run?": the first question of registration, and where a kind picked by mistake is changed (from the
 * "Change" link on every step) any time before Submit. Before the shop is saved the answer is kept on this phone; after,
 * changing it asks first, saying what goes, then PUT /shops/me/type.
 */
export function RegisterKind() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useContext(ShopContext)
  const userId = useSession((s) => s.user?.id)
  const current = shop?.type ?? loadRegisterKind(userId)
  const [asking, setAsking] = useState<ShopType | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pick(kind: ShopType) {
    setError(null)
    if (!shop) {
      if (userId) saveRegisterKind(userId, kind)
      navigate('/register')
      return
    }
    if (kind === shop.type) {
      navigate('/')
      return
    }
    setAsking(kind)
  }

  async function change(kind: ShopType) {
    if (!shop) return
    setBusy(true)
    setError(null)
    try {
      const latest = qc.getQueryData<Shop>(shopKeys.mine) ?? shop
      qc.setQueryData(shopKeys.mine, await shopApi.changeType(latest.version, kind))
      // A kirana's screens (its UPI ID) and a salon's read different things: nothing old is shown for the new kind
      void qc.invalidateQueries({ queryKey: kiranaKeys.all })
      setAsking(null)
      // Home sends the owner on to the first step the new kind still needs
      navigate('/', { replace: true })
    } catch (e) {
      setAsking(null)
      setError(messageOf(e))
      if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'WRONG_STATUS')) await qc.invalidateQueries({ queryKey: shopKeys.mine })
    } finally {
      setBusy(false)
    }
  }

  // A Shops and Establishments certificate is a kirana's only: it comes off a shop becoming a salon
  const losingCertificate = asking === 'SALON' && shop?.registrationDocType === 'SHOPS_ESTABLISHMENT'
  const keepsLicence = Boolean(shop?.registrationDocFileId) && !losingCertificate
  return (
    <Page back={shop ? '/' : '/start'} title={t('kiranaRegister.whatDoYouRun')}>
      <p className="text-muted">
        {shop
          ? t('kiranaRegister.kindIntroSaved', { name: shop.name })
          : t('kiranaRegister.kindIntroNew')}
      </p>
      {shop && shopAsk(shop) && <SentBack ask={shopAsk(shop)!} shop={shop} />}
      <div className="flex flex-col gap-3" role="group" aria-label={t('kiranaRegister.whatDoYouRun')}>
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => pick(k.kind)}
            aria-pressed={current === k.kind}
            className={`flex flex-col gap-1 rounded-2xl border p-4 text-left hover:bg-raised ${current === k.kind ? 'border-brand bg-brand/10' : 'border-line bg-surface'}`}
          >
            <span className="text-lg font-semibold">
              {t(k.title)}
              {current === k.kind && <span className="ml-2 text-sm font-normal text-link">{t('kiranaRegister.kindChosen')}</span>}
            </span>
            <span className="text-sm text-muted">{t(k.body)}</span>
          </button>
        ))}
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <Sheet open={asking !== null} title={asking === 'KIRANA' ? t('kiranaRegister.changeToKiranaTitle') : t('kiranaRegister.changeToSalonTitle')} onClose={() => !busy && setAsking(null)}>
        <div className="flex flex-col gap-3">
          <p>{t('kiranaRegister.changeKeeps')}</p>
          {keepsLicence && (
            <p className="text-sm text-muted">
              {asking === 'KIRANA' ? t('kiranaRegister.changeLicenceStaysKirana') : t('kiranaRegister.changeLicenceStaysSalon')}
            </p>
          )}
          {losingCertificate && <p className="text-warn">{t('kiranaRegister.changeRemovesCertificate')}</p>}
          {asking === 'KIRANA' ? (
            <p className="text-sm text-muted">{t('kiranaRegister.changeNextKirana')}</p>
          ) : (
            <p className="text-sm text-muted">{t('kiranaRegister.changeNextSalon')}</p>
          )}
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(null)}>
            {t('kiranaRegister.changeKeep')}
          </Button>
          <Button busy={busy} onClick={() => asking && change(asking)}>
            {asking === 'KIRANA' ? t('kiranaRegister.changeYesKirana') : t('kiranaRegister.changeYesSalon')}
          </Button>
        </div>
      </Sheet>
    </Page>
  )
}

/**
 * The shop's UPI ID (registration's step 3 for a kirana, and its settings later): walk-in customers pay to it by
 * scanning the QR the counter shows. Owner only; the backend keeps it without spaces, in lower case.
 */
export function UpiIdForm({ onSaved, saveLabel }: { onSaved: (upiId: string) => void; saveLabel: string }) {
  const t = useT()
  const qc = useQueryClient()
  const settings = useKiranaSettings()
  const [typed, setTyped] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (settings.isPending) return <Loading />
  if (settings.isError && !settings.data) return <ErrorState message={messageOf(settings.error)} onRetry={() => settings.refetch()} />
  const saved = settings.data?.upiId ?? ''
  const value = typed ?? saved
  const cleaned = cleanUpiId(value)
  const problem = !cleaned
    ? t('kiranaRegister.upiEnter')
    : !upiIdLooksRight(cleaned)
      ? t('kiranaRegister.upiLooksLike', { format: 'name@bank', example: 'sharmastore@okhdfcbank' })
      : null

  async function save() {
    setTouched(true)
    setError(null)
    if (problem) return
    if (cleaned === saved) {
      onSaved(saved)
      return
    }
    setBusy(true)
    try {
      const next = await kiranaApi.setUpiId(cleaned)
      qc.setQueryData(kiranaKeys.settings, next)
      setTyped(null)
      onSaved(next.upiId ?? cleaned)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const shown = (touched && problem) || fieldError(error, 'upiId')
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <Field
          id="upi-id"
          label={t('kiranaRegister.upiLabel')}
          hint={t('kiranaRegister.upiHint')}
          value={value}
          onChange={(e) => {
            setTyped(e.target.value)
            setError(null)
          }}
          onBlur={() => setTouched(true)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          maxLength={120}
          placeholder="sharmastore@okhdfcbank"
          error={shown || undefined}
        />
        {cleaned && !problem && cleaned !== value.trim() && <p className="text-sm text-muted">{t('kiranaRegister.upiSavedAs', { upiId: cleaned })}</p>}
        <p className="text-sm text-muted">{t('kiranaRegister.upiHowPaid')}</p>
      </Card>
      {error !== null && !fieldError(error, 'upiId') && !isApiError(error, 'EDIT_LOCKED') && <Banner tone="bad">{messageOf(error)}</Banner>}
      <Button busy={busy} onClick={save}>
        {saveLabel}
      </Button>
    </div>
  )
}

/** Step 3 of a kirana's registration: its UPI ID. */
export function RegisterUpi() {
  const t = useT()
  const navigate = useNavigate()
  const shop = useShop()
  const location = useLocation()
  const fromReview = new URLSearchParams(location.search).get('from') === 'review'
  return (
    <Page back={fromReview ? '/register/review' : '/register/licences'} title={t('kiranaRegister.upiTitle')}>
      <Steps at={4} />
      {shopAsk(shop) && <SentBack ask={shopAsk(shop)!} shop={shop} />}
      <UpiIdForm saveLabel={fromReview ? t('kiranaRegister.saveBackToReview') : t('kiranaRegister.saveAndContinue')} onSaved={() => navigate('/register/review')} />
    </Page>
  )
}

/** A kirana's last step: check everything and ask for the field team's visit. */
export function KiranaReview() {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const shop = useShop()
  const settings = useKiranaSettings()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const sending = useRef(false)
  const photos = Boolean(shop.ownerPhotoFileId && shop.shopPhotoFileId)
  const video = Boolean(shop.shopVideoFileId)
  const upiId = settings.data?.upiId ?? null
  const papers = licencesReady(settings.data, online.data?.fssai)
  const ready = readyForVisit(shop) && Boolean(upiId) && papers
  const sellsFood = settings.data?.sellsFood ?? null
  const fssai = online.data?.fssai

  async function submit() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      qc.setQueryData(shopKeys.mine, await shopApi.submit(shop.version))
      navigate('/', { replace: true })
    } catch (e) {
      setAsking(false)
      setError(messageOf(e))
      if (isApiError(e, 'SHOP_CHANGED') || isApiError(e, 'PHOTOS_REQUIRED') || isApiError(e, 'WRONG_STATUS') || isApiError(e, 'REGISTRATION_INCOMPLETE')) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: shopKeys.mine }),
          qc.invalidateQueries({ queryKey: kiranaKeys.settings }),
          qc.invalidateQueries({ queryKey: kiranaKeys.online }),
        ])
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const address = `${shop.addressLine}, ${shop.area}, ${shop.city} ${shop.pincode}`
  return (
    <Page back="/register/upi" title={t('kiranaRegister.reviewTitle')}>
      <Steps at={5} />
      {shopAsk(shop) && <SentBack ask={shopAsk(shop)!} shop={shop} />}
      <Card className="flex flex-col gap-3">
        <Line label={t('kiranaRegister.reviewShop')} value={shop.name} />
        <Line label={t('kiranaRegister.reviewOwner')} value={shop.ownerName} />
        <Line label={t('kiranaRegister.reviewAddress')} value={address} />
        <Line label="GSTIN" value={shop.gstin ?? t('kiranaRegister.reviewGstinNone')} />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{t('kiranaRegister.reviewPin')}</p>
          <MapBoundary>
            <Suspense fallback={<Loading label={t('kiranaRegister.reviewLoadingMap')} />}>
              <PinMap lat={shop.latitude} lng={shop.longitude} />
            </Suspense>
          </MapBoundary>
        </div>
        <Link to="/register?from=review" className="text-sm text-link underline">
          {t('kiranaRegister.reviewEditDetails')}
        </Link>
      </Card>
      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span>{photos ? t('kiranaRegister.reviewPhotosAdded') : t('kiranaRegister.reviewPhotosMissing')}</span>
          <Link to="/register/photos?from=review" className="text-sm text-link underline">
            {photos ? t('common.change') : t('common.add')}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Thumb fileId={shop.ownerPhotoFileId} label={t('kiranaRegister.reviewYourPhoto')} />
          <Thumb fileId={shop.shopPhotoFileId} label={t('kiranaRegister.reviewShopFront')} />
        </div>
      </Card>
      <Card className="flex items-center justify-between">
        <span>{video ? t('kiranaRegister.reviewVideoAdded') : t('kiranaRegister.reviewVideoMissing')}</span>
        <Link to="/register/photos?from=review" className="text-sm text-link underline">
          {video ? t('common.change') : t('common.add')}
        </Link>
      </Card>
      <Card className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{t('kiranaRegister.licencesTitle')}</span>
          <Link to="/register/licences?from=review" className="shrink-0 text-sm text-link underline">
            {papers ? t('common.change') : t('common.add')}
          </Link>
        </div>
        <p className="text-sm">
          {t('kiranaRegister.reviewSellsFood', {
            answer: settings.isPending
              ? '…'
              : sellsFood === null
                ? t('kiranaRegister.reviewNotAnswered')
                : sellsFood
                  ? t('kiranaRegister.reviewYes')
                  : t('kiranaRegister.reviewNo'),
          })}
        </p>
        {sellsFood && (
          <p className="text-sm break-words">
            {!fssai || fssai.status === 'NONE'
              ? t('kiranaRegister.reviewFssaiMissing')
              : t('kiranaRegister.reviewFssai', { number: fssai.number ?? '', status: fssaiWords(fssai.status) })}
          </p>
        )}
        <p className="text-sm text-muted">
          {shop.registrationDocFileId
            ? t('kiranaRegister.reviewShopLicence', {
                doc: shop.registrationDocType === 'SHOPS_ESTABLISHMENT' ? t('kiranaRegister.reviewDocShops') : t('kiranaRegister.reviewDocTrade'),
                status: licenceWords(shop),
              })
            : t('kiranaRegister.reviewShopLicenceNone')}
        </p>
      </Card>
      <Card className="flex items-center justify-between gap-2">
        <span className="min-w-0 break-words">
          {settings.isPending
            ? t('kiranaRegister.reviewUpiId', { upiId: '…' })
            : upiId
              ? t('kiranaRegister.reviewUpiId', { upiId })
              : t('kiranaRegister.reviewUpiIdMissing')}
        </span>
        <Link to="/register/upi?from=review" className="shrink-0 text-sm text-link underline">
          {upiId ? t('common.change') : t('common.add')}
        </Link>
      </Card>
      {settings.isError && !settings.data && (
        <Banner tone="bad">
          {t('kiranaRegister.upiReadFailed')} {messageOf(settings.error)}{' '}
          <button type="button" className="underline" onClick={() => void settings.refetch()}>
            {t('common.retry')}
          </button>
        </Banner>
      )}
      <p className="text-sm text-muted">{t('kiranaRegister.reviewAfterSubmit')}</p>
      {error && <Banner tone="bad">{error}</Banner>}
      <Button disabled={!ready} onClick={() => setAsking(true)}>
        {t('kiranaRegister.submitForVisit')}
      </Button>
      {!ready && !settings.isPending && (
        <p className="text-center text-sm text-muted">
          {!photos
            ? t('kiranaRegister.gapPhotos')
            : !video
              ? t('kiranaRegister.gapVideo')
              : !papers
                ? licencesGap(settings.data, fssai)
                : t('kiranaRegister.gapUpiId')}
        </p>
      )}
      <Sheet open={asking} title={t('kiranaRegister.submitSheetTitle')} onClose={() => !busy && setAsking(false)}>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 rounded-xl border border-line bg-raised px-4 py-3 text-sm">
            <li className="font-semibold">{shop.name}</li>
            <li className="text-muted">{address}</li>
            <li className="break-words">{t('kiranaRegister.reviewUpiId', { upiId: upiId ?? '' })}</li>
            <li>{sellsFood ? t('kiranaRegister.submitSellsFood', { number: fssai?.number ?? '' }) : t('kiranaRegister.submitSellsNoFood')}</li>
          </ul>
          <p className="text-muted">{t('kiranaRegister.submitWhatNext', { name: shop.name })}</p>
          <p className="text-sm text-muted">{t('kiranaRegister.submitFixFirst')}</p>
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
            {t('kiranaRegister.submitNotYet')}
          </Button>
          <Button busy={busy} onClick={submit}>
            {t('kiranaRegister.submitYes')}
          </Button>
        </div>
      </Sheet>
      <DraftExits name={shop.name} />
    </Page>
  )
}

function fssaiWords(status: FssaiStatus): string {
  return t(
    status === 'CHECKING'
      ? 'kiranaRegister.statusBeingChecked'
      : status === 'VERIFIED'
        ? 'kiranaRegister.statusVerified'
        : status === 'REJECTED'
          ? 'kiranaRegister.statusFssaiRejected'
          : 'kiranaRegister.statusMissing',
  )
}

function licenceWords(shop: Shop): string {
  return t(
    shop.licenceCheck === 'PASSED'
      ? 'kiranaRegister.statusChecked'
      : shop.licenceCheck === 'FAILED'
        ? 'kiranaRegister.statusNotAccepted'
        : 'kiranaRegister.statusBeingChecked',
  )
}
